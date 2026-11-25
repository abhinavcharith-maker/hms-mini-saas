import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePharmacyManagementAuth } from "@/lib/auth";
import { ApiError, handleApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const session = await requirePharmacyManagementAuth();
    if (!session.hospital.consultancyEnabled) {
      throw new ApiError(
        403,
        "Consultancy & doctor prescriptions are disabled for this hospital.",
        "CONSULTANCY_DISABLED"
      );
    }
    const hospitalId = session.hospitalId;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "PENDING";

    const [pendingCount, prescriptions] = await Promise.all([
      prisma.doctorPrescription.count({
        where: { hospitalId, status: "PENDING" },
      }),
      prisma.doctorPrescription.findMany({
        where: {
          hospitalId,
          ...(status === "ALL" ? {} : { status }),
        },
        orderBy: [{ prescribedAt: "desc" }],
        take: 100,
        include: {
          items: true,
        },
      }),
    ]);

    return NextResponse.json({ pendingCount, prescriptions });
  } catch (error) {
    return handleApiError(error);
  }
}
