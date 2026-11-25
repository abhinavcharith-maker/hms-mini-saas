import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePharmacyManagementAuth } from "@/lib/auth";
import { ApiError, handleApiError } from "@/lib/api-utils";

const patchPrescriptionSchema = z.object({
  status: z.enum(["PENDING", "DISPENSED", "CANCELLED"]),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePharmacyManagementAuth();
    if (!session.hospital.consultancyEnabled) {
      throw new ApiError(
        403,
        "Consultancy & doctor prescriptions are disabled for this hospital.",
        "CONSULTANCY_DISABLED"
      );
    }
    const { id } = await context.params;
    const body = await request.json();
    const input = patchPrescriptionSchema.parse(body);

    const existing = await prisma.doctorPrescription.findFirst({
      where: { id, hospitalId: session.hospitalId },
    });
    if (!existing) {
      throw new ApiError(404, "Prescription not found.", "NOT_FOUND");
    }

    const updated = await prisma.doctorPrescription.update({
      where: { id },
      data: {
        status: input.status,
        dispensedAt: input.status === "DISPENSED" ? new Date() : null,
      },
      include: { items: true },
    });

    return NextResponse.json({ prescription: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
