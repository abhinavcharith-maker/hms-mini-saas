import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BED_STATUS, IP_STATUS, ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { dischargePatientSchema } from "@/lib/validators";
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
    const input = dischargePatientSchema.parse(body);
    const hospitalId = session.hospitalId;

    const dischargedAt = input.dischargedAt
      ? new Date(input.dischargedAt)
      : new Date();
    if (Number.isNaN(dischargedAt.getTime())) {
      throw new ApiError(400, "Invalid discharge timestamp.", "INVALID_DATE");
    }

    const discharged = await prisma.$transaction(async (tx) => {
      const admission = await tx.ipAdmission.findFirst({
        where: { id, hospitalId },
        include: { patient: true },
      });
      if (!admission) {
        throw new ApiError(404, "Admission record not found.", "NOT_FOUND");
      }

      const updatedCount = await tx.ipAdmission.updateMany({
        where: {
          id,
          hospitalId,
          status: IP_STATUS.ADMITTED,
          bedId: admission.bedId,
        },
        data: {
          status: IP_STATUS.DISCHARGED,
          dischargedAt,
          dischargeNotes: input.dischargeNotes ?? null,
          dischargedByUserId: session.user.id,
        },
      });
      if (updatedCount.count !== 1) {
        throw new ApiError(
          409,
          "This admission was already discharged or updated concurrently.",
          "ALREADY_DISCHARGED"
        );
      }

      if (admission.bedId) {
        await tx.bed.updateMany({
          where: { id: admission.bedId, hospitalId },
          data: { status: BED_STATUS.AVAILABLE },
        });
      }

      await recordAuditLog(
        {
          hospitalId,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "IP_DISCHARGED",
          patientId: admission.patientId,
          patientUhid: admission.patient.uhid,
          referenceId: admission.admissionNumber,
          details: `Discharged ${admission.patient.fullName} (${admission.patient.uhid}) from ${admission.wardSnapshot} · Bed ${admission.bedNumberSnapshot}. Bed automatically released.`,
        },
        tx
      );

      return tx.ipAdmission.findUnique({
        where: { id },
        include: { patient: true, bed: true },
      });
    });

    return NextResponse.json({ admission: discharged });
  } catch (error) {
    return handleApiError(error);
  }
}
