import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const session = await requireHospitalAuth([ROLES.HOSPITAL_ADMIN]);
    const hospitalId = session.hospitalId;

    const [doctors, staffUsers, pharmacies, labs] = await Promise.all([
      prisma.doctor.findMany({
        where: { hospitalId },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        include: {
          user: {
            select: {
              id: true,
              username: true,
              isActive: true,
              lastLoginAt: true,
              passwordChangedAt: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.user.findMany({
        where: {
          hospitalId,
          role: { in: [ROLES.RECEPTIONIST, ROLES.HOSPITAL_ADMIN] },
        },
        select: {
          id: true,
          username: true,
          fullName: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          passwordChangedAt: true,
          lastLoginAt: true,
          createdAt: true,
        },
        orderBy: [{ role: "desc" }, { createdAt: "asc" }],
      }),
      prisma.pharmacyAccount.findMany({
        where: { hospitalId },
        orderBy: [{ isActive: "desc" }, { pharmacyName: "asc" }],
        include: {
          user: {
            select: {
              id: true,
              username: true,
              isActive: true,
              lastLoginAt: true,
              passwordChangedAt: true,
              createdAt: true,
            },
          },
          _count: { select: { referrals: true } },
        },
      }),
      prisma.labAccount.findMany({
        where: { hospitalId },
        orderBy: [{ isActive: "desc" }, { labName: "asc" }],
        include: {
          user: {
            select: {
              id: true,
              username: true,
              isActive: true,
              lastLoginAt: true,
              passwordChangedAt: true,
              createdAt: true,
            },
          },
          _count: { select: { referrals: true } },
        },
      }),
    ]);

    return NextResponse.json({
      currentUserId: session.user.id,
      consultancyEnabled: session.hospital.consultancyEnabled,
      doctors,
      staffUsers,
      pharmacies,
      labs,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
