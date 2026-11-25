import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";
import { requireHospitalAuth, revokeUserSessions } from "@/lib/auth";
import { hashPassword } from "@/lib/security";
import { recordAuditLog } from "@/lib/audit";
import { requiredPhoneSchema } from "@/lib/validators";
import { ApiError, handleApiError } from "@/lib/api-utils";

const patchPharmacySchema = z.object({
  isActive: z.boolean().optional(),
  resetPassword: z.string().min(8).max(128).optional(),
  pharmacyName: z.string().trim().min(2).max(140).optional(),
  contactPerson: z.string().trim().min(2).max(100).optional(),
  phone: requiredPhoneSchema.optional(),
  address: z.string().trim().max(250).nullable().optional(),
  username: z
    .string()
    .trim()
    .min(3)
    .max(60)
    .regex(/^[a-zA-Z0-9._-]+$/, "Username may only contain letters, numbers, . _ -")
    .optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireHospitalAuth([ROLES.HOSPITAL_ADMIN]);
    const { id } = await context.params;
    const body = await request.json();
    const input = patchPharmacySchema.parse(body);

    const existing = await prisma.pharmacyAccount.findFirst({
      where: { id, hospitalId: session.hospitalId },
      include: { user: true },
    });
    if (!existing) {
      throw new ApiError(404, "Pharmacy account not found.", "NOT_FOUND");
    }

    if (input.username && input.username !== existing.user.username) {
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
      input.pharmacyName !== undefined ||
      input.contactPerson !== undefined ||
      input.phone !== undefined ||
      input.address !== undefined ||
      input.username !== undefined;

    const updated = await prisma.$transaction(async (tx) => {
      const pharm = await tx.pharmacyAccount.update({
        where: { id },
        data: {
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.pharmacyName !== undefined
            ? { pharmacyName: input.pharmacyName }
            : {}),
          ...(input.contactPerson !== undefined
            ? { contactPerson: input.contactPerson }
            : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.address !== undefined ? { address: input.address || null } : {}),
        },
      });

      const nextUsername = input.username ?? existing.user.username;

      if (
        input.isActive !== undefined ||
        newHash ||
        input.contactPerson !== undefined ||
        input.phone !== undefined ||
        input.username !== undefined
      ) {
        await tx.user.update({
          where: { id: existing.userId },
          data: {
            ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
            ...(newHash
              ? { passwordHash: newHash, passwordChangedAt: new Date() }
              : {}),
            ...(input.contactPerson !== undefined
              ? { fullName: input.contactPerson }
              : {}),
            ...(input.phone !== undefined ? { phone: input.phone } : {}),
            ...(input.username !== undefined ? { username: input.username } : {}),
          },
        });
      }

      if (
        input.isActive === false ||
        newHash ||
        (input.username && input.username !== existing.user.username)
      ) {
        await revokeUserSessions(existing.userId, tx);
      }

      if (hasProfileEdit) {
        await recordAuditLog(
          {
            hospitalId: session.hospitalId,
            actorUserId: session.user.id,
            actorUsername: session.user.username,
            actorRole: session.user.role,
            actionType: "ACCOUNT_UPDATED",
            referenceId: nextUsername,
            details: `Updated pharmacy owner/partner details for "${pharm.pharmacyName}" (@${nextUsername})${input.username && input.username !== existing.user.username ? ` [renamed from @${existing.user.username}]` : ""}.`,
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
            referenceId: nextUsername,
            details: `${input.isActive ? "Activated" : "Deactivated"} pharmacy partner "${pharm.pharmacyName}" (@${nextUsername}).`,
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
            referenceId: nextUsername,
            details: `Hospital Admin reset password for pharmacy partner "${pharm.pharmacyName}" (@${nextUsername}).`,
          },
          tx
        );
      }

      return tx.pharmacyAccount.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              isActive: true,
              lastLoginAt: true,
              passwordChangedAt: true,
            },
          },
          _count: {
            select: { referrals: true },
          },
        },
      });
    });

    return NextResponse.json({ pharmacy: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
