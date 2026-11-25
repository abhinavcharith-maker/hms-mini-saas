import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BED_STATUS, IP_STATUS, ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { bedSchema } from "@/lib/validators";
import { recordAuditLog } from "@/lib/audit";
import { ApiError, handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const session = await requireHospitalAuth([
      ROLES.HOSPITAL_ADMIN,
      ROLES.RECEPTIONIST,
    ]);

    const beds = await prisma.bed.findMany({
      where: { hospitalId: session.hospitalId },
      orderBy: [{ ward: "asc" }, { bedNumber: "asc" }],
      include: {
        ipAdmissions: {
          where: { status: IP_STATUS.ADMITTED },
          take: 1,
          include: {
            patient: {
              select: { id: true, uhid: true, fullName: true, phone: true, gender: true, age: true },
            },
          },
        },
      },
    });

    return NextResponse.json({ beds });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireHospitalAuth([ROLES.HOSPITAL_ADMIN]);
    const body = await request.json();
    const input = bedSchema.parse(body);

    const existing = await prisma.bed.findFirst({
      where: { hospitalId: session.hospitalId, bedNumber: input.bedNumber },
    });
    if (existing) {
      throw new ApiError(
        409,
        `Bed number "${input.bedNumber}" already exists in this hospital.`,
        "BED_EXISTS"
      );
    }

    const bed = await prisma.$transaction(async (tx) => {
      const created = await tx.bed.create({
        data: {
          hospitalId: session.hospitalId,
          bedNumber: input.bedNumber,
          ward: input.ward,
          category: input.category ?? null,
          notes: input.notes ?? null,
          status: input.status ?? BED_STATUS.AVAILABLE,
        },
      });

      await recordAuditLog(
        {
          hospitalId: session.hospitalId,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "BED_CREATED",
          referenceId: created.bedNumber,
          details: `Added bed ${created.bedNumber} in ${created.ward}${created.category ? ` (${created.category})` : ""}.`,
        },
        tx
      );

      return created;
    });

    return NextResponse.json({ bed }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
