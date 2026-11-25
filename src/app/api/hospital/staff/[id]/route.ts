import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";
import { requireHospitalAuth, revokeUserSessions } from "@/lib/auth";
import { hashPassword } from "@/lib/security";
import { recordAuditLog } from "@/lib/audit";
import { optionalPhoneSchema } from "@/lib/validators";
import { ApiError, handleApiError } from "@/lib/api-utils";

const patchStaffSchema = z.object({
  isActive: z.boolean().optional(),
  resetPassword: z.string().min(8).max(128).optional(),
  fullName: z.string().trim().min(2).max(100).optional(),
  username: z
    .string()
    .trim()
    .min(3)
    .max(60)
    .regex(/^[a-zA-Z0-9._-]+$/, "Username may only contain letters, numbers, . _ -")
    .optional(),
  email: z.string().trim().max(120).nullable().optional(),
  phone: optionalPhoneSchema.optional(),
  role: z.enum([ROLES.RECEPTIONIST, ROLES.HOSPITAL_ADMIN]).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireHospitalAuth([ROLES.HOSPITAL_ADMIN]);
    const { id } = await context.params;
    const body = await request.json();
    const input = patchStaffSchema.parse(body);

    const target = await prisma.user.findFirst({
      where: {
        id,
        hospitalId: session.hospitalId,
        role: { in: [ROLES.RECEPTIONIST, ROLES.HOSPITAL_ADMIN] },
      },
    });
    if (!target) {
      throw new ApiError(404, "Staff account not found.", "NOT_FOUND");
    }

    if (target.id === session.user.id && input.isActive === false) {
      throw new ApiError(
        400,
        "You cannot deactivate your own active admin account.",
        "SELF_DEACTIVATE"
      );
    }

    if (target.id === session.user.id && input.username && input.username !== target.username) {
      throw new ApiError(
        400,
        "Hospital Admin cannot rename their own assigned login username.",
        "SELF_USERNAME_LOCKED"
      );
    }

    if (target.id === session.user.id && input.role && input.role !== target.role) {
      throw new ApiError(
        400,
        "You cannot change your own active administrator role.",
        "SELF_ROLE_LOCKED"
      );
    }

    if (input.username && input.username !== target.username) {
      const collision = await prisma.user.findUnique({
        where: { username: input.username },
      });
      if (collision) {
        throw new ApiError(
          409,
          `Username "${input.username}" is already taken.`,
          "USERNAME_EXISTS"
        );
      }
    }

    const newHash = input.resetPassword
      ? await hashPassword(input.resetPassword)
      : null;

    const hasProfileEdit =
      input.fullName !== undefined ||
      input.username !== undefined ||
      input.email !== undefined ||
      input.phone !== undefined ||
      input.role !== undefined;

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data: {
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
          ...(input.username !== undefined ? { username: input.username } : {}),
          ...(input.email !== undefined ? { email: input.email || null } : {}),
          ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(newHash
            ? { passwordHash: newHash, passwordChangedAt: new Date() }
            : {}),
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
      });

      if (
        input.isActive === false ||
        newHash ||
        (input.username && input.username !== target.username) ||
        (input.role && input.role !== target.role)
      ) {
        await revokeUserSessions(
          id,
          tx,
          target.id === session.user.id ? session.sessionId : undefined
        );
      }

      if (hasProfileEdit) {
        await recordAuditLog(
          {
            hospitalId: session.hospitalId,
            actorUserId: session.user.id,
            actorUsername: session.user.username,
            actorRole: session.user.role,
            actionType: "ACCOUNT_UPDATED",
            referenceId: u.username,
            details: `Updated staff account details for ${u.fullName} (@${u.username}, ${u.role})${input.username && input.username !== target.username ? ` [renamed from @${target.username}]` : ""}.`,
          },
          tx
        );
      }

      if (input.isActive !== undefined) {
        await recordAuditLog(
          {
            hospitalId: session.hospitalId,
            actorUserId: session.user.id,
            actorUsername: session.user.username,
            actorRole: session.user.role,
            actionType: "ACCOUNT_STATUS_CHANGED",
            referenceId: u.username,
            details: `${input.isActive ? "Activated" : "Deactivated"} staff account "@${u.username}" (${u.role}).`,
          },
          tx
        );
      }

      if (newHash) {
        await recordAuditLog(
          {
            hospitalId: session.hospitalId,
            actorUserId: session.user.id,
            actorUsername: session.user.username,
            actorRole: session.user.role,
            actionType: "PASSWORD_RESET",
            referenceId: u.username,
            details: `Hospital Admin reset password for staff account "@${u.username}".`,
          },
          tx
        );
      }

      return u;
    });

    return NextResponse.json({ staff: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
