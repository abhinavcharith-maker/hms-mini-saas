import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { extendHospitalPaymentSchema } from "@/lib/validators";
import {
  computeNewSubscriptionExpiry,
  evaluateHospitalPaymentState,
  formatInrAmount,
} from "@/lib/payments";
import { generateAuditEventId, pruneHospitalAuditLogs } from "@/lib/audit";
import { ApiError, handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    await requireAuth([ROLES.SUPER_ADMIN]);
    const now = new Date();

    const [hospitals, totalPaymentsCount] = await Promise.all([
      prisma.hospital.findMany({
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          code: true,
          name: true,
          phone: true,
          email: true,
          isActive: true,
          deactivatedAt: true,
          createdAt: true,
          subscriptionMonthsPaid: true,
          subscriptionExpiresAt: true,
          subscriptionTotalPaid: true,
          payments: {
            orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
            take: 15,
          },
          _count: {
            select: {
              payments: true,
              patients: true,
              opVisits: true,
            },
          },
        },
      }),
      prisma.hospitalPayment.count(),
    ]);

    const enriched = hospitals.map((h) => {
      const paymentState = evaluateHospitalPaymentState(
        h.subscriptionExpiresAt,
        now
      );
      return {
        ...h,
        paymentState,
      };
    });

    // Sort overdue hospitals first so Super Admin sees urgent payment alerts immediately
    enriched.sort((a, b) => {
      const priority = (s: string) => {
        if (s === "OVERDUE") return 0;
        if (s === "EXPIRING_SOON") return 1;
        if (s === "UNSET") return 2;
        return 3;
      };
      const diff = priority(a.paymentState.status) - priority(b.paymentState.status);
      if (diff !== 0) return diff;
      if (a.paymentState.isOverdue && b.paymentState.isOverdue) {
        return b.paymentState.daysOverdue - a.paymentState.daysOverdue;
      }
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    const overdueAlerts = enriched
      .filter((h) => h.paymentState.isOverdue)
      .map((h) => ({
        hospitalId: h.id,
        hospitalName: h.name,
        hospitalCode: h.code,
        isActive: h.isActive,
        subscriptionMonthsPaid: h.subscriptionMonthsPaid,
        subscriptionExpiresAt: h.subscriptionExpiresAt,
        daysOverdue: h.paymentState.daysOverdue,
      }));

    const totalGrossAmount =
      Math.round(
        enriched.reduce((sum, h) => sum + (h.subscriptionTotalPaid || 0), 0) * 100
      ) / 100;

    const activePaidCount = enriched.filter(
      (h) =>
        h.paymentState.status === "ACTIVE" ||
        h.paymentState.status === "EXPIRING_SOON"
    ).length;

    return NextResponse.json({
      summary: {
        totalGrossAmount,
        totalHospitals: enriched.length,
        activePaidCount,
        overdueCount: overdueAlerts.length,
        unsetCount: enriched.filter((h) => h.paymentState.status === "UNSET").length,
        deactivatedCount: enriched.filter((h) => !h.isActive).length,
        totalPaymentsCount,
      },
      overdueAlerts,
      hospitals: enriched,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuth([ROLES.SUPER_ADMIN]);
    const body = await request.json();
    const input = extendHospitalPaymentSchema.parse(body);

    const hospital = await prisma.hospital.findUnique({
      where: { id: input.hospitalId },
    });
    if (!hospital) {
      throw new ApiError(404, "Hospital account not found.", "NOT_FOUND");
    }

    const monthsAdded =
      input.durationUnit === "YEARS"
        ? input.durationValue * 12
        : input.durationValue;

    const now = new Date();
    const previousExpiresAt = hospital.subscriptionExpiresAt;
    const newExpiresAt = computeNewSubscriptionExpiry(
      previousExpiresAt,
      monthsAdded,
      now
    );
    const amountRounded = Math.round(input.amountCollected * 100) / 100;
    const newTotalPaid =
      Math.round(((hospital.subscriptionTotalPaid || 0) + amountRounded) * 100) /
      100;

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.hospitalPayment.create({
        data: {
          hospitalId: hospital.id,
          durationValue: input.durationValue,
          durationUnit: input.durationUnit,
          monthsAdded,
          amountCollected: amountRounded,
          previousExpiresAt,
          newExpiresAt,
          notes: input.notes ?? null,
          recordedByUserId: session.user.id,
          recordedByUsername: session.user.username,
          paidAt: now,
        },
      });

      const updatedHospital = await tx.hospital.update({
        where: { id: hospital.id },
        data: {
          subscriptionMonthsPaid: (hospital.subscriptionMonthsPaid || 0) + monthsAdded,
          subscriptionExpiresAt: newExpiresAt,
          subscriptionTotalPaid: newTotalPaid,
        },
      });

      const unitLabel =
        input.durationUnit === "YEARS"
          ? `${input.durationValue} year${input.durationValue === 1 ? "" : "s"} (${monthsAdded} months)`
          : `${input.durationValue} month${input.durationValue === 1 ? "" : "s"}`;

      await tx.auditLog.create({
        data: {
          eventId: generateAuditEventId(),
          hospitalId: hospital.id,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "HOSPITAL_PAYMENT_RECORDED",
          referenceId: hospital.code,
          details: `Extended "${hospital.name}" (${hospital.code}) payment timeline by ${unitLabel} with collected amount ${formatInrAmount(amountRounded)}. Valid until ${newExpiresAt.toISOString().slice(0, 10)}.`,
        },
      });
      await pruneHospitalAuditLogs(hospital.id, tx);

      return { payment, hospital: updatedHospital };
    });

    return NextResponse.json(
      {
        payment: result.payment,
        hospital: {
          ...result.hospital,
          paymentState: evaluateHospitalPaymentState(
            result.hospital.subscriptionExpiresAt,
            now
          ),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
