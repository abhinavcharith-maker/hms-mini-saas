import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { IP_STATUS, ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { extendIpStaySchema } from "@/lib/validators";
import { allocateReceiptNumber } from "@/lib/sequences";
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
    const hospitalId = session.hospitalId;
    const { id } = await context.params;
    const body = await request.json();
    const input = extendIpStaySchema.parse(body);

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.ipAdmission.findFirst({
        where: { id, hospitalId },
        include: {
          patient: true,
          hospital: true,
        },
      });
      if (!existing) {
        throw new ApiError(404, "IP admission not found.", "NOT_FOUND");
      }
      if (existing.status !== IP_STATUS.ADMITTED) {
        throw new ApiError(
          400,
          "Cannot extend stay for an already discharged patient.",
          "ALREADY_DISCHARGED"
        );
      }

      const previousCheckoutAt =
        existing.expectedCheckoutAt ??
        new Date(
          existing.admittedAt.getTime() +
            Math.max(1, existing.stayDays || 1) * 86_400_000
        );
      // Extend from the later of previousCheckoutAt or current time so overdue stays move cleanly forward
      const baseTime =
        previousCheckoutAt.getTime() > now.getTime()
          ? previousCheckoutAt.getTime()
          : now.getTime();
      const newCheckoutAt = new Date(
        baseTime + input.additionalDays * 86_400_000
      );

      const newTotalCharge =
        Math.round(((existing.chargeAmount ?? 0) + input.amountCollected) * 100) / 100;

      const updatedAdmission = await tx.ipAdmission.update({
        where: { id: existing.id },
        data: {
          stayDays: Math.max(1, existing.stayDays || 1) + input.additionalDays,
          expectedCheckoutAt: newCheckoutAt,
          chargeAmount: newTotalCharge,
        },
      });

      const extension = await tx.ipStayExtension.create({
        data: {
          hospitalId,
          ipAdmissionId: existing.id,
          additionalDays: input.additionalDays,
          amountCollected: input.amountCollected,
          paymentMode: input.paymentMode,
          reason: input.reason,
          previousCheckoutAt,
          newCheckoutAt,
          extendedByUserId: session.user.id,
          extendedByNameSnapshot: session.user.fullName,
        },
      });

      if (input.amountCollected > 0) {
        const receiptNumber = await allocateReceiptNumber(tx, hospitalId);
        await tx.billingReceipt.create({
          data: {
            hospitalId,
            receiptNumber,
            patientId: existing.patientId,
            ipAdmissionId: existing.id,
            hospitalNameSnapshot: existing.hospital.name,
            hospitalAddressSnapshot: existing.hospital.address,
            hospitalPhoneSnapshot: existing.hospital.phone,
            hospitalEmailSnapshot: existing.hospital.email,
            hospitalLogoSnapshot: existing.hospital.logoDataUrl,
            patientUhidSnapshot: existing.patient.uhid,
            patientNameSnapshot: existing.patient.fullName,
            visitSummarySnapshot: `IP Stay Extension (${existing.admissionNumber}) · +${input.additionalDays} day${input.additionalDays === 1 ? "" : "s"} · ${input.reason}`,
            lineItemsJson: JSON.stringify([
              {
                label: `IP Stay Extension (+${input.additionalDays} day${input.additionalDays === 1 ? "" : "s"}): ${input.reason}`,
                amount: input.amountCollected,
              },
            ]),
            totalAmount: input.amountCollected,
            paymentMode: input.paymentMode,
            paymentStatus: "PAID",
            issuedAt: now,
            issuedByUserId: session.user.id,
            issuedByNameSnapshot: session.user.fullName,
          },
        });
      }

      await recordAuditLog(
        {
          hospitalId,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "IP_STAY_EXTENDED",
          patientId: existing.patientId,
          patientUhid: existing.patient.uhid,
          referenceId: existing.admissionNumber,
          details: `Extended IP stay for ${existing.patient.fullName} (${existing.admissionNumber}) by +${input.additionalDays} day(s) via ${input.paymentMode} (Collected: ₹${input.amountCollected.toFixed(2)}). Reason: ${input.reason}.`,
        },
        tx
      );

      return { admission: updatedAdmission, extension };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
