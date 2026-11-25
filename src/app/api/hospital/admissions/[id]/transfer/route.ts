import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BED_STATUS, IP_STATUS, ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { transferBedSchema } from "@/lib/validators";
import { recordAuditLog } from "@/lib/audit";
import { ApiError, handleApiError } from "@/lib/api-utils";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireHospitalAuth([
      ROLES.HOSPITAL_ADMIN,
      ROLES.RECEPTIONIST,
    ]);
    const { id } = await context.params;
    const body = await request.json();
    const input = transferBedSchema.parse(body);
    const hospitalId = session.hospitalId;

    const updated = await prisma.$transaction(async (tx) => {
      const admission = await tx.ipAdmission.findFirst({
        where: { id, hospitalId, status: IP_STATUS.ADMITTED },
        include: { patient: true, bed: true },
      });
      if (!admission) {
        throw new ApiError(
          404,
          "Active inpatient admission not found.",
          "ADMISSION_NOT_FOUND"
        );
      }

      if (admission.bedId === input.toBedId) {
        throw new ApiError(
          400,
          "Patient is already assigned to this bed.",
          "SAME_BED"
        );
      }

      const targetBed = await tx.bed.findFirst({
        where: { id: input.toBedId, hospitalId },
      });
      if (!targetBed) {
        throw new ApiError(404, "Target bed not found.", "BED_NOT_FOUND");
      }

      const claimed = await tx.bed.updateMany({
        where: { id: targetBed.id, hospitalId, status: BED_STATUS.AVAILABLE },
        data: { status: BED_STATUS.OCCUPIED },
      });
      if (claimed.count !== 1) {
        throw new ApiError(
          409,
          `Target bed ${targetBed.bedNumber} is not available.`,
          "BED_UNAVAILABLE"
        );
      }

      if (admission.bedId) {
        await tx.bed.updateMany({
          where: { id: admission.bedId, hospitalId },
          data: { status: BED_STATUS.AVAILABLE },
        });
      }

      const fromLabel = admission.bed
        ? `${admission.bed.ward} · ${admission.bed.bedNumber}`
        : `${admission.wardSnapshot} · ${admission.bedNumberSnapshot}`;
      const toLabel = `${targetBed.ward} · ${targetBed.bedNumber}`;

      const admUpdated = await tx.ipAdmission.updateMany({
        where: {
          id: admission.id,
          hospitalId,
          status: IP_STATUS.ADMITTED,
          bedId: admission.bedId,
        },
        data: {
          bedId: targetBed.id,
          wardSnapshot: targetBed.ward,
          bedNumberSnapshot: targetBed.bedNumber,
        },
      });
      if (admUpdated.count !== 1) {
        throw new ApiError(
          409,
          "Admission state changed concurrently. Please refresh and try again.",
          "CONCURRENT_UPDATE"
        );
      }

      const nextAdmission = await tx.ipAdmission.findUnique({
        where: { id: admission.id },
        include: { patient: true, bed: true },
      });

      await tx.bedTransfer.create({
        data: {
          hospitalId,
          ipAdmissionId: admission.id,
          fromBedId: admission.bedId,
          fromBedLabel: fromLabel,
          toBedId: targetBed.id,
          toBedLabel: toLabel,
          reason: input.reason ?? null,
          transferredByUserId: session.user.id,
        },
      });

      await recordAuditLog(
        {
          hospitalId,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "BED_TRANSFERRED",
          patientId: admission.patientId,
          patientUhid: admission.patient.uhid,
          referenceId: admission.admissionNumber,
          details: `Transferred ${admission.patient.fullName} (${admission.patient.uhid}) from ${fromLabel} to ${toLabel}.${input.reason ? ` Reason: ${input.reason}` : ""}`,
        },
        tx
      );

      return nextAdmission;
    });

    return NextResponse.json({ admission: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
