import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { createDoctorSchema } from "@/lib/validators";
import { hashPassword } from "@/lib/security";
import { recordAuditLog } from "@/lib/audit";
import { ApiError, handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const session = await requireHospitalAuth([
      ROLES.HOSPITAL_ADMIN,
      ROLES.RECEPTIONIST,
    ]);
    const doctors = await prisma.doctor.findMany({
      where: { hospitalId: session.hospitalId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        user: {
          select: {
            id: true,
            username: true,
            isActive: true,
            lastLoginAt: true,
          },
        },
      },
    });
    return NextResponse.json({ doctors });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireHospitalAuth([ROLES.HOSPITAL_ADMIN]);
    const body = await request.json();
    const input = createDoctorSchema.parse(body);

    if (input.username) {
      const existingUser = await prisma.user.findUnique({
        where: { username: input.username },
        select: { id: true },
      });
      if (existingUser) {
        throw new ApiError(
          409,
          `Username "${input.username}" is already taken.`,
          "USERNAME_EXISTS"
        );
      }
    }

    const passwordHash = input.password ? await hashPassword(input.password) : null;

    const doctor = await prisma.$transaction(async (tx) => {
      let createdUserId: string | null = null;
      if (input.username && passwordHash) {
        const user = await tx.user.create({
          data: {
            hospitalId: session.hospitalId,
            username: input.username,
            fullName: input.name,
            phone: input.phone ?? null,
            passwordHash,
            role: ROLES.DOCTOR,
            isActive: true,
          },
        });
        createdUserId = user.id;
      }

      const created = await tx.doctor.create({
        data: {
          hospitalId: session.hospitalId,
          userId: createdUserId,
          name: input.name,
          specialty: input.specialty ?? null,
          qualification: input.qualification ?? null,
          phone: input.phone ?? null,
          consultationFee: input.consultationFee ?? null,
          isActive: true,
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              isActive: true,
              lastLoginAt: true,
            },
          },
        },
      });
      await recordAuditLog(
        {
          hospitalId: session.hospitalId,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "DOCTOR_ADDED",
          referenceId: created.id,
          details: `Added consulting doctor ${created.name}${created.specialty ? ` (${created.specialty})` : ""}${input.username ? ` with Doctor Portal login @${input.username}` : ""}.`,
        },
        tx
      );
      return created;
    });

    return NextResponse.json({ doctor }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
