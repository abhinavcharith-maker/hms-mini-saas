import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES, REFERRAL_STATUS } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { getLocalDayAndMonthBounds, parseSafeTzOffset } from "@/lib/datetime";
import { MAX_PLATFORM_RECENT_ACTIVITY } from "@/lib/audit";
import { evaluateHospitalPaymentState } from "@/lib/payments";
import { handleApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    await requireAuth([ROLES.SUPER_ADMIN]);
    const { searchParams } = new URL(request.url);
    const tzOffsetMinutes = parseSafeTzOffset(searchParams.get("tzOffset"), 0) ?? 0;
    const { todayStart, todayEnd, monthStart } =
      getLocalDayAndMonthBounds(tzOffsetMinutes);

    const [
      hospitals,
      totalPatients,
      totalOpVisits,
      totalIpAdmissions,
      activeIpAdmissions,
      pharmGrouped,
      labGrouped,
      pharmCompletedByHospital,
      labCompletedByHospital,
      recentActivity,
      todayPatientsGrp,
      todayOpGrp,
      todayIpGrp,
      monthPatientsGrp,
    ] = await Promise.all([
      prisma.hospital.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: {
              patients: true,
              opVisits: true,
              ipAdmissions: true,
              pharmacyReferrals: true,
              labReferrals: true,
              users: true,
            },
          },
        },
      }),
      prisma.patient.count(),
      prisma.opVisit.count(),
      prisma.ipAdmission.count(),
      prisma.ipAdmission.count({ where: { status: "ADMITTED" } }),
      prisma.pharmacyReferral.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.labReferral.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.pharmacyReferral.groupBy({
        by: ["hospitalId"],
        where: { status: REFERRAL_STATUS.COMPLETED },
        _count: { _all: true },
      }),
      prisma.labReferral.groupBy({
        by: ["hospitalId"],
        where: { status: REFERRAL_STATUS.COMPLETED },
        _count: { _all: true },
      }),
      prisma.auditLog.findMany({
        take: MAX_PLATFORM_RECENT_ACTIVITY,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: {
          hospital: { select: { name: true, code: true } },
        },
      }),
      prisma.patient.groupBy({
        by: ["hospitalId"],
        where: { registeredAt: { gte: todayStart, lte: todayEnd } },
        _count: { _all: true },
      }),
      prisma.opVisit.groupBy({
        by: ["hospitalId"],
        where: { visitDate: { gte: todayStart, lte: todayEnd } },
        _count: { _all: true },
      }),
      prisma.ipAdmission.groupBy({
        by: ["hospitalId"],
        where: { admittedAt: { gte: todayStart, lte: todayEnd } },
        _count: { _all: true },
      }),
      prisma.patient.groupBy({
        by: ["hospitalId"],
        where: { registeredAt: { gte: monthStart, lte: todayEnd } },
        _count: { _all: true },
      }),
    ]);

    const tpMap = new Map(todayPatientsGrp.map((r) => [r.hospitalId, r._count._all]));
    const topMap = new Map(todayOpGrp.map((r) => [r.hospitalId, r._count._all]));
    const tipMap = new Map(todayIpGrp.map((r) => [r.hospitalId, r._count._all]));
    const mpMap = new Map(monthPatientsGrp.map((r) => [r.hospitalId, r._count._all]));
    const pCompMap = new Map(
      pharmCompletedByHospital.map((r) => [r.hospitalId, r._count._all])
    );
    const lCompMap = new Map(
      labCompletedByHospital.map((r) => [r.hospitalId, r._count._all])
    );

    const activeHospitals = hospitals.filter((h) => h.isActive).length;
    const deactivatedHospitals = hospitals.length - activeHospitals;

    const mapCounts = (rows: Array<{ status: string; _count: { _all: number } }>) => {
      const pending =
        rows.find((r) => r.status === REFERRAL_STATUS.PENDING)?._count._all ?? 0;
      const completed =
        rows.find((r) => r.status === REFERRAL_STATUS.COMPLETED)?._count._all ?? 0;
      const cancelled =
        rows.find((r) => r.status === REFERRAL_STATUS.CANCELLED)?._count._all ?? 0;
      const total = pending + completed + cancelled;
      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
      return { total, pending, completed, cancelled, completionRate };
    };

    const pharmacyStats = mapCounts(pharmGrouped);
    const labStats = mapCounts(labGrouped);

    const now = new Date();
    const totalGrossAmount =
      Math.round(
        hospitals.reduce((sum, h) => sum + (h.subscriptionTotalPaid || 0), 0) *
          100
      ) / 100;

    const hospitalStats = hospitals.map((h) => {
      const pCompleted = pCompMap.get(h.id) ?? 0;
      const lCompleted = lCompMap.get(h.id) ?? 0;
      const todayPatients = tpMap.get(h.id) ?? 0;
      const todayOp = topMap.get(h.id) ?? 0;
      const todayIp = tipMap.get(h.id) ?? 0;
      const monthPatients = mpMap.get(h.id) ?? 0;
      const opExceeded =
        h.dailyOpLimit !== null && h.dailyOpLimit !== undefined && todayOp > h.dailyOpLimit;
      const paymentState = evaluateHospitalPaymentState(
        h.subscriptionExpiresAt,
        now
      );

      return {
        id: h.id,
        code: h.code,
        name: h.name,
        isActive: h.isActive,
        createdAt: h.createdAt,
        patients: h._count.patients,
        opVisits: h._count.opVisits,
        ipAdmissions: h._count.ipAdmissions,
        pharmacyReferrals: h._count.pharmacyReferrals,
        pharmacyCompleted: pCompleted,
        labReferrals: h._count.labReferrals,
        labCompleted: lCompleted,
        totalUsers: h._count.users,
        dailyOpLimit: h.dailyOpLimit,
        todayPatients,
        todayOp,
        todayIp,
        monthPatients,
        opExceeded,
        subscriptionMonthsPaid: h.subscriptionMonthsPaid,
        subscriptionExpiresAt: h.subscriptionExpiresAt,
        subscriptionTotalPaid: h.subscriptionTotalPaid,
        paymentStatus: paymentState.status,
        paymentOverdue: paymentState.isOverdue,
        daysOverdue: paymentState.daysOverdue,
      };
    });

    const limitAlerts = hospitalStats
      .filter((h) => h.opExceeded)
      .map((h) => ({
        hospitalId: h.id,
        hospitalName: h.name,
        todayOp: h.todayOp,
        dailyOpLimit: h.dailyOpLimit,
        opExceeded: h.opExceeded,
      }));

    const paymentAlerts = hospitalStats
      .filter((h) => h.paymentOverdue)
      .map((h) => ({
        hospitalId: h.id,
        hospitalName: h.name,
        hospitalCode: h.code,
        isActive: h.isActive,
        subscriptionExpiresAt: h.subscriptionExpiresAt,
        daysOverdue: h.daysOverdue,
      }));

    return NextResponse.json({
      kpis: {
        totalHospitals: hospitals.length,
        activeHospitals,
        deactivatedHospitals,
        totalGrossAmount,
        paymentOverdueCount: paymentAlerts.length,
        totalPatients,
        totalOpVisits,
        totalIpAdmissions,
        activeIpAdmissions,
        todayPatientsTotal: hospitalStats.reduce((s, h) => s + h.todayPatients, 0),
        todayOpTotal: hospitalStats.reduce((s, h) => s + h.todayOp, 0),
        todayIpTotal: hospitalStats.reduce((s, h) => s + h.todayIp, 0),
        pharmacyReferrals: pharmacyStats,
        labReferrals: labStats,
      },
      limitAlerts,
      paymentAlerts,
      hospitalStats,
      recentActivity,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
