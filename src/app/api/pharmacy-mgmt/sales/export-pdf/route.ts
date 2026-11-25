import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePharmacyManagementAuth } from "@/lib/auth";
import { parseDateRangeBounds, parseSafeTzOffset } from "@/lib/datetime";
import { buildPharmacySalesReportPdf } from "@/lib/pharmacy-pdf";
import { recordAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requirePharmacyManagementAuth();
    const hospitalId = session.hospitalId;
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const tzOffsetMinutes =
      parseSafeTzOffset(searchParams.get("tzOffset"), 0) ?? 0;

    const dateBounds =
      from || to ? parseDateRangeBounds({ from, to, tzOffsetMinutes }) : undefined;

    const andFilters: Prisma.PharmacySaleWhereInput[] = [];
    if (dateBounds && (dateBounds.gte || dateBounds.lte)) {
      andFilters.push({ soldAt: dateBounds });
    }
    if (q) {
      andFilters.push({
        OR: [
          { patientName: { contains: q } },
          { patientPhone: { contains: q } },
          { doctorName: { contains: q } },
          { saleNumber: { contains: q } },
        ],
      });
    }

    const sales = await prisma.pharmacySale.findMany({
      where: {
        hospitalId,
        ...(andFilters.length > 0 ? { AND: andFilters } : {}),
      },
      orderBy: [{ soldAt: "desc" }, { id: "desc" }],
      include: { items: true },
    });

    const pharmacyName =
      session.pharmacyAccount?.pharmacyName ??
      `${session.hospital.name} Pharmacy`;

    const pdfBuffer = await buildPharmacySalesReportPdf({
      hospitalName: session.hospital.name,
      hospitalCode: session.hospital.code,
      pharmacyName,
      generatedByName: session.user.fullName,
      filterLabel: q ? `Search "${q}"` : from || to ? `${from || "..."} to ${to || "..."}` : "All Sales",
      tzOffsetMinutes,
      sales,
    });

    await recordAuditLog({
      hospitalId,
      actorUserId: session.user.id,
      actorUsername: session.user.username,
      actorRole: session.user.role,
      actionType: "PHARMACY_SALES_REPORT_EXPORTED",
      details: `Exported pharmacy sales PDF report (${sales.length} transaction(s)).`,
    });

    const safeCode = session.hospital.code.replace(/[^a-zA-Z0-9_-]+/g, "-");
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `pharmacy-sales-report-${safeCode}-${dateStamp}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdfBuffer.byteLength),
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
