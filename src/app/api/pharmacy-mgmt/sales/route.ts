import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePharmacyManagementAuth } from "@/lib/auth";
import { createPharmacySaleSchema } from "@/lib/validators";
import { allocatePharmacySaleNumber } from "@/lib/sequences";
import { getBatchExpiryStatus } from "@/lib/pharmacy-utils";
import { parseDateRangeBounds, parseSafeTzOffset } from "@/lib/datetime";
import { recordAuditLog } from "@/lib/audit";
import { ApiError, handleApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const session = await requirePharmacyManagementAuth();
    const hospitalId = session.hospitalId;
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const tzOffsetMinutes = parseSafeTzOffset(searchParams.get("tzOffset"), null);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
    const limit = Math.min(
      Math.max(1, Number(searchParams.get("limit") ?? 100) || 100),
      100
    );

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

    const where: Prisma.PharmacySaleWhereInput = {
      hospitalId,
      ...(andFilters.length > 0 ? { AND: andFilters } : {}),
    };

    const [total, sales] = await Promise.all([
      prisma.pharmacySale.count({ where }),
      prisma.pharmacySale.findMany({
        where,
        orderBy: [{ soldAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          items: true,
        },
      }),
    ]);

    return NextResponse.json({
      sales,
      pagination: {
        total,
        page,
        pageSize: limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
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
    const input = createPharmacySaleSchema.parse(body);

    const now = new Date();

    const sale = await prisma.$transaction(async (tx) => {
      let resolvedDoctorId: string | null = null;
      let resolvedDoctorName = input.doctorName.trim();
      let resolvedDoctorQualification: string | null = null;

      if (input.doctorId) {
        const doc = await tx.doctor.findFirst({
          where: { id: input.doctorId, hospitalId },
        });
        if (!doc) {
          throw new ApiError(
            400,
            "Selected reference doctor was not found in this hospital.",
            "DOCTOR_NOT_FOUND"
          );
        }
        resolvedDoctorId = doc.id;
        resolvedDoctorName = doc.name;
        resolvedDoctorQualification = doc.qualification ?? null;
      }

      const saleItemsToCreate: Array<{
        hospitalId: string;
        medicineId: string;
        batchId: string;
        medicineNameSnapshot: string;
        batchNumberSnapshot: string;
        expiryDateSnapshot: string;
        hsnCodeSnapshot: string | null;
        placementSnapshot: string | null;
        prescriptionRequired: boolean;
        sellMode: string;
        enteredQuantity: number;
        unitsPerSheetSnapshot: number;
        basicUnitsDeducted: number;
        unitPriceSnapshot: number;
        gstPercentSnapshot: number;
        subtotal: number;
        gstAmount: number;
        lineTotal: number;
      }> = [];

      let grandSubtotal = 0;
      let grandGst = 0;
      let totalUnitsSold = 0;

      for (const reqItem of input.items) {
        const med = await tx.pharmacyMedicine.findFirst({
          where: { id: reqItem.medicineId, hospitalId },
        });
        if (!med) {
          throw new ApiError(
            404,
            "One of the medicines in the cart no longer exists.",
            "MEDICINE_NOT_FOUND"
          );
        }

        const batch = await tx.pharmacyBatch.findFirst({
          where: {
            id: reqItem.batchId,
            medicineId: med.id,
            hospitalId,
          },
        });
        if (!batch) {
          throw new ApiError(
            404,
            `Batch not found for "${med.name}".`,
            "BATCH_NOT_FOUND"
          );
        }

        const expiryStatus = getBatchExpiryStatus(
          batch.expiryMonth,
          batch.expiryYear,
          now
        );
        if (expiryStatus.isExpired) {
          throw new ApiError(
            400,
            `Batch ${batch.batchNumber} of "${med.name}" is expired (${String(batch.expiryMonth).padStart(2, "0")}/${batch.expiryYear}) and cannot be sold.`,
            "BATCH_EXPIRED"
          );
        }

        if (reqItem.sellMode === "SHEET" && med.packagingType !== "SHEET") {
          throw new ApiError(
            400,
            `"${med.name}" is configured as Individual Items and cannot be sold by sheet.`,
            "INVALID_SELL_MODE"
          );
        }

        const unitsPerSheet =
          med.packagingType === "SHEET" ? Math.max(1, med.unitsPerSheet) : 1;
        const basicUnitsDeducted =
          reqItem.sellMode === "SHEET"
            ? reqItem.quantity * unitsPerSheet
            : reqItem.quantity;

        // Atomic conditional stock deduction prevents overselling under concurrency
        const deducted = await tx.pharmacyBatch.updateMany({
          where: {
            id: batch.id,
            hospitalId,
            quantityUnits: { gte: basicUnitsDeducted },
          },
          data: {
            quantityUnits: { decrement: basicUnitsDeducted },
          },
        });

        if (deducted.count === 0) {
          throw new ApiError(
            409,
            `Insufficient stock in batch ${batch.batchNumber} for "${med.name}". Requested ${basicUnitsDeducted} unit(s).`,
            "INSUFFICIENT_STOCK"
          );
        }

        // GST % is recorded strictly for invoice display on the printed receipt — never added on top of selling price.
        const lineSubtotal =
          Math.round(basicUnitsDeducted * med.unitSellingPrice * 100) / 100;
        const lineGst = 0;
        const lineTotal = lineSubtotal;

        grandSubtotal = Math.round((grandSubtotal + lineSubtotal) * 100) / 100;
        grandGst = 0;
        totalUnitsSold += basicUnitsDeducted;

        saleItemsToCreate.push({
          hospitalId,
          medicineId: med.id,
          batchId: batch.id,
          medicineNameSnapshot: med.name,
          batchNumberSnapshot: batch.batchNumber,
          expiryDateSnapshot: `${String(batch.expiryMonth).padStart(2, "0")}/${batch.expiryYear}`,
          hsnCodeSnapshot: med.hsnCode,
          placementSnapshot: med.placement,
          prescriptionRequired: med.prescriptionRequired,
          sellMode: reqItem.sellMode,
          enteredQuantity: reqItem.quantity,
          unitsPerSheetSnapshot: unitsPerSheet,
          basicUnitsDeducted,
          unitPriceSnapshot: med.unitSellingPrice,
          gstPercentSnapshot: med.gstPercent,
          subtotal: lineSubtotal,
          gstAmount: lineGst,
          lineTotal,
        });

        await tx.pharmacyStockLog.create({
          data: {
            hospitalId,
            medicineId: med.id,
            medicineNameSnapshot: med.name,
            batchNumberSnapshot: batch.batchNumber,
            changeType: "SOLD",
            unitsDelta: -basicUnitsDeducted,
            recordedByUserId: session.user.id,
            recordedByNameSnapshot: session.user.fullName,
          },
        });
      }

      const grandTotal = Math.round((grandSubtotal + grandGst) * 100) / 100;
      const saleNumber = await allocatePharmacySaleNumber(tx, hospitalId);

      const createdSale = await tx.pharmacySale.create({
        data: {
          hospitalId,
          saleNumber,
          patientName: input.patientName.trim(),
          patientPhone: input.patientPhone,
          doctorId: resolvedDoctorId,
          doctorName: resolvedDoctorName,
          doctorQualificationSnapshot: resolvedDoctorQualification,
          subtotal: grandSubtotal,
          gstAmount: grandGst,
          totalAmount: grandTotal,
          totalUnitsSold,
          paymentMode: input.paymentMode,
          soldByUserId: session.user.id,
          soldByNameSnapshot: session.user.fullName,
          soldAt: now,
          items: {
            create: saleItemsToCreate,
          },
        },
        include: {
          items: true,
        },
      });

      if (input.prescriptionId) {
        await tx.doctorPrescription.updateMany({
          where: {
            id: input.prescriptionId,
            hospitalId,
            status: "PENDING",
          },
          data: {
            status: "DISPENSED",
            dispensedAt: now,
            dispensedSaleId: createdSale.id,
          },
        });
      }

      await recordAuditLog(
        {
          hospitalId,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "PHARMACY_SALE_COMPLETED",
          referenceId: createdSale.saleNumber,
          details: `Completed pharmacy sale ${createdSale.saleNumber} for ${createdSale.patientName} (${createdSale.patientPhone}), Ref Dr: ${createdSale.doctorName} — ${totalUnitsSold} unit(s), Total ₹${grandTotal.toFixed(2)}.`,
        },
        tx
      );

      return createdSale;
    });

    return NextResponse.json({ sale }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
