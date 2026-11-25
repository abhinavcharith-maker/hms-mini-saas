import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePharmacyManagementAuth } from "@/lib/auth";
import { updatePharmacyMedicineSchema } from "@/lib/validators";
import {
  formatSortableExpiryKey,
  sortBatchesByExpiryPriority,
} from "@/lib/pharmacy-utils";
import { recordAuditLog } from "@/lib/audit";
import { ApiError, handleApiError } from "@/lib/api-utils";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePharmacyManagementAuth();
    const { id } = await context.params;

    const medicine = await prisma.pharmacyMedicine.findFirst({
      where: { id, hospitalId: session.hospitalId },
      include: { batches: true },
    });

    if (!medicine) {
      throw new ApiError(404, "Medicine profile not found.", "NOT_FOUND");
    }

    return NextResponse.json({
      medicine: {
        ...medicine,
        batches: sortBatchesByExpiryPriority(medicine.batches),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePharmacyManagementAuth();
    const hospitalId = session.hospitalId;
    const { id } = await context.params;
    const body = await request.json();
    const input = updatePharmacyMedicineSchema.parse(body);

    const existing = await prisma.pharmacyMedicine.findFirst({
      where: { id, hospitalId },
      include: { batches: true },
    });
    if (!existing) {
      throw new ApiError(404, "Medicine profile not found.", "NOT_FOUND");
    }

    const packagingType = input.packagingType;
    const unitsPerSheet = packagingType === "INDIVIDUAL" ? 1 : input.unitsPerSheet;
    const unitPriceRounded = Math.round(input.unitSellingPrice * 100) / 100;
    const sheetPriceRounded =
      packagingType === "INDIVIDUAL"
        ? unitPriceRounded
        : Math.round(
            (input.sheetSellingPrice > 0
              ? input.sheetSellingPrice
              : unitPriceRounded * unitsPerSheet) * 100
          ) / 100;

    // Validate no duplicate batch numbers among non-deleted batches in payload
    if (input.batches) {
      const seenBatchNums = new Set<string>();
      for (const b of input.batches) {
        if (b.delete) continue;
        const key = b.batchNumber.trim().toLowerCase();
        if (seenBatchNums.has(key)) {
          throw new ApiError(
            400,
            `Duplicate batch number "${b.batchNumber}" in edit request.`,
            "DUPLICATE_BATCH"
          );
        }
        seenBatchNums.add(key);
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const med = await tx.pharmacyMedicine.update({
        where: { id: existing.id },
        data: {
          name: input.name.trim(),
          packagingType,
          unitsPerSheet,
          minStock: input.minStock,
          unitSellingPrice: unitPriceRounded,
          sheetSellingPrice: sheetPriceRounded,
          hsnCode: input.hsnCode ?? null,
          gstPercent: input.gstPercent,
          prescriptionRequired: input.prescriptionRequired,
          placement: input.placement ?? null,
        },
      });

      if (input.batches) {
        const existingMap = new Map(existing.batches.map((b) => [b.id, b]));

        // First process deletions so batch numbers can be reused if renamed
        for (const b of input.batches) {
          if (b.delete && b.id && existingMap.has(b.id)) {
            const prev = existingMap.get(b.id)!;
            await tx.pharmacyBatch.delete({ where: { id: prev.id } });
            if (prev.quantityUnits > 0) {
              await tx.pharmacyStockLog.create({
                data: {
                  hospitalId,
                  medicineId: med.id,
                  medicineNameSnapshot: med.name,
                  batchNumberSnapshot: prev.batchNumber,
                  changeType: "ADJUSTMENT",
                  unitsDelta: -prev.quantityUnits,
                  recordedByUserId: session.user.id,
                  recordedByNameSnapshot: session.user.fullName,
                },
              });
            }
          }
        }

        // Next process updates and new batches
        for (const b of input.batches) {
          if (b.delete) continue;
          const batchNumber = b.batchNumber.trim();
          const expiryDate = formatSortableExpiryKey(b.expiryMonth, b.expiryYear);

          if (b.id && existingMap.has(b.id)) {
            const prev = existingMap.get(b.id)!;
            const delta = b.quantityUnits - prev.quantityUnits;

            await tx.pharmacyBatch.update({
              where: { id: prev.id },
              data: {
                batchNumber,
                expiryMonth: b.expiryMonth,
                expiryYear: b.expiryYear,
                expiryDate,
                quantityUnits: b.quantityUnits,
                ...(delta > 0
                  ? { initialQuantityUnits: prev.initialQuantityUnits + delta }
                  : {}),
              },
            });

            if (delta !== 0) {
              await tx.pharmacyStockLog.create({
                data: {
                  hospitalId,
                  medicineId: med.id,
                  medicineNameSnapshot: med.name,
                  batchNumberSnapshot: batchNumber,
                  changeType: delta > 0 ? "RESTOCK" : "ADJUSTMENT",
                  unitsDelta: delta,
                  recordedByUserId: session.user.id,
                  recordedByNameSnapshot: session.user.fullName,
                },
              });
            }
          } else {
            const createdBatch = await tx.pharmacyBatch.create({
              data: {
                hospitalId,
                medicineId: med.id,
                batchNumber,
                expiryMonth: b.expiryMonth,
                expiryYear: b.expiryYear,
                expiryDate,
                quantityUnits: b.quantityUnits,
                initialQuantityUnits: b.quantityUnits,
              },
            });
            if (b.quantityUnits > 0) {
              await tx.pharmacyStockLog.create({
                data: {
                  hospitalId,
                  medicineId: med.id,
                  medicineNameSnapshot: med.name,
                  batchNumberSnapshot: createdBatch.batchNumber,
                  changeType: "ADDED",
                  unitsDelta: b.quantityUnits,
                  recordedByUserId: session.user.id,
                  recordedByNameSnapshot: session.user.fullName,
                },
              });
            }
          }
        }
      }

      await recordAuditLog(
        {
          hospitalId,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "PHARMACY_MEDICINE_UPDATED",
          referenceId: med.name,
          details: `Updated medicine profile & batch inventory for "${med.name}".`,
        },
        tx
      );

      const refreshed = await tx.pharmacyMedicine.findUniqueOrThrow({
        where: { id: med.id },
        include: { batches: true },
      });

      return {
        ...refreshed,
        batches: sortBatchesByExpiryPriority(refreshed.batches),
      };
    });

    return NextResponse.json({ medicine: updated });
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
    const hospitalId = session.hospitalId;
    const { id } = await context.params;

    const existing = await prisma.pharmacyMedicine.findFirst({
      where: { id, hospitalId },
      include: { batches: true },
    });
    if (!existing) {
      throw new ApiError(404, "Medicine profile not found.", "NOT_FOUND");
    }

    await prisma.$transaction(async (tx) => {
      await tx.pharmacyMedicine.delete({ where: { id: existing.id } });
      await recordAuditLog(
        {
          hospitalId,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "PHARMACY_MEDICINE_DELETED",
          referenceId: existing.name,
          details: `Deleted medicine profile "${existing.name}" (${existing.batches.length} batch(es)). Historical sales receipts preserved.`,
        },
        tx
      );
    });

    return NextResponse.json({ deleted: true, id: existing.id });
  } catch (error) {
    return handleApiError(error);
  }
}
