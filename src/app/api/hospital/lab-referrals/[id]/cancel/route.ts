import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { REFERRAL_STATUS, ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { ApiError, handleApiError } from "@/lib/api-utils";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireHospitalAuth([
      ROLES.HOSPITAL_ADMIN,
      ROLES.RECEPTIONIST,
    ]);
    const { id } = await context.params;
    const hospitalId = session.hospitalId;

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.labReferral.findFirst({
        where: { id, hospitalId },
      });
      if (!existing) {
        throw new ApiError(404, "Laboratory referral not found.", "NOT_FOUND");
      }

      const count = await tx.labReferral.updateMany({
        where: { id, hospitalId, status: REFERRAL_STATUS.PENDING },
        data: {
          status: REFERRAL_STATUS.CANCELLED,
          cancelledAt: new Date(),
          cancelledByUserId: session.user.id,
        },
      });
      if (count.count !== 1) {
        throw new ApiError(
          409,
          "Only pending referrals can be cancelled.",
          "INVALID_STATUS"
        );
      }

      await recordAuditLog(
        {
          hospitalId,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "LAB_REFERRAL_CANCELLED",
          patientId: existing.patientId,
          patientUhid: existing.patientUhidSnapshot,
          referenceId: existing.referralNumber,
          details: `Cancelled laboratory referral ${existing.referralNumber} for ${existing.patientNameSnapshot} (${existing.patientUhidSnapshot}).`,
        },
        tx
      );

      return tx.labReferral.findUnique({
        where: { id },
        include: { items: true },
      });
    });

    return NextResponse.json({ referral: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
