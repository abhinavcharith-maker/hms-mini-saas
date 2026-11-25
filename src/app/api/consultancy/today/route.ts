import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PHARMACY_MODE, ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { getLocalDayAndMonthBounds, parseSafeTzOffset } from "@/lib/datetime";
import { getBatchExpiryStatus } from "@/lib/pharmacy-utils";
import { ApiError, handleApiError } from "@/lib/api-utils";

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

    // Doctor is strictly locked to their own patients; Admin may filter by doctorId or view all
    const requestedDoctorId = searchParams.get("doctorId")?.trim() || null;
    const filterDoctorId = isDoctor
      ? session.doctor!.id
      : requestedDoctorId && requestedDoctorId !== "ALL"
        ? requestedDoctorId
        : null;

    const pharmacyMode = session.hospital.pharmacyMode;

    const [
      doctors,
      todayVisits,
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
        include: {
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
            orderBy: { prescribedAt: "desc" },
            include: { items: true },
          },
          pharmacyReferrals: {
            orderBy: { referredAt: "desc" },
            include: { items: true },
          },
          labReferrals: {
            orderBy: { referredAt: "desc" },
            include: { items: true },
          },
        },
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
