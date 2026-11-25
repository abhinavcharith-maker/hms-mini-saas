import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { REFERRAL_STATUS, ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { completeReferralSchema } from "@/lib/validators";
import { createAdminNotification, recordAuditLog } from "@/lib/audit";
import { ApiError, handleApiError } from "@/lib/api-utils";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireHospitalAuth([ROLES.LAB_USER]);
    if (!session.labAccount) {
      throw new ApiError(403, "Laboratory profile not linked.", "LAB_MISSING");
    }

    let rawBody: unknown = {};
    try {
      rawBody = await request.json();
    } catch {
      rawBody = {};
    }
    const input = completeReferralSchema.parse(rawBody ?? {});

    const { id } = await context.params;
    const hospitalId = session.hospitalId;
    const labAccountId = session.labAccount.id;

    const completed = await prisma.$transaction(async (tx) => {
      const existing = await tx.labReferral.findFirst({
        where: { id, hospitalId, labAccountId },
      });
      if (!existing) {
        throw new ApiError(
          404,
          "Referral not found or not assigned to your laboratory.",
          "NOT_FOUND"
        );
      }

      const now = new Date();
      const updatedCount = await tx.labReferral.updateMany({
        where: {
          id,
          hospitalId,
          labAccountId,
          status: REFERRAL_STATUS.PENDING,
        },
        data: {
          status: REFERRAL_STATUS.COMPLETED,
          completedAt: now,
          completedByUserId: session.user.id,
          completedByNameSnapshot: session.user.fullName,
          ...(input.totalAmount !== undefined
            ? { totalAmount: input.totalAmount }
            : {}),
        },
      });

      if (updatedCount.count !== 1) {
        throw new ApiError(
          409,
          "Only pending referrals can be marked as completed.",
          "INVALID_STATUS"
        );
      }

      const amountNote =
        input.totalAmount !== null && input.totalAmount !== undefined
          ? ` (Entered amount: ₹${input.totalAmount.toFixed(2)})`
          : "";

      await recordAuditLog(
        {
          hospitalId,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "LAB_REFERRAL_COMPLETED",
          patientId: existing.patientId,
          patientUhid: existing.patientUhidSnapshot,
          referenceId: existing.referralNumber,
          details: `Laboratory referral ${existing.referralNumber} fulfilled & marked completed by ${session.labAccount?.labName} (${session.user.fullName})${amountNote}.`,
        },
        tx
      );

      await createAdminNotification(
        {
          hospitalId,
          title: `Lab Referral Completed (${existing.referralNumber})`,
          message: `${session.labAccount?.labName} marked referral ${existing.referralNumber} for ${existing.patientNameSnapshot} (${existing.patientUhidSnapshot}) completed.`,
          category: "REFERRAL",
        },
        tx
      );

      return tx.labReferral.findUnique({
        where: { id },
        include: { items: true },
      });
    });

    return NextResponse.json({ referral: completed });
  } catch (error) {
    return handleApiError(error);
  }
}
