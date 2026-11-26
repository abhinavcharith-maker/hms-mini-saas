import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PHARMACY_MODE, ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import {
  getLocalDayAndMonthBounds,
  parseDateRangeBounds,
  parseSafeTzOffset,
} from "@/lib/datetime";
import { getBatchExpiryStatus } from "@/lib/pharmacy-utils";
import { ApiError, handleApiError } from "@/lib/api-utils";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const session = await requireHospitalAuth([
      ROLES.HOSPITAL_ADMIN,
      ROLES.DOCTOR,
    ]);
    const hospitalId = session.hospitalId;
    if (!session.hospital.consultancyEnabled) {
      throw new ApiError(
        403,
        "Consultancy module is disabled for this hospital by Super Admin.",
        "CONSULTANCY_DISABLED"
      );
    }
    const isDoctor = session.user.role === ROLES.DOCTOR;

    if (isDoctor && !session.doctor) {
      throw new ApiError(403, "Doctor profile is not linked.", "DOCTOR_REQUIRED");
    }

    const { searchParams } = new URL(request.url);
    const tzOffsetMinutes =
      parseSafeTzOffset(searchParams.get("tzOffset"), 0) ?? 0;
    const { todayStart, todayEnd } = getLocalDayAndMonthBounds(tzOffsetMinutes);

    // Submitted history range: "today" (default) | "yesterday" | "3d" | "7d" | "custom"
    const historyRange = (searchParams.get("historyRange") ?? "today").trim();
    const historyDate = (searchParams.get("historyDate") ?? "").trim();

    let histStart = todayStart;
    let histEnd = todayEnd;

    if (historyRange === "yesterday") {
      histStart = new Date(todayStart.getTime() - DAY_MS);
      histEnd = new Date(todayStart.getTime() - 1);
    } else if (historyRange === "3d") {
      histStart = new Date(todayStart.getTime() - 2 * DAY_MS);
      histEnd = todayEnd;
    } else if (historyRange === "7d") {
      histStart = new Date(todayStart.getTime() - 6 * DAY_MS);
      histEnd = todayEnd;
    } else if (historyRange === "custom" && /^\d{4}-\d{2}-\d{2}$/.test(historyDate)) {
      const bounds = parseDateRangeBounds({
        from: historyDate,
        to: historyDate,
        tzOffsetMinutes,
      });
      if (bounds.gte && bounds.lte) {
        histStart = bounds.gte;
        histEnd = bounds.lte;
      }
    }

    // Doctor is strictly locked to their own patients; Admin may filter by doctorId or view all
    const requestedDoctorId = searchParams.get("doctorId")?.trim() || null;
    const filterDoctorId = isDoctor
      ? session.doctor!.id
      : requestedDoctorId && requestedDoctorId !== "ALL"
        ? requestedDoctorId
        : null;

    const pharmacyMode = session.hospital.pharmacyMode;

    const visitInclude = {
      patient: {
        select: {
          id: true,
          uhid: true,
          fullName: true,
          age: true,
          gender: true,
          phone: true,
        },
      },
      doctor: {
        select: {
          id: true,
          name: true,
          specialty: true,
          qualification: true,
        },
      },
      doctorPrescriptions: {
        orderBy: { prescribedAt: "desc" as const },
        include: { items: true },
      },
      pharmacyReferrals: {
        orderBy: { referredAt: "desc" as const },
        include: { items: true },
      },
      labReferrals: {
        orderBy: { referredAt: "desc" as const },
        include: { items: true },
      },
    };

    const [
      doctors,
      todayVisits,
      submittedVisits,
      labTestCatalog,
      labAccounts,
      pharmacyMedicinesRaw,
      medicineCatalog,
      pharmacyAccounts,
    ] = await Promise.all([
      prisma.doctor.findMany({
        where: { hospitalId, isActive: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          specialty: true,
          qualification: true,
        },
      }),
      prisma.opVisit.findMany({
        where: {
          hospitalId,
          visitDate: { gte: todayStart, lte: todayEnd },
          ...(filterDoctorId ? { doctorId: filterDoctorId } : {}),
        },
        orderBy: [{ visitDate: "desc" }, { createdAt: "desc" }],
        include: visitInclude,
      }),
      prisma.opVisit.findMany({
        where: {
          hospitalId,
          ...(filterDoctorId ? { doctorId: filterDoctorId } : {}),
          OR: [
            {
              consultancyCompletedAt: { gte: histStart, lte: histEnd },
            },
            {
              consultancyCompletedAt: null,
              visitDate: { gte: histStart, lte: histEnd },
              OR: [
                { doctorPrescriptions: { some: {} } },
                { pharmacyReferrals: { some: {} } },
                { labReferrals: { some: {} } },
              ],
            },
          ],
        },
        orderBy: [
          { consultancyCompletedAt: "desc" },
          { visitDate: "desc" },
          { createdAt: "desc" },
        ],
        include: visitInclude,
      }),
      prisma.labTestCatalog.findMany({
        where: { hospitalId, isActive: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
        },
      }),
      prisma.labAccount.findMany({
        where: { hospitalId, isActive: true },
        orderBy: { labName: "asc" },
        select: {
          id: true,
          labName: true,
          contactPerson: true,
          phone: true,
        },
      }),
      pharmacyMode === PHARMACY_MODE.MANAGEMENT
        ? prisma.pharmacyMedicine.findMany({
            where: { hospitalId },
            orderBy: { name: "asc" },
            include: {
              batches: {
                select: {
                  expiryMonth: true,
                  expiryYear: true,
                  quantityUnits: true,
                },
              },
            },
          })
        : Promise.resolve([]),
      pharmacyMode === PHARMACY_MODE.REFERRALS
        ? prisma.medicineCatalog.findMany({
            where: { hospitalId, isActive: true },
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              description: true,
              price: true,
            },
          })
        : Promise.resolve([]),
      pharmacyMode === PHARMACY_MODE.REFERRALS
        ? prisma.pharmacyAccount.findMany({
            where: { hospitalId, isActive: true },
            orderBy: { pharmacyName: "asc" },
            select: {
              id: true,
              pharmacyName: true,
              contactPerson: true,
              phone: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const pendingVisits = todayVisits.filter((v) => !v.consultancyCompletedAt);

    const now = new Date();
    const pharmacyMedicines = pharmacyMedicinesRaw.map((m) => {
      const validUnits = m.batches.reduce(
        (sum, b) =>
          getBatchExpiryStatus(b.expiryMonth, b.expiryYear, now).isExpired
            ? sum
            : sum + b.quantityUnits,
        0
      );
      return {
        id: m.id,
        name: m.name,
        packagingType: m.packagingType,
        unitsPerSheet: m.unitsPerSheet,
        validUnits,
      };
    });

    return NextResponse.json({
      role: session.user.role,
      pharmacyMode,
      currentDoctor: session.doctor,
      doctors,
      todayVisits,
      pendingVisits,
      submittedVisits,
      pharmacyMedicines,
      medicineCatalog,
      pharmacyAccounts,
      labTestCatalog,
      labAccounts,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
