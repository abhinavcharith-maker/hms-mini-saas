import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BED_STATUS, IP_STATUS, REFERRAL_STATUS, ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import {
  getLocalDateInputValue,
  getLocalDayAndMonthBounds,
  parseDateRangeBounds,
  parseSafeTzOffset,
} from "@/lib/datetime";
import { handleApiError } from "@/lib/api-utils";

function escapeCsvCell(val: string | number | null | undefined): string {
  let s = val === null || val === undefined ? "" : String(val);
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(request: Request) {
  try {
    const session = await requireHospitalAuth([ROLES.HOSPITAL_ADMIN]);
    const hospitalId = session.hospitalId;
    const { searchParams } = new URL(request.url);

    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const tzOffsetMinutes = parseSafeTzOffset(searchParams.get("tzOffset"), null);
    const format = searchParams.get("format");

    const { todayStart, todayEnd, offsetMs } =
      getLocalDayAndMonthBounds(tzOffsetMinutes);
    const recent30DaysStart = new Date(
      todayStart.getTime() - 29 * 24 * 60 * 60 * 1000
    );

    const parsedBounds = parseDateRangeBounds({
      from: fromParam,
      to: toParam,
      tzOffsetMinutes,
    });

    const fromDate = parsedBounds.gte ?? recent30DaysStart;
    const toDate = parsedBounds.lte ?? todayEnd;

    const isPharmacyMgmt = session.hospital?.pharmacyMode === "MANAGEMENT";

    const [
      opVisits,
      ipAdmissions,
      ipExtensionsInRange,
      pharmacySales,
      beds,
      pharmReferrals,
      labReferrals,
    ] = await Promise.all([
      prisma.opVisit.findMany({
        where: { hospitalId, visitDate: { gte: fromDate, lte: toDate } },
        select: {
          id: true,
          visitDate: true,
          doctorNameSnapshot: true,
          totalAmount: true,
          paymentMode: true,
        },
        orderBy: { visitDate: "asc" },
      }),
      prisma.ipAdmission.findMany({
        where: { hospitalId, admittedAt: { gte: fromDate, lte: toDate } },
        select: {
          id: true,
          admittedAt: true,
          dischargedAt: true,
          status: true,
          wardSnapshot: true,
          chargeAmount: true,
          paymentMode: true,
          stayExtensions: {
            select: { amountCollected: true },
          },
        },
      }),
      prisma.ipStayExtension.findMany({
        where: { hospitalId, createdAt: { gte: fromDate, lte: toDate } },
        select: {
          id: true,
          ipAdmissionId: true,
          amountCollected: true,
          paymentMode: true,
          createdAt: true,
        },
      }),
      isPharmacyMgmt
        ? prisma.pharmacySale.findMany({
            where: { hospitalId, soldAt: { gte: fromDate, lte: toDate } },
            select: {
              id: true,
              totalAmount: true,
              paymentMode: true,
              totalUnitsSold: true,
            },
          })
        : Promise.resolve([]),
      prisma.bed.findMany({
        where: { hospitalId },
        select: { id: true, ward: true, status: true },
      }),
        prisma.pharmacyReferral.findMany({
          where: { hospitalId, referredAt: { gte: fromDate, lte: toDate } },
          select: {
            id: true,
            pharmacyAccountId: true,
            pharmacyNameSnapshot: true,
            status: true,
            totalAmount: true,
            referredAt: true,
          },
        }),
        prisma.labReferral.findMany({
          where: { hospitalId, referredAt: { gte: fromDate, lte: toDate } },
          select: {
            id: true,
            labAccountId: true,
            labNameSnapshot: true,
            status: true,
            totalAmount: true,
            referredAt: true,
          },
        }),
      ]);

    // OP registrations by date (strictly capped to the most recent 30 days)
    const opByDateMap = new Map<string, number>();
    const hasOffset =
      tzOffsetMinutes !== null && Number.isFinite(tzOffsetMinutes);
    for (const v of opVisits) {
      if (v.visitDate < recent30DaysStart || v.visitDate > todayEnd) {
        continue;
      }
      const key = hasOffset
        ? new Date(v.visitDate.getTime() - offsetMs).toISOString().slice(0, 10)
        : getLocalDateInputValue(v.visitDate);
      opByDateMap.set(key, (opByDateMap.get(key) ?? 0) + 1);
    }
    const opByDate = Array.from(opByDateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30)
      .map(([date, count]) => ({
        date,
        count,
      }));

    // Bed occupancy summary
    const totalBeds = beds.length;
    const occupiedBeds = beds.filter((b) => b.status === BED_STATUS.OCCUPIED).length;
    const availableBeds = beds.filter((b) => b.status === BED_STATUS.AVAILABLE).length;
    const inactiveBeds = beds.filter((b) => b.status === BED_STATUS.INACTIVE).length;
    const occupancyRate =
      totalBeds - inactiveBeds > 0
        ? Math.round((occupiedBeds / (totalBeds - inactiveBeds)) * 100)
        : 0;

    // Pharmacy breakdown
    const pharmStatsMap = new Map<
      string,
      {
        name: string;
        total: number;
        pending: number;
        completed: number;
        cancelled: number;
        optionalEnteredAmountTotal: number | null;
        pricedReferralCount: number;
      }
    >();
    for (const r of pharmReferrals) {
      const cur = pharmStatsMap.get(r.pharmacyAccountId) ?? {
        name: r.pharmacyNameSnapshot,
        total: 0,
        pending: 0,
        completed: 0,
        cancelled: 0,
        optionalEnteredAmountTotal: null,
        pricedReferralCount: 0,
      };
      cur.total++;
      if (r.status === REFERRAL_STATUS.PENDING) cur.pending++;
      if (r.status === REFERRAL_STATUS.COMPLETED) cur.completed++;
      if (r.status === REFERRAL_STATUS.CANCELLED) cur.cancelled++;
      if (r.totalAmount !== null) {
        cur.optionalEnteredAmountTotal =
          (cur.optionalEnteredAmountTotal ?? 0) + r.totalAmount;
        cur.pricedReferralCount++;
      }
      pharmStatsMap.set(r.pharmacyAccountId, cur);
    }

    // Lab breakdown
    const labStatsMap = new Map<
      string,
      {
        name: string;
        total: number;
        pending: number;
        completed: number;
        cancelled: number;
        optionalEnteredAmountTotal: number | null;
        pricedReferralCount: number;
      }
    >();
    for (const r of labReferrals) {
      const cur = labStatsMap.get(r.labAccountId) ?? {
        name: r.labNameSnapshot,
        total: 0,
        pending: 0,
        completed: 0,
        cancelled: 0,
        optionalEnteredAmountTotal: null,
        pricedReferralCount: 0,
      };
      cur.total++;
      if (r.status === REFERRAL_STATUS.PENDING) cur.pending++;
      if (r.status === REFERRAL_STATUS.COMPLETED) cur.completed++;
      if (r.status === REFERRAL_STATUS.CANCELLED) cur.cancelled++;
      if (r.totalAmount !== null) {
        cur.optionalEnteredAmountTotal =
          (cur.optionalEnteredAmountTotal ?? 0) + r.totalAmount;
        cur.pricedReferralCount++;
      }
      labStatsMap.set(r.labAccountId, cur);
    }

    const normalizePayMode = (m?: string | null): "CASH" | "UPI" | "CARD" => {
      const upper = (m ?? "").trim().toUpperCase();
      if (upper === "UPI") return "UPI";
      if (upper === "CARD") return "CARD";
      return "CASH";
    };

    const paymentBreakdown = {
      CASH: { op: 0, ip: 0, pharmacy: 0, total: 0 },
      UPI: { op: 0, ip: 0, pharmacy: 0, total: 0 },
      CARD: { op: 0, ip: 0, pharmacy: 0, total: 0 },
    };

    let opGrossAmount = 0;
    for (const v of opVisits) {
      const amt = v.totalAmount ?? 0;
      if (amt > 0) {
        opGrossAmount += amt;
        const mode = normalizePayMode(v.paymentMode);
        paymentBreakdown[mode].op += amt;
        paymentBreakdown[mode].total += amt;
      }
    }

    let ipGrossAmount = 0;
    for (const a of ipAdmissions) {
      const totalExtForAdm = a.stayExtensions.reduce(
        (sum, e) => sum + (e.amountCollected ?? 0),
        0
      );
      const initialCharge = Math.max(0, (a.chargeAmount ?? 0) - totalExtForAdm);
      if (initialCharge > 0) {
        ipGrossAmount += initialCharge;
        const mode = normalizePayMode(a.paymentMode);
        paymentBreakdown[mode].ip += initialCharge;
        paymentBreakdown[mode].total += initialCharge;
      }
    }

    for (const ext of ipExtensionsInRange) {
      const amt = ext.amountCollected ?? 0;
      if (amt > 0) {
        ipGrossAmount += amt;
        const mode = normalizePayMode(ext.paymentMode);
        paymentBreakdown[mode].ip += amt;
        paymentBreakdown[mode].total += amt;
      }
    }

    let pharmacyGrossAmount = 0;
    for (const ps of pharmacySales) {
      const amt = ps.totalAmount ?? 0;
      if (amt > 0) {
        pharmacyGrossAmount += amt;
        const mode = normalizePayMode(ps.paymentMode);
        paymentBreakdown[mode].pharmacy += amt;
        paymentBreakdown[mode].total += amt;
      }
    }

    const r2 = (n: number) => Math.round(n * 100) / 100;
    opGrossAmount = r2(opGrossAmount);
    ipGrossAmount = r2(ipGrossAmount);
    pharmacyGrossAmount = r2(pharmacyGrossAmount);
    const totalGrossAmount = r2(opGrossAmount + ipGrossAmount + pharmacyGrossAmount);
    for (const key of ["CASH", "UPI", "CARD"] as const) {
      paymentBreakdown[key].op = r2(paymentBreakdown[key].op);
      paymentBreakdown[key].ip = r2(paymentBreakdown[key].ip);
      paymentBreakdown[key].pharmacy = r2(paymentBreakdown[key].pharmacy);
      paymentBreakdown[key].total = r2(paymentBreakdown[key].total);
    }

    const summary = {
      range: { from: fromDate.toISOString(), to: toDate.toISOString() },
      pharmacyMode: session.hospital?.pharmacyMode ?? "REFERRALS",
      opRegistrationsCount: opVisits.length,
      ipAdmissionsCount: ipAdmissions.length,
      pharmacySalesCount: pharmacySales.length,
      opGrossAmount,
      ipGrossAmount,
      pharmacyGrossAmount,
      totalGrossAmount,
      paymentBreakdown,
      activeAdmissionsCount: ipAdmissions.filter(
        (a) => a.status === IP_STATUS.ADMITTED
      ).length,
      dischargedCount: ipAdmissions.filter(
        (a) => a.status === IP_STATUS.DISCHARGED
      ).length,
      bedOccupancy: {
        totalBeds,
        availableBeds,
        occupiedBeds,
        inactiveBeds,
        occupancyRate,
      },
      pharmacy: {
        total: pharmReferrals.length,
        pending: pharmReferrals.filter((r) => r.status === REFERRAL_STATUS.PENDING)
          .length,
        completed: pharmReferrals.filter(
          (r) => r.status === REFERRAL_STATUS.COMPLETED
        ).length,
        cancelled: pharmReferrals.filter(
          (r) => r.status === REFERRAL_STATUS.CANCELLED
        ).length,
        byPartner: Array.from(pharmStatsMap.values()),
      },
      laboratory: {
        total: labReferrals.length,
        pending: labReferrals.filter((r) => r.status === REFERRAL_STATUS.PENDING)
          .length,
        completed: labReferrals.filter((r) => r.status === REFERRAL_STATUS.COMPLETED)
          .length,
        cancelled: labReferrals.filter((r) => r.status === REFERRAL_STATUS.CANCELLED)
          .length,
        byPartner: Array.from(labStatsMap.values()),
      },
      opByDate,
      accountingDisclaimer:
        "Referral amounts represent optional entered partner values only. They are not treated as guaranteed hospital revenue or commission.",
    };

    if (format === "csv") {
      const lines = [
        "Section,Metric,Total,Pending,Completed,Cancelled,Optional Entered Referral Value (Non-Commission)",
        `OP Visits,Total OP Visits,${summary.opRegistrationsCount},,,,`,
        `IP Admissions,Admissions in Range,${summary.ipAdmissionsCount},,,,`,
        `Beds,Occupancy Rate (${occupancyRate}%),${totalBeds},${availableBeds} Available,${occupiedBeds} Occupied,${inactiveBeds} Inactive,`,
        ...summary.pharmacy.byPartner.map(
          (p) =>
            `Pharmacy Partner,${escapeCsvCell(p.name)},${p.total},${p.pending},${p.completed},${p.cancelled},${p.optionalEnteredAmountTotal ?? "N/A"}`
        ),
        ...summary.laboratory.byPartner.map(
          (l) =>
            `Laboratory Partner,${escapeCsvCell(l.name)},${l.total},${l.pending},${l.completed},${l.cancelled},${l.optionalEnteredAmountTotal ?? "N/A"}`
        ),
      ].join("\n");

      return new NextResponse(lines, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="hospital-report-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json(summary);
  } catch (error) {
    return handleApiError(error);
  }
}
