import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES, getRoleLabel } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { createStaffSchema } from "@/lib/validators";
import { hashPassword } from "@/lib/security";
import { recordAuditLog } from "@/lib/audit";
import { ApiError, handleApiError } from "@/lib/api-utils";

export async function POST(request: Request) {
  try {
    const session = await requireHospitalAuth([ROLES.HOSPITAL_ADMIN]);
    const body = await request.json();
    const input = createStaffSchema.parse(body);

    const existing = await prisma.user.findUnique({
      where: { username: input.username },
    });
    if (existing) {
      throw new ApiError(
        409,
        `Username "${input.username}" is already taken.`,
        "USERNAME_EXISTS"
      );
    }

    const passwordHash = await hashPassword(input.password);

    const staff = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          hospitalId: session.hospitalId,
          username: input.username,
          fullName: input.fullName,
          email: input.email ?? null,
          phone: input.phone ?? null,
          passwordHash,
          role: input.role,
          isActive: true,
        },
        select: {
          id: true,
          username: true,
          fullName: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      });

      await recordAuditLog(
        {
          hospitalId: session.hospitalId,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "ACCOUNT_CREATED",
          referenceId: created.username,
          details: `Created ${getRoleLabel(created.role)} account "@${created.username}" (${created.fullName}).`,
        },
        tx
      );

      return created;
    });

    return NextResponse.json({ staff }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
