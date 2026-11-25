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
    const session = await requireHospitalAuth([ROLES.PHARMACY_USER]);
    if (!session.pharmacyAccount) {
      throw new ApiError(403, "Pharmacy profile not linked.", "PHARMACY_MISSING");
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
    const pharmacyAccountId = session.pharmacyAccount.id;

    const completed = await prisma.$transaction(async (tx) => {
      const existing = await tx.pharmacyReferral.findFirst({
        where: { id, hospitalId, pharmacyAccountId },
      });
      if (!existing) {
        throw new ApiError(
          404,
          "Referral not found or not assigned to your pharmacy.",
          "NOT_FOUND"
        );
      }

      const now = new Date();
      const updatedCount = await tx.pharmacyReferral.updateMany({
        where: {
          id,
          hospitalId,
          pharmacyAccountId,
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
          actionType: "PHARMACY_REFERRAL_COMPLETED",
          patientId: existing.patientId,
          patientUhid: existing.patientUhidSnapshot,
          referenceId: existing.referralNumber,
          details: `Pharmacy referral ${existing.referralNumber} fulfilled & marked completed by ${session.pharmacyAccount?.pharmacyName} (${session.user.fullName})${amountNote}.`,
        },
        tx
      );

      await createAdminNotification(
        {
          hospitalId,
          title: `Pharmacy Referral Completed (${existing.referralNumber})`,
          message: `${session.pharmacyAccount?.pharmacyName} marked referral ${existing.referralNumber} for ${existing.patientNameSnapshot} (${existing.patientUhidSnapshot}) completed.`,
          category: "REFERRAL",
        },
        tx
      );

      return tx.pharmacyReferral.findUnique({
        where: { id },
        include: { items: true },
      });
    });

    return NextResponse.json({ referral: completed });
  } catch (error) {
    return handleApiError(error);
  }
}
