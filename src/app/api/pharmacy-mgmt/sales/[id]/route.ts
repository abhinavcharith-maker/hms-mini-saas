import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePharmacyManagementAuth } from "@/lib/auth";
import { ApiError, handleApiError } from "@/lib/api-utils";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePharmacyManagementAuth();
    const { id } = await context.params;

    const sale = await prisma.pharmacySale.findFirst({
      where: {
        hospitalId: session.hospitalId,
        OR: [{ id }, { saleNumber: id }],
      },
      include: {
        items: true,
      },
    });

    if (!sale) {
      throw new ApiError(404, "Pharmacy sale receipt not found.", "NOT_FOUND");
    }

    return NextResponse.json({
      sale,
      hospital: {
        name: session.hospital.name,
        code: session.hospital.code,
        address: session.hospital.address,
        phone: session.hospital.phone,
        email: session.hospital.email,
        logoDataUrl: session.hospital.logoDataUrl,
        registrationNo: session.hospital.registrationNo,
      },
      pharmacyName:
        session.pharmacyAccount?.pharmacyName ?? `${session.hospital.name} Pharmacy`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
