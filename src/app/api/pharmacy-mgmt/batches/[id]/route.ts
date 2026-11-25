import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePharmacyManagementAuth } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { ApiError, handleApiError } from "@/lib/api-utils";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePharmacyManagementAuth();
    const hospitalId = session.hospitalId;
    const { id } = await context.params;

    const batch = await prisma.pharmacyBatch.findFirst({
      where: { id, hospitalId },
      include: {
        medicine: {
          select: { id: true, name: true },
        },
      },
    });
    if (!batch) {
      throw new ApiError(404, "Batch not found.", "BATCH_NOT_FOUND");
    }

    await prisma.$transaction(async (tx) => {
      await tx.pharmacyBatch.delete({ where: { id: batch.id } });

      if (batch.quantityUnits > 0) {
        await tx.pharmacyStockLog.create({
          data: {
            hospitalId,
            medicineId: batch.medicineId,
            medicineNameSnapshot: batch.medicine.name,
            batchNumberSnapshot: batch.batchNumber,
            changeType: "ADJUSTMENT",
            unitsDelta: -batch.quantityUnits,
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
          actionType: "PHARMACY_BATCH_DELETED",
          referenceId: batch.batchNumber,
          details: `Deleted batch "${batch.batchNumber}" (Exp ${String(batch.expiryMonth).padStart(2, "0")}/${batch.expiryYear}) of "${batch.medicine.name}" along with ${batch.quantityUnits} unit(s).`,
        },
        tx
      );
    });

    return NextResponse.json({
      deleted: true,
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      medicineName: batch.medicine.name,
      unitsRemoved: batch.quantityUnits,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
