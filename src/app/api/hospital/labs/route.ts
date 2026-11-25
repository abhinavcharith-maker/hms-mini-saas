import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { createExternalPartnerSchema } from "@/lib/validators";
import { hashPassword } from "@/lib/security";
import { recordAuditLog } from "@/lib/audit";
import { ApiError, handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const session = await requireHospitalAuth([
      ROLES.HOSPITAL_ADMIN,
      ROLES.RECEPTIONIST,
    ]);

    const labs = await prisma.labAccount.findMany({
      where: { hospitalId: session.hospitalId },
      orderBy: [{ isActive: "desc" }, { labName: "asc" }],
      include: {
        user: {
          select: {
            id: true,
            username: true,
            isActive: true,
            lastLoginAt: true,
            passwordChangedAt: true,
            createdAt: true,
          },
        },
        _count: {
          select: { referrals: true },
        },
      },
    });

    return NextResponse.json({ labs });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireHospitalAuth([ROLES.HOSPITAL_ADMIN]);
    const body = await request.json();
    const input = createExternalPartnerSchema.parse(body);

    const existingUser = await prisma.user.findUnique({
      where: { username: input.username },
    });
    if (existingUser) {
      throw new ApiError(409, `Username "${input.username}" is already taken.`, "USERNAME_EXISTS");
    }

    const passwordHash = await hashPassword(input.password);

    const lab = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          hospitalId: session.hospitalId,
          username: input.username,
          fullName: input.contactPerson,
          phone: input.phone,
          passwordHash,
          role: ROLES.LAB_USER,
          isActive: true,
        },
      });

      const created = await tx.labAccount.create({
        data: {
          hospitalId: session.hospitalId,
          userId: user.id,
          labName: input.organizationName,
          contactPerson: input.contactPerson,
          phone: input.phone,
          address: input.address ?? null,
          isActive: true,
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              isActive: true,
              createdAt: true,
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
          actionType: "ACCOUNT_CREATED",
          referenceId: user.username,
          details: `Created external laboratory account "${created.labName}" (@${user.username}).`,
        },
        tx
      );

      return created;
    });

    return NextResponse.json({ lab }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
