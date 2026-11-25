import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePharmacyManagementAuth } from "@/lib/auth";
import { ApiError, handleApiError } from "@/lib/api-utils";

const patchBillScanSchema = z.object({
  status: z.enum(["IN_PROGRESS", "COMPLETED", "DISCARDED"]).optional(),
  items: z
    .array(
      z.object({
        itemId: z.string().min(1),
        rawName: z.string(),
        batchNumber: z.string(),
        packagingGuess: z.enum(["SHEET", "INDIVIDUAL"]).optional(),
        sheetsCount: z.number().int().min(0),
        unitsCount: z.number().int().min(0).optional(),
        expiryMonth: z.number().int().min(1).max(12),
        expiryYear: z.number().int().min(2000).max(2150),
        hsnCode: z.string().nullable().optional(),
        gstPercent: z.number().nullable().optional(),
        matchedMedicineId: z.string().nullable().optional(),
        matchedMedicineName: z.string().nullable().optional(),
        matchConfidence: z.number().optional(),
        status: z.enum(["PENDING", "ADDED"]),
        addedMedicineId: z.string().nullable().optional(),
        addedMedicineName: z.string().nullable().optional(),
      })
    )
    .optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePharmacyManagementAuth();
    const { id } = await context.params;
    const body = await request.json();
    const input = patchBillScanSchema.parse(body);

    const existing = await prisma.pharmacyBillScanSession.findFirst({
      where: { id, hospitalId: session.hospitalId },
    });
    if (!existing) {
      throw new ApiError(404, "Scanned purchase session not found.", "NOT_FOUND");
    }

    const nextItems = input.items ?? JSON.parse(existing.itemsJson);
    const allDone =
      Array.isArray(nextItems) &&
      nextItems.length > 0 &&
      nextItems.every((it: { status?: string }) => it.status === "ADDED");

    const nextStatus =
      input.status ?? (allDone ? "COMPLETED" : existing.status);

    const updated = await prisma.pharmacyBillScanSession.update({
      where: { id: existing.id },
      data: {
        itemsJson: JSON.stringify(nextItems),
        status: nextStatus,
      },
    });

    return NextResponse.json({
      session: {
        id: updated.id,
        status: updated.status,
        fileName: updated.fileName,
        items: nextItems,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePharmacyManagementAuth();
    const { id } = await context.params;

    const existing = await prisma.pharmacyBillScanSession.findFirst({
      where: { id, hospitalId: session.hospitalId },
    });
    if (!existing) {
      throw new ApiError(404, "Scanned purchase session not found.", "NOT_FOUND");
    }

    await prisma.pharmacyBillScanSession.update({
      where: { id: existing.id },
      data: { status: "DISCARDED" },
    });

    return NextResponse.json({ discarded: true });
  } catch (error) {
    return handleApiError(error);
  }
}
