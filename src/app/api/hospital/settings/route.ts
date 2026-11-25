import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { updateHospitalSchema } from "@/lib/validators";
import { recordAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const session = await requireHospitalAuth([ROLES.HOSPITAL_ADMIN]);
    const hospitalId = session.hospitalId;

    const [hospital, staffUsers, doctors, notifications] = await Promise.all([
      prisma.hospital.findUniqueOrThrow({ where: { id: hospitalId } }),
      prisma.user.findMany({
        where: {
          hospitalId,
          role: { in: [ROLES.HOSPITAL_ADMIN, ROLES.RECEPTIONIST] },
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
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      }),
      prisma.doctor.findMany({
        where: { hospitalId },
        orderBy: { name: "asc" },
      }),
      prisma.notification.findMany({
        where: { hospitalId },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
    ]);

    return NextResponse.json({
      hospital,
      staffUsers,
      doctors,
      notifications,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireHospitalAuth([ROLES.HOSPITAL_ADMIN]);
    const body = await request.json();
    const input = updateHospitalSchema.parse(body);

    const updated = await prisma.$transaction(async (tx) => {
      const h = await tx.hospital.update({
        where: { id: session.hospitalId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.tagline !== undefined ? { tagline: input.tagline } : {}),
          ...(input.registrationNo !== undefined
            ? { registrationNo: input.registrationNo }
            : {}),
          ...(input.uhidPrefix !== undefined ? { uhidPrefix: input.uhidPrefix } : {}),
          ...(input.defaultConsultationFee !== undefined
            ? { defaultConsultationFee: input.defaultConsultationFee }
            : {}),
          ...(input.logoDataUrl !== undefined
            ? { logoDataUrl: input.logoDataUrl }
            : {}),
        },
      });

      await recordAuditLog(
        {
          hospitalId: session.hospitalId,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "SETTINGS_UPDATED",
          referenceId: h.code,
          details: `Updated hospital information and operational settings for "${h.name}".`,
        },
        tx
      );

      return h;
    });

    return NextResponse.json({ hospital: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
