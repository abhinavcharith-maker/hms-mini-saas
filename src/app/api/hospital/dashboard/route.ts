import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BED_STATUS, IP_STATUS, REFERRAL_STATUS, ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { parseDateRangeBounds, parseSafeTzOffset } from "@/lib/datetime";
import { handleApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const session = await requireHospitalAuth([
      ROLES.HOSPITAL_ADMIN,
      ROLES.RECEPTIONIST,
    ]);
    const hospitalId = session.hospitalId;

    const { searchParams } = new URL(request.url);
    const tzOffsetMinutes = parseSafeTzOffset(searchParams.get("tzOffset"), 0) ?? 0;

    const offsetMs = tzOffsetMinutes * 60_000;
    const localTodayDate = new Date(Date.now() - offsetMs);
    const defaultTo = localTodayDate.toISOString().slice(0, 10);
    const sevenStartDate = new Date(localTodayDate);
    sevenStartDate.setUTCDate(sevenStartDate.getUTCDate() - 6);
    const defaultFrom = sevenStartDate.toISOString().slice(0, 10);

    const from = searchParams.get("from") || defaultFrom;
    const to = searchParams.get("to") || defaultTo;
    const rangeFilter = parseDateRangeBounds({ from, to, tzOffsetMinutes });

    const rangeStart = rangeFilter.gte ?? new Date(Date.now() - 7 * 86_400_000);
    const rangeEnd = rangeFilter.lte ?? new Date();

    // Limit daily pulse chart to at most 14 days (tail of selected range)
    const rangeStartLocal = new Date(rangeStart.getTime() - offsetMs);
    const rangeEndLocal = new Date(rangeEnd.getTime() - offsetMs);
    const msPerDay = 86_400_000;
    const totalDays = Math.max(
      1,
      Math.floor(
        (Date.UTC(
          rangeEndLocal.getUTCFullYear(),
          rangeEndLocal.getUTCMonth(),
          rangeEndLocal.getUTCDate()
        ) -
          Date.UTC(
            rangeStartLocal.getUTCFullYear(),
            rangeStartLocal.getUTCMonth(),
            rangeStartLocal.getUTCDate()
          )) /
          msPerDay
      ) + 1
    );
    const chartDays = Math.min(14, totalDays);
    const chartStartUtc = new Date(
      Date.UTC(
        rangeEndLocal.getUTCFullYear(),
        rangeEndLocal.getUTCMonth(),
        rangeEndLocal.getUTCDate() - (chartDays - 1)
      ) + offsetMs
    );

    const [
      totalPatientsAllTime,
      patientsInRange,
      opCountInRange,
      currentIpCount,
      bedsGrouped,
      pharmGrouped,
      labGrouped,
      opGrossAgg,
      ipGrossAgg,
      recentPatients,
      recentAdmissions,
      recentPharmReferrals,
      recentLabReferrals,
      opSeriesRows,
      pharmSeriesRows,
      labSeriesRows,
    ] = await Promise.all([
      prisma.patient.count({ where: { hospitalId } }),
      prisma.patient.count({
        where: { hospitalId, registeredAt: rangeFilter },
      }),
      prisma.opVisit.count({
        where: { hospitalId, visitDate: rangeFilter },
      }),
      prisma.ipAdmission.count({
        where: { hospitalId, status: IP_STATUS.ADMITTED },
      }),
      prisma.bed.groupBy({
        by: ["status"],
        where: { hospitalId },
        _count: { _all: true },
      }),
      prisma.pharmacyReferral.groupBy({
        by: ["status"],
        where: { hospitalId, referredAt: rangeFilter },
        _count: { _all: true },
      }),
      prisma.labReferral.groupBy({
        by: ["status"],
        where: { hospitalId, referredAt: rangeFilter },
        _count: { _all: true },
      }),
      prisma.opVisit.aggregate({
        where: { hospitalId, visitDate: rangeFilter },
        _sum: { totalAmount: true },
      }),
      prisma.ipAdmission.aggregate({
        where: { hospitalId, admittedAt: rangeFilter },
        _sum: { chargeAmount: true },
      }),
      prisma.patient.findMany({
        where: { hospitalId, registeredAt: rangeFilter },
        take: 6,
        orderBy: { registeredAt: "desc" },
        select: {
          id: true,
          uhid: true,
          fullName: true,
          age: true,
          gender: true,
          phone: true,
          registeredAt: true,
        },
      }),
      prisma.ipAdmission.findMany({
        where: { hospitalId, admittedAt: rangeFilter },
        take: 6,
        orderBy: { admittedAt: "desc" },
        include: {
          patient: { select: { id: true, uhid: true, fullName: true } },
        },
      }),
      prisma.pharmacyReferral.findMany({
        where: { hospitalId, referredAt: rangeFilter },
        take: 6,
        orderBy: { referredAt: "desc" },
        include: { items: true },
      }),
      prisma.labReferral.findMany({
        where: { hospitalId, referredAt: rangeFilter },
        take: 6,
        orderBy: { referredAt: "desc" },
        include: { items: true },
      }),
      prisma.opVisit.findMany({
        where: { hospitalId, visitDate: { gte: chartStartUtc, lte: rangeEnd } },
        select: { visitDate: true },
      }),
      prisma.pharmacyReferral.findMany({
        where: { hospitalId, referredAt: { gte: chartStartUtc, lte: rangeEnd } },
        select: { referredAt: true },
      }),
      prisma.labReferral.findMany({
        where: { hospitalId, referredAt: { gte: chartStartUtc, lte: rangeEnd } },
        select: { referredAt: true },
      }),
    ]);

    const availableBeds =
      bedsGrouped.find((b) => b.status === BED_STATUS.AVAILABLE)?._count._all ?? 0;
    const occupiedBeds =
      bedsGrouped.find((b) => b.status === BED_STATUS.OCCUPIED)?._count._all ?? 0;
    const inactiveBeds =
      bedsGrouped.find((b) => b.status === BED_STATUS.INACTIVE)?._count._all ?? 0;

    const mapRefCounts = (rows: Array<{ status: string; _count: { _all: number } }>) => {
      const pending =
        rows.find((r) => r.status === REFERRAL_STATUS.PENDING)?._count._all ?? 0;
      const completed =
        rows.find((r) => r.status === REFERRAL_STATUS.COMPLETED)?._count._all ?? 0;
      const cancelled =
        rows.find((r) => r.status === REFERRAL_STATUS.CANCELLED)?._count._all ?? 0;
      return { total: pending + completed + cancelled, pending, completed, cancelled };
    };

    const toLocalDateKey = (date: Date) =>
      new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);

    // Build daily trend buckets in client local timezone
    const dailyMap = new Map<
      string,
      { date: string; label: string; opVisits: number; pharmacy: number; lab: number }
    >();
    for (let i = 0; i < chartDays; i++) {
      const d = new Date(
        Date.UTC(
          rangeEndLocal.getUTCFullYear(),
          rangeEndLocal.getUTCMonth(),
          rangeEndLocal.getUTCDate() - (chartDays - 1 - i)
        )
      );
      const key = d.toISOString().slice(0, 10);
      const label =
        chartDays <= 7
          ? d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })
          : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
      dailyMap.set(key, { date: key, label, opVisits: 0, pharmacy: 0, lab: 0 });
    }
    for (const v of opSeriesRows) {
      const bucket = dailyMap.get(toLocalDateKey(v.visitDate));
      if (bucket) bucket.opVisits++;
    }
    for (const p of pharmSeriesRows) {
      const bucket = dailyMap.get(toLocalDateKey(p.referredAt));
      if (bucket) bucket.pharmacy++;
    }
    for (const l of labSeriesRows) {
      const bucket = dailyMap.get(toLocalDateKey(l.referredAt));
      if (bucket) bucket.lab++;
    }

    const opGrossAmount = opGrossAgg._sum.totalAmount ?? 0;
    const ipGrossAmount = ipGrossAgg._sum.chargeAmount ?? 0;
    const totalGrossAmount = opGrossAmount + ipGrossAmount;

    return NextResponse.json({
      range: { from, to },
      kpis: {
        totalPatients: patientsInRange,
        totalPatientsAllTime,
        todaysOpCount: opCountInRange,
        currentIpCount,
        availableBeds,
        occupiedBeds,
        inactiveBeds,
        opGrossAmount,
        ipGrossAmount,
        totalGrossAmount,
        pharmacy: mapRefCounts(pharmGrouped),
        lab: mapRefCounts(labGrouped),
      },
      trends: Array.from(dailyMap.values()),
      recentPatients,
      recentAdmissions,
      recentPharmReferrals,
      recentLabReferrals,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
