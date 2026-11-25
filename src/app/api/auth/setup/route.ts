import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES, getHomePathForRole } from "@/lib/constants";
import { setupSuperAdminSchema } from "@/lib/validators";
import { hashPassword } from "@/lib/security";
import { createUserSession, setSessionCookie } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { ApiError, getRequestClientInfo, handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const count = await prisma.user.count({
      where: { role: ROLES.SUPER_ADMIN },
    });
    return NextResponse.json({ needsSetup: count === 0 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const preCount = await prisma.user.count({
      where: { role: ROLES.SUPER_ADMIN },
    });
    if (preCount > 0) {
      throw new ApiError(
        403,
        "Initial platform setup has already been completed.",
        "SETUP_LOCKED"
      );
    }

    const body = await request.json();
    const input = setupSuperAdminSchema.parse(body);

    const passwordHash = await hashPassword(input.password);
    const user = await prisma.$transaction(async (tx) => {
      const count = await tx.user.count({
        where: { role: ROLES.SUPER_ADMIN },
      });
      if (count > 0) {
        throw new ApiError(
          403,
          "Initial platform setup has already been completed.",
          "SETUP_LOCKED"
        );
      }

      const existingUsername = await tx.user.findUnique({
        where: { username: input.username },
      });
      if (existingUsername) {
        throw new ApiError(409, "Username already exists.", "USERNAME_EXISTS");
      }

      const created = await tx.user.create({
        data: {
          username: input.username,
          fullName: input.fullName,
          email: input.email ?? null,
          passwordHash,
          role: ROLES.SUPER_ADMIN,
          isActive: true,
        },
      });

      await recordAuditLog(
        {
          actorUserId: created.id,
          actorUsername: created.username,
          actorRole: created.role,
          actionType: "SUPER_ADMIN_CREATED",
          details: `Initial Super Admin "${created.username}" created via Setup Wizard.`,
        },
        tx
      );

      return created;
    });

    const { ipAddress, userAgent } = getRequestClientInfo(request);
    const { token, expiresAt } = await createUserSession({
      userId: user.id,
      hospitalId: null,
      ipAddress,
      userAgent,
    });
    await setSessionCookie(token, expiresAt, request);

    return NextResponse.json(
      {
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          role: user.role,
        },
        redirectTo: getHomePathForRole(user.role),
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
