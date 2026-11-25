import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { REFERRAL_STATUS, ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { parseDateRangeBounds, parseSafeTzOffset } from "@/lib/datetime";
import { ApiError, handleApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const session = await requireHospitalAuth([ROLES.PHARMACY_USER]);
    if (!session.pharmacyAccount) {
      throw new ApiError(403, "Pharmacy profile not linked.", "PHARMACY_MISSING");
    }

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");
    const status =
      statusParam === REFERRAL_STATUS.COMPLETED
        ? REFERRAL_STATUS.COMPLETED
        : REFERRAL_STATUS.PENDING;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const tzOffsetMinutes = parseSafeTzOffset(searchParams.get("tzOffset"), null);
    const q = (searchParams.get("q") ?? "").trim();

    const dateBounds =
      status === REFERRAL_STATUS.COMPLETED && (from || to)
        ? parseDateRangeBounds({ from, to, tzOffsetMinutes })
        : {};

    const baseWhere = {
      hospitalId: session.hospitalId,
      pharmacyAccountId: session.pharmacyAccount.id,
    };

    const [referrals, grouped] = await Promise.all([
      prisma.pharmacyReferral.findMany({
        where: {
          ...baseWhere,
          status,
          ...(dateBounds.gte || dateBounds.lte
            ? { completedAt: dateBounds }
            : {}),
          ...(q
            ? {
                OR: [
                  { referralNumber: { contains: q } },
                  { patientNameSnapshot: { contains: q } },
                  { patientUhidSnapshot: { contains: q } },
                ],
              }
            : {}),
        },
        orderBy:
          status === REFERRAL_STATUS.COMPLETED
            ? [{ completedAt: "desc" }, { referredAt: "desc" }]
            : [{ referredAt: "desc" }],
        include: { items: true },
      }),
      prisma.pharmacyReferral.groupBy({
        by: ["status"],
        where: baseWhere,
        _count: { _all: true },
      }),
    ]);

    const pending =
      grouped.find((g) => g.status === REFERRAL_STATUS.PENDING)?._count._all ?? 0;
    const completed =
      grouped.find((g) => g.status === REFERRAL_STATUS.COMPLETED)?._count._all ?? 0;
    const cancelled =
      grouped.find((g) => g.status === REFERRAL_STATUS.CANCELLED)?._count._all ?? 0;

    return NextResponse.json({
      kpis: {
        total: pending + completed + cancelled,
        pending,
        completed,
        cancelled,
      },
      pharmacyAccount: session.pharmacyAccount,
      hospitalName: session.hospital.name,
      referrals,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
