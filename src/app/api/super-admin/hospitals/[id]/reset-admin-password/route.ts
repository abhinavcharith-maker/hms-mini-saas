import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";
import { requireAuth, revokeUserSessions } from "@/lib/auth";
import { resetPasswordSchema } from "@/lib/validators";
import { hashPassword } from "@/lib/security";
import { generateAuditEventId, pruneHospitalAuditLogs } from "@/lib/audit";
import { ApiError, handleApiError } from "@/lib/api-utils";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth([ROLES.SUPER_ADMIN]);
    const { id } = await context.params;
    const body = await request.json();
    const input = resetPasswordSchema.parse(body);

    const adminUser = await prisma.user.findFirst({
      where: { hospitalId: id, role: ROLES.HOSPITAL_ADMIN },
      orderBy: { createdAt: "asc" },
      include: { hospital: { select: { name: true, code: true } } },
    });

    if (!adminUser) {
      throw new ApiError(404, "Hospital Admin account not found.", "ADMIN_NOT_FOUND");
    }

    const passwordHash = await hashPassword(input.newPassword);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: adminUser.id },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
        },
      });

      await revokeUserSessions(adminUser.id, tx);

      await tx.auditLog.create({
        data: {
          eventId: generateAuditEventId(),
          hospitalId: id,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "PASSWORD_RESET",
          referenceId: adminUser.username,
          details: `Super Admin reset password for Hospital Admin "@${adminUser.username}" (${adminUser.hospital?.code ?? id}).`,
        },
      });
      await pruneHospitalAuditLogs(id, tx);
    });

    return NextResponse.json({
      success: true,
      username: adminUser.username,
      message: "Hospital Admin password reset successfully and existing sessions invalidated.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
