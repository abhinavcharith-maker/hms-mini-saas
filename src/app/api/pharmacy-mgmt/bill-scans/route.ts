import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePharmacyManagementAuth } from "@/lib/auth";
import {
  MONTHLY_BILL_SCAN_LIMIT,
  scanPurchaseBillWithGemini,
  type ScannedBillItem,
} from "@/lib/gemini-bill-scanner";
import { getPlatformGeminiConfig } from "@/lib/platform-config";
import { recordAuditLog } from "@/lib/audit";
import { ApiError, handleApiError } from "@/lib/api-utils";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

function getCurrentMonthKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function safeParseItems(json: string): ScannedBillItem[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as ScannedBillItem[]) : [];
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const session = await requirePharmacyManagementAuth();
    const hospitalId = session.hospitalId;
    const monthKey = getCurrentMonthKey();

    const [quotaRow, activeSession] = await Promise.all([
      prisma.pharmacyBillScanQuota.findUnique({
        where: { hospitalId_monthKey: { hospitalId, monthKey } },
      }),
      prisma.pharmacyBillScanSession.findFirst({
        where: { hospitalId, status: "IN_PROGRESS" },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    const used = quotaRow?.requestCount ?? 0;
    const geminiConfig = await getPlatformGeminiConfig();

    return NextResponse.json({
      quota: {
        monthKey,
        used,
        limit: MONTHLY_BILL_SCAN_LIMIT,
        remaining: Math.max(0, MONTHLY_BILL_SCAN_LIMIT - used),
        isConfigured: geminiConfig.configured,
      },
      activeSession: activeSession
        ? {
            id: activeSession.id,
            status: activeSession.status,
            fileName: activeSession.fileName,
            items: safeParseItems(activeSession.itemsJson),
            createdAt: activeSession.createdAt,
            updatedAt: activeSession.updatedAt,
          }
        : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePharmacyManagementAuth();
    const hospitalId = session.hospitalId;
    const monthKey = getCurrentMonthKey();

    const quotaRow = await prisma.pharmacyBillScanQuota.findUnique({
      where: { hospitalId_monthKey: { hospitalId, monthKey } },
    });
    const used = quotaRow?.requestCount ?? 0;
    if (used >= MONTHLY_BILL_SCAN_LIMIT) {
      throw new ApiError(
        429,
        `Monthly Upload Bill limit reached (${MONTHLY_BILL_SCAN_LIMIT} scans per calendar month). Your quota resets next month.`,
        "MONTHLY_SCAN_QUOTA_EXCEEDED"
      );
    }

    const geminiConfig = await getPlatformGeminiConfig();
    if (!geminiConfig.configured || !geminiConfig.apiKey) {
      throw new ApiError(
        503,
        "Gemini API key is not configured yet. Ask the Super Admin to save it in Super Admin → Settings.",
        "GEMINI_NOT_CONFIGURED"
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new ApiError(400, "Please upload a purchase bill image or PDF.", "FILE_REQUIRED");
    }

    const mimeType = (file.type || "").toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new ApiError(
        400,
        "Unsupported file type. Upload a JPG, PNG, WEBP, or PDF purchase bill.",
        "UNSUPPORTED_FILE_TYPE"
      );
    }
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      throw new ApiError(
        400,
        "File must be non-empty and under 10 MB.",
        "FILE_SIZE_INVALID"
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const catalog = await prisma.pharmacyMedicine.findMany({
      where: { hospitalId },
      select: { id: true, name: true },
    });

    let extractedItems: ScannedBillItem[];
    try {
      extractedItems = await scanPurchaseBillWithGemini({
        buffer,
        mimeType,
        catalog,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to analyze purchase bill";
      if (msg === "GEMINI_API_KEY_NOT_CONFIGURED") {
        throw new ApiError(
          503,
          "Gemini API key is not configured on the server yet.",
          "GEMINI_NOT_CONFIGURED"
        );
      }
      throw new ApiError(
        502,
        "Smart bill analysis could not extract items from this file. Please try a clearer image or PDF.",
        "GEMINI_SCAN_FAILED"
      );
    }

    if (extractedItems.length === 0) {
      throw new ApiError(
        422,
        "No medicine line items were detected in the uploaded bill. Quota was not deducted.",
        "NO_ITEMS_EXTRACTED"
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Mark any older unfinished session as discarded only if empty, otherwise supersede cleanly
      const updatedQuota = await tx.pharmacyBillScanQuota.upsert({
        where: { hospitalId_monthKey: { hospitalId, monthKey } },
        update: { requestCount: { increment: 1 } },
        create: { hospitalId, monthKey, requestCount: 1 },
      });

      if (updatedQuota.requestCount > MONTHLY_BILL_SCAN_LIMIT) {
        throw new ApiError(
          429,
          `Monthly Upload Bill limit reached (${MONTHLY_BILL_SCAN_LIMIT} scans per month).`,
          "MONTHLY_SCAN_QUOTA_EXCEEDED"
        );
      }

      const createdSession = await tx.pharmacyBillScanSession.create({
        data: {
          hospitalId,
          status: "IN_PROGRESS",
          fileName: file.name.slice(0, 180) || "purchase-bill",
          itemsJson: JSON.stringify(extractedItems),
          createdByUserId: session.user.id,
        },
      });

      await recordAuditLog(
        {
          hospitalId,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "PHARMACY_BILL_SCANNED",
          referenceId: createdSession.id,
          details: `Scanned purchase bill "${createdSession.fileName}" (${extractedItems.length} medicine item(s) extracted; monthly usage ${updatedQuota.requestCount}/${MONTHLY_BILL_SCAN_LIMIT}).`,
        },
        tx
      );

      return { createdSession, updatedQuota };
    });

    return NextResponse.json(
      {
        quota: {
          monthKey,
          used: result.updatedQuota.requestCount,
          limit: MONTHLY_BILL_SCAN_LIMIT,
          remaining: Math.max(
            0,
            MONTHLY_BILL_SCAN_LIMIT - result.updatedQuota.requestCount
          ),
          isConfigured: true,
        },
        session: {
          id: result.createdSession.id,
          status: result.createdSession.status,
          fileName: result.createdSession.fileName,
          items: extractedItems,
          createdAt: result.createdSession.createdAt,
          updatedAt: result.createdSession.updatedAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
