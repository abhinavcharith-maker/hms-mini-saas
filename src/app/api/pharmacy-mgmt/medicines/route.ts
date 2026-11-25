import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePharmacyManagementAuth } from "@/lib/auth";
import { addPharmacyMedicineSchema } from "@/lib/validators";
import {
  formatSortableExpiryKey,
  sortBatchesByExpiryPriority,
} from "@/lib/pharmacy-utils";
import { recordAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const session = await requirePharmacyManagementAuth();
    const hospitalId = session.hospitalId;
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim().toLowerCase();
    const batchQ = (searchParams.get("batchQ") ?? "").trim().toLowerCase();
    const filter = (searchParams.get("filter") ?? "all").trim().toLowerCase();

    const medicines = await prisma.pharmacyMedicine.findMany({
      where: { hospitalId },
      include: {
        batches: {
          orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: [{ name: "asc" }],
    });

    const now = new Date();
    const enriched = medicines.map((med) => {
      const sortedBatches = sortBatchesByExpiryPriority(med.batches, now);
      const totalUnits = sortedBatches.reduce((s, b) => s + b.quantityUnits, 0);
      const validUnits = sortedBatches
        .filter((b) => !b.isExpired)
        .reduce((s, b) => s + b.quantityUnits, 0);
      const hasExpired = sortedBatches.some(
        (b) => b.isExpired && b.quantityUnits > 0
      );
      const hasExpiringSoon = sortedBatches.some(
        (b) => b.isExpiringSoon && b.quantityUnits > 0
      );
      const isOutOfStock = validUnits <= 0;
      const isLowStock =
        !isOutOfStock && med.minStock > 0 && validUnits < med.minStock;

      return {
        ...med,
        batches: sortedBatches,
        totalUnits,
        validUnits,
        hasExpired,
        hasExpiringSoon,
        isOutOfStock,
        isLowStock,
      };
    });

    // Optional direct batch search list (for Sell Medicine's 2nd search bar)
    const matchingBatches = batchQ
      ? enriched
          .flatMap((med) =>
            med.batches
              .filter(
                (b) =>
                  b.batchNumber.toLowerCase().includes(batchQ) ||
                  med.name.toLowerCase().includes(batchQ)
              )
              .map((b) => ({
                batch: b,
                medicine: med,
              }))
          )
          .sort((a, b) => {
            // Exact/prefix batch match first, then earliest expiry first
            const aStarts = a.batch.batchNumber.toLowerCase().startsWith(batchQ)
              ? 0
              : 1;
            const bStarts = b.batch.batchNumber.toLowerCase().startsWith(batchQ)
              ? 0
              : 1;
            if (aStarts !== bStarts) return aStarts - bStarts;
            return a.batch.expiryDate.localeCompare(b.batch.expiryDate);
          })
          .slice(0, 20)
      : [];

    const filteredMedicines = enriched.filter((m) => {
      if (q) {
        const matchesText =
          m.name.toLowerCase().includes(q) ||
          (m.hsnCode ?? "").toLowerCase().includes(q) ||
          (m.placement ?? "").toLowerCase().includes(q) ||
          m.batches.some((b) => b.batchNumber.toLowerCase().includes(q));
        if (!matchesText) return false;
      }
      if (filter === "low_stock") return m.isLowStock;
      if (filter === "out_of_stock") return m.isOutOfStock;
      if (filter === "expiring_soon") return m.hasExpiringSoon;
      if (filter === "expired") return m.hasExpired;
      return true;
    });

    return NextResponse.json({
      medicines: filteredMedicines,
      matchingBatches,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePharmacyManagementAuth();
    const hospitalId = session.hospitalId;
    const body = await request.json();
    const input = addPharmacyMedicineSchema.parse(body);

    const packagingType = input.packagingType;
    const unitsPerSheet = packagingType === "INDIVIDUAL" ? 1 : input.unitsPerSheet;
    const sheetsCount = packagingType === "INDIVIDUAL" ? 0 : input.sheetsCount;
    const singleUnitsCount = input.singleUnitsCount;
    const totalUnitsToAdd = sheetsCount * unitsPerSheet + singleUnitsCount;

    const unitPriceRounded = Math.round(input.unitSellingPrice * 100) / 100;
    const sheetPriceRounded =
      packagingType === "INDIVIDUAL"
        ? unitPriceRounded
        : Math.round(
            (input.sheetSellingPrice > 0
              ? input.sheetSellingPrice
              : unitPriceRounded * unitsPerSheet) * 100
          ) / 100;
    const expiryDateKey = formatSortableExpiryKey(
      input.expiryMonth,
      input.expiryYear
    );
    const normalizedName = input.name.trim();
    const normalizedBatch = input.batchNumber.trim();

    const result = await prisma.$transaction(async (tx) => {
      // Find existing medicine profile if medicineId supplied or exact case-insensitive match exists
      let medicine = input.medicineId
        ? await tx.pharmacyMedicine.findFirst({
            where: { id: input.medicineId, hospitalId },
          })
        : null;

      if (!medicine) {
        const candidates = await tx.pharmacyMedicine.findMany({
          where: { hospitalId },
        });
        medicine =
          candidates.find(
            (c) =>
              c.name.trim().toLowerCase() === normalizedName.toLowerCase()
          ) ?? null;
      }

      let isNewProfile = false;
      if (!medicine) {
        medicine = await tx.pharmacyMedicine.create({
          data: {
            hospitalId,
            name: normalizedName,
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
        isNewProfile = true;
      } else {
        medicine = await tx.pharmacyMedicine.update({
          where: { id: medicine.id },
          data: {
            name: normalizedName,
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
      }

      // Case-insensitive lookup for existing batch on this medicine so duplicate batches can NEVER be created
      const existingBatchesForMed = await tx.pharmacyBatch.findMany({
        where: { hospitalId, medicineId: medicine.id },
      });
      const existingBatch =
        existingBatchesForMed.find(
          (b) => b.batchNumber.trim().toLowerCase() === normalizedBatch.toLowerCase()
        ) ?? null;

      let batch;
      let stockChangeType: "ADDED" | "RESTOCK" = "ADDED";
      if (existingBatch) {
        stockChangeType = "RESTOCK";
        batch = await tx.pharmacyBatch.update({
          where: { id: existingBatch.id },
          data: {
            expiryMonth: input.expiryMonth,
            expiryYear: input.expiryYear,
            expiryDate: expiryDateKey,
            quantityUnits: existingBatch.quantityUnits + totalUnitsToAdd,
            initialQuantityUnits:
              existingBatch.initialQuantityUnits + totalUnitsToAdd,
          },
        });
      } else {
        batch = await tx.pharmacyBatch.create({
          data: {
            hospitalId,
            medicineId: medicine.id,
            batchNumber: normalizedBatch,
            expiryMonth: input.expiryMonth,
            expiryYear: input.expiryYear,
            expiryDate: expiryDateKey,
            quantityUnits: totalUnitsToAdd,
            initialQuantityUnits: totalUnitsToAdd,
          },
        });
      }

      if (totalUnitsToAdd > 0) {
        await tx.pharmacyStockLog.create({
          data: {
            hospitalId,
            medicineId: medicine.id,
            medicineNameSnapshot: medicine.name,
            batchNumberSnapshot: batch.batchNumber,
            changeType: stockChangeType,
            unitsDelta: totalUnitsToAdd,
            recordedByUserId: session.user.id,
            recordedByNameSnapshot: session.user.fullName,
          },
        });
      }

      await recordAuditLog(
        {
          hospitalId,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: isNewProfile
            ? "PHARMACY_MEDICINE_ADDED"
            : "PHARMACY_STOCK_ADDED",
          referenceId: batch.batchNumber,
          details: `${isNewProfile ? "Added medicine" : "Restocked"} "${medicine.name}" (Batch ${batch.batchNumber}, Exp ${String(input.expiryMonth).padStart(2, "0")}/${input.expiryYear}, +${totalUnitsToAdd} units).`,
        },
        tx
      );

      return { medicine, batch, isNewProfile, totalUnitsAdded: totalUnitsToAdd };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
