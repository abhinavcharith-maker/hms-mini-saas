import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { createHospitalSchema } from "@/lib/validators";
import { hashPassword } from "@/lib/security";
import { generateAuditEventId, pruneHospitalAuditLogs } from "@/lib/audit";
import { getLocalDayAndMonthBounds, parseSafeTzOffset } from "@/lib/datetime";
import {
  addCalendarMonths,
  evaluateHospitalPaymentState,
  formatInrAmount,
} from "@/lib/payments";
import { ApiError, handleApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    await requireAuth([ROLES.SUPER_ADMIN]);
    const { searchParams } = new URL(request.url);
    const tzOffsetMinutes = parseSafeTzOffset(searchParams.get("tzOffset"), 0) ?? 0;
    const { todayStart, todayEnd, monthStart } =
      getLocalDayAndMonthBounds(tzOffsetMinutes);

    const [
      hospitals,
      todayPatientsGrp,
      todayOpGrp,
      todayIpGrp,
      monthPatientsGrp,
      monthOpGrp,
      monthIpGrp,
    ] = await Promise.all([
      prisma.hospital.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          users: {
            select: {
              id: true,
              username: true,
              fullName: true,
              email: true,
              phone: true,
              role: true,
              isActive: true,
              lastLoginAt: true,
              passwordChangedAt: true,
              createdAt: true,
            },
            orderBy: { createdAt: "asc" },
          },
          pharmacyAccounts: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  isActive: true,
                  lastLoginAt: true,
                },
              },
            },
          },
          labAccounts: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  isActive: true,
                  lastLoginAt: true,
                },
              },
            },
          },
          _count: {
            select: {
              patients: true,
              opVisits: true,
              ipAdmissions: true,
              beds: true,
              pharmacyReferrals: true,
              labReferrals: true,
            },
          },
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
      prisma.opVisit.groupBy({
        by: ["hospitalId"],
        where: { visitDate: { gte: monthStart, lte: todayEnd } },
        _count: { _all: true },
      }),
      prisma.ipAdmission.groupBy({
        by: ["hospitalId"],
        where: { admittedAt: { gte: monthStart, lte: todayEnd } },
        _count: { _all: true },
      }),
    ]);

    const toMap = (rows: Array<{ hospitalId: string; _count: { _all: number } }>) =>
      new Map(rows.map((r) => [r.hospitalId, r._count._all]));

    const tpMap = toMap(todayPatientsGrp);
    const topMap = toMap(todayOpGrp);
    const tipMap = toMap(todayIpGrp);
    const mpMap = toMap(monthPatientsGrp);
    const mopMap = toMap(monthOpGrp);
    const mipMap = toMap(monthIpGrp);

    const now = new Date();
    const enrichedHospitals = hospitals.map((h) => {
      const todayPatients = tpMap.get(h.id) ?? 0;
      const todayOp = topMap.get(h.id) ?? 0;
      const todayIp = tipMap.get(h.id) ?? 0;
      const monthPatients = mpMap.get(h.id) ?? 0;
      const monthOp = mopMap.get(h.id) ?? 0;
      const monthIp = mipMap.get(h.id) ?? 0;
      const opExceeded =
        h.dailyOpLimit !== null && h.dailyOpLimit !== undefined && todayOp > h.dailyOpLimit;
      const paymentState = evaluateHospitalPaymentState(
        h.subscriptionExpiresAt,
        now
      );

      return {
        ...h,
        paymentState,
        dailyStats: {
          todayPatients,
          todayOp,
          todayIp,
          monthPatients,
          monthOp,
          monthIp,
          opExceeded,
        },
      };
    });

    const limitAlerts = enrichedHospitals
      .filter((h) => h.dailyStats.opExceeded)
      .map((h) => ({
        hospitalId: h.id,
        hospitalName: h.name,
        todayOp: h.dailyStats.todayOp,
        dailyOpLimit: h.dailyOpLimit,
        opExceeded: h.dailyStats.opExceeded,
      }));

    const paymentAlerts = enrichedHospitals
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

    return NextResponse.json({
      hospitals: enrichedHospitals,
      limitAlerts,
      paymentAlerts,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuth([ROLES.SUPER_ADMIN]);
    const body = await request.json();
    const input = createHospitalSchema.parse(body);

    let hospitalCode = input.code;
    if (!hospitalCode) {
      const base =
        input.name
          .replace(/[^a-zA-Z0-9]/g, "")
          .toUpperCase()
          .slice(0, 4) || "HOSP";
      for (let attempt = 0; attempt < 15; attempt++) {
        const suffix = crypto.randomBytes(2).toString("hex").toUpperCase();
        const candidate = `${base}-${suffix}`;
        const clash = await prisma.hospital.findFirst({
          where: {
            OR: [{ code: candidate }, { slug: candidate.toLowerCase() }],
          },
          select: { id: true },
        });
        if (!clash) {
          hospitalCode = candidate;
          break;
        }
      }
      if (!hospitalCode) {
        hospitalCode = `H-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      }
    }

    const slug = hospitalCode.toLowerCase().replace(/[^a-z0-9-]+/g, "-");

    const existingHospital = await prisma.hospital.findFirst({
      where: { OR: [{ code: hospitalCode }, { slug }] },
    });
    if (existingHospital) {
      throw new ApiError(
        409,
        `Hospital identifier code "${hospitalCode}" is already registered.`,
        "HOSPITAL_EXISTS"
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { username: input.adminUsername },
    });
    if (existingUser) {
      throw new ApiError(
        409,
        `Username "${input.adminUsername}" is already taken.`,
        "USERNAME_EXISTS"
      );
    }

    const passwordHash = await hashPassword(input.adminPassword);
    const now = new Date();
    const initialPaidMonths = input.paidMonths;
    const initialAmountRounded =
      input.initialPaymentAmount !== null && input.initialPaymentAmount !== undefined
        ? Math.round(input.initialPaymentAmount * 100) / 100
        : 0;
    const initialExpiresAt = addCalendarMonths(now, initialPaidMonths);

    const created = await prisma.$transaction(async (tx) => {
      const hospital = await tx.hospital.create({
        data: {
          code: hospitalCode,
          name: input.name,
          slug,
          uhidPrefix: input.uhidPrefix || "UHID",
          address: input.address ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          tagline: input.tagline ?? null,
          registrationNo: input.registrationNo ?? null,
          dailyOpLimit: input.dailyOpLimit ?? null,
          dailyIpLimit: null,
          pharmacyMode: input.pharmacyMode,
          consultancyEnabled: input.consultancyEnabled,
          subscriptionMonthsPaid: initialPaidMonths,
          subscriptionExpiresAt: initialExpiresAt,
          subscriptionTotalPaid: initialAmountRounded,
          isActive: true,
        },
      });

      await tx.hospitalPayment.create({
        data: {
          hospitalId: hospital.id,
          durationValue: initialPaidMonths,
          durationUnit: "MONTHS",
          monthsAdded: initialPaidMonths,
          amountCollected: initialAmountRounded,
          previousExpiresAt: null,
          newExpiresAt: initialExpiresAt,
          notes: "Initial onboarding subscription payment",
          recordedByUserId: session.user.id,
          recordedByUsername: session.user.username,
          paidAt: now,
        },
      });

      const adminUser = await tx.user.create({
        data: {
          hospitalId: hospital.id,
          username: input.adminUsername,
          fullName: input.adminFullName,
          email: input.adminEmail ?? null,
          phone: input.adminPhone ?? null,
          passwordHash,
          role: ROLES.HOSPITAL_ADMIN,
          isActive: true,
        },
        select: {
          id: true,
          username: true,
          fullName: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      });

      const paymentSuffix =
        initialPaidMonths > 0
          ? ` Paid ${initialPaidMonths} month(s) (${formatInrAmount(initialAmountRounded)}).`
          : "";

      await tx.auditLog.create({
        data: {
          eventId: generateAuditEventId(),
          hospitalId: hospital.id,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "HOSPITAL_CREATED",
          referenceId: hospital.code,
          details: `Created hospital "${hospital.name}" (${hospital.code}) with Hospital Admin "@${adminUser.username}".${paymentSuffix}`,
        },
      });
      await pruneHospitalAuditLogs(hospital.id, tx);

      return { hospital, adminUser };
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
