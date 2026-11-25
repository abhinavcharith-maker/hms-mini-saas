import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { ApiError, handleApiError } from "@/lib/api-utils";

export async function GET(
  _request: Request,
  context: { params: Promise<{ receiptId: string }> }
) {
  try {
    const session = await requireHospitalAuth([
      ROLES.HOSPITAL_ADMIN,
      ROLES.RECEPTIONIST,
    ]);
    const { receiptId } = await context.params;

    const receipt = await prisma.billingReceipt.findFirst({
      where: {
        hospitalId: session.hospitalId,
        OR: [{ id: receiptId }, { receiptNumber: receiptId }],
      },
      include: {
        patient: {
          select: {
            uhid: true,
            fullName: true,
            age: true,
            gender: true,
            phone: true,
            address: true,
          },
        },
        opVisit: {
          select: {
            visitNumber: true,
            visitDate: true,
            doctorNameSnapshot: true,
            departmentSnapshot: true,
          },
        },
      },
    });

    if (!receipt) {
      throw new ApiError(404, "Billing receipt not found.", "NOT_FOUND");
    }

    let lineItems: Array<{ label: string; amount: number }> = [];
    try {
      lineItems = JSON.parse(receipt.lineItemsJson);
    } catch {
      lineItems = [];
    }

    return NextResponse.json({
      receipt: {
        ...receipt,
        hospitalRegistrationNo: session.hospital.registrationNo,
        lineItems,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
