import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES, getRoleLabel } from "@/lib/constants";
import { requireAuth, revokeUserSessions } from "@/lib/auth";
import { changePasswordSchema } from "@/lib/validators";
import { hashPassword, verifyPassword } from "@/lib/security";
import { createAdminNotification, recordAuditLog } from "@/lib/audit";
import { ApiError, handleApiError } from "@/lib/api-utils";

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const input = changePasswordSchema.parse(body);

    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, passwordHash: true, username: true, fullName: true, role: true, hospitalId: true },
    });

    if (!dbUser) {
      throw new ApiError(404, "User account not found.", "NOT_FOUND");
    }

    const matches = await verifyPassword(input.currentPassword, dbUser.passwordHash);
    if (!matches) {
      throw new ApiError(400, "Current password is incorrect.", "INVALID_CURRENT_PASSWORD");
    }

    const newHash = await hashPassword(input.newPassword);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: dbUser.id },
        data: {
          passwordHash: newHash,
          passwordChangedAt: now,
        },
      });

      // Revoke other active sessions while preserving the current session
      await revokeUserSessions(dbUser.id, tx, session.sessionId);

      await recordAuditLog(
        {
          hospitalId: dbUser.hospitalId,
          actorUserId: dbUser.id,
          actorUsername: dbUser.username,
          actorRole: dbUser.role,
          actionType: "PASSWORD_CHANGED",
          referenceId: dbUser.username,
          details: `${getRoleLabel(dbUser.role)} account "${dbUser.username}" changed their password.`,
        },
        tx
      );

      // Notify Hospital Admin whenever Receptionist, Pharmacy, or Laboratory changes password
      if (
        dbUser.hospitalId &&
        (dbUser.role === ROLES.RECEPTIONIST ||
          dbUser.role === ROLES.PHARMACY_USER ||
          dbUser.role === ROLES.LAB_USER)
      ) {
        await createAdminNotification(
          {
            hospitalId: dbUser.hospitalId,
            title: `${getRoleLabel(dbUser.role)} Password Updated`,
            message: `${dbUser.fullName} (@${dbUser.username}) updated their account password at ${now.toLocaleString()}.`,
            category: "SECURITY",
          },
          tx
        );
      }
    });

    return NextResponse.json({
      success: true,
      passwordChangedAt: now.toISOString(),
      message: "Password updated successfully. Other active sessions have been signed out.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
