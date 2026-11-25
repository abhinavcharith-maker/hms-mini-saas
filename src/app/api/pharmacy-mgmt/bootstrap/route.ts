import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePharmacyManagementAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const session = await requirePharmacyManagementAuth();
    const hospitalId = session.hospitalId;

    const doctors = await prisma.doctor.findMany({
      where: { hospitalId, isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        specialty: true,
        qualification: true,
      },
    });

    return NextResponse.json({
      hospital: {
        id: session.hospital.id,
        name: session.hospital.name,
        code: session.hospital.code,
        address: session.hospital.address,
        phone: session.hospital.phone,
        email: session.hospital.email,
        logoDataUrl: session.hospital.logoDataUrl,
        pharmacyMode: session.hospital.pharmacyMode,
        consultancyEnabled: session.hospital.consultancyEnabled,
      },
      pharmacyName:
        session.pharmacyAccount?.pharmacyName ?? `${session.hospital.name} Pharmacy`,
      userRole: session.user.role,
      userFullName: session.user.fullName,
      doctors,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
