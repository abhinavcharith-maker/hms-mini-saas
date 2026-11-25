import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { ApiError, handleApiError } from "@/lib/api-utils";

export async function GET(
  _request: Request,
  context: { params: Promise<{ visitId: string }> }
) {
  try {
    const session = await requireHospitalAuth([
      ROLES.HOSPITAL_ADMIN,
      ROLES.RECEPTIONIST,
    ]);
    const { visitId } = await context.params;

    const visit = await prisma.opVisit.findFirst({
      where: {
        hospitalId: session.hospitalId,
        OR: [{ id: visitId }, { visitNumber: visitId }],
      },
      include: {
        patient: true,
        billingReceipts: { take: 1, orderBy: { issuedAt: "desc" } },
      },
    });

    if (!visit) {
      throw new ApiError(404, "OP visit record not found.", "NOT_FOUND");
    }

    const receiptSnap = visit.billingReceipts[0];

    return NextResponse.json({
      visit,
      patient: visit.patient,
      hospital: {
        name: receiptSnap?.hospitalNameSnapshot ?? session.hospital.name,
        address: receiptSnap?.hospitalAddressSnapshot ?? session.hospital.address,
        phone: receiptSnap?.hospitalPhoneSnapshot ?? session.hospital.phone,
        email: receiptSnap?.hospitalEmailSnapshot ?? session.hospital.email,
        logoDataUrl:
          receiptSnap?.hospitalLogoSnapshot ?? session.hospital.logoDataUrl,
        registrationNo: session.hospital.registrationNo,
        tagline: session.hospital.tagline,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
