import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";
import { requireHospitalAuth, revokeUserSessions } from "@/lib/auth";
import { hashPassword } from "@/lib/security";
import { recordAuditLog } from "@/lib/audit";
import { optionalPhoneSchema } from "@/lib/validators";
import { ApiError, handleApiError } from "@/lib/api-utils";

const patchDoctorSchema = z.object({
  isActive: z.boolean().optional(),
  name: z.string().trim().min(2).max(100).optional(),
  specialty: z.string().trim().max(100).nullable().optional(),
  qualification: z.string().trim().max(100).nullable().optional(),
  phone: optionalPhoneSchema.optional(),
  consultationFee: z.number().min(0).nullable().optional(),
  username: z
    .string()
    .trim()
    .max(60)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : undefined))
    .refine(
      (v) => v === undefined || (v.length >= 3 && /^[a-zA-Z0-9._-]+$/.test(v)),
      {
        message:
          "Username must be at least 3 characters and contain only letters, numbers, . _ -",
      }
    ),
  password: z
    .string()
    .max(128)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : undefined))
    .refine((v) => v === undefined || v.length >= 8, {
      message: "Password must be at least 8 characters",
    }),
  resetPassword: z.string().min(8, "Password must be at least 8 characters").max(128).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireHospitalAuth([ROLES.HOSPITAL_ADMIN]);
    const { id } = await context.params;
    const body = await request.json();
    const input = patchDoctorSchema.parse(body);

    const existing = await prisma.doctor.findFirst({
      where: { id, hospitalId: session.hospitalId },
      include: { user: true },
    });
    if (!existing) {
      throw new ApiError(404, "Doctor not found.", "NOT_FOUND");
    }

    if (input.resetPassword && !existing.user) {
      throw new ApiError(
        400,
        "This doctor does not have a portal login yet. Edit the doctor to assign a username and password first.",
        "NO_PORTAL_LOGIN"
      );
    }

    if (!existing.user && (input.username || input.password)) {
      if (!input.username || !input.password) {
        throw new ApiError(
          400,
          "Provide both username and password (min 8 chars) to enable Doctor Portal login.",
          "CREDENTIALS_INCOMPLETE"
        );
      }
    }

    if (input.username && input.username !== existing.user?.username) {
      const collision = await prisma.user.findUnique({
        where: { username: input.username },
        select: { id: true },
      });
      if (collision) {
        throw new ApiError(
          409,
          `Username "${input.username}" is already taken.`,
          "USERNAME_EXISTS"
        );
      }
    }

    const newPasswordHash =
      input.resetPassword || input.password
        ? await hashPassword((input.resetPassword ?? input.password)!)
        : null;

    const doctor = await prisma.$transaction(async (tx) => {
      let linkedUserId = existing.userId;

      // Create new Doctor Portal User if doctor didn't have one yet
      if (!existing.user && input.username && newPasswordHash) {
        const createdUser = await tx.user.create({
          data: {
            hospitalId: session.hospitalId,
            username: input.username,
            fullName: input.name ?? existing.name,
            phone: input.phone !== undefined ? input.phone : existing.phone,
            passwordHash: newPasswordHash,
            role: ROLES.DOCTOR,
            isActive: input.isActive ?? existing.isActive,
          },
        });
        linkedUserId = createdUser.id;
      } else if (existing.user) {
        const usernameChanged =
          Boolean(input.username) && input.username !== existing.user.username;
        if (
          input.isActive !== undefined ||
          input.name !== undefined ||
          input.phone !== undefined ||
          usernameChanged ||
          newPasswordHash
        ) {
          await tx.user.update({
            where: { id: existing.user.id },
            data: {
              ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
              ...(input.name !== undefined ? { fullName: input.name } : {}),
              ...(input.phone !== undefined ? { phone: input.phone } : {}),
              ...(usernameChanged && input.username
                ? { username: input.username }
                : {}),
              ...(newPasswordHash
                ? { passwordHash: newPasswordHash, passwordChangedAt: new Date() }
                : {}),
            },
          });
        }
        if (input.isActive === false || newPasswordHash || usernameChanged) {
          await revokeUserSessions(existing.user.id, tx);
        }
      }

      const updated = await tx.doctor.update({
        where: { id },
        data: {
          ...(linkedUserId !== existing.userId ? { userId: linkedUserId } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.specialty !== undefined
            ? { specialty: input.specialty || null }
            : {}),
          ...(input.qualification !== undefined
            ? { qualification: input.qualification || null }
            : {}),
          ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
          ...(input.consultationFee !== undefined
            ? { consultationFee: input.consultationFee }
            : {}),
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

      if (input.resetPassword && updated.user) {
        await recordAuditLog(
          {
            hospitalId: session.hospitalId,
            actorUserId: session.user.id,
            actorUsername: session.user.username,
            actorRole: session.user.role,
            actionType: "PASSWORD_RESET",
            referenceId: updated.user.username,
            details: `Hospital Admin reset Doctor Portal password for ${updated.name} (@${updated.user.username}).`,
          },
          tx
        );
      } else {
        await recordAuditLog(
          {
            hospitalId: session.hospitalId,
            actorUserId: session.user.id,
            actorUsername: session.user.username,
            actorRole: session.user.role,
            actionType: "DOCTOR_UPDATED",
            referenceId: updated.id,
            details: `Updated consulting doctor profile for ${updated.name}${updated.user ? ` (@${updated.user.username})` : ""}${updated.isActive ? "" : " (Inactive)"}.`,
          },
          tx
        );
      }

      return updated;
    });

    return NextResponse.json({ doctor });
  } catch (error) {
    return handleApiError(error);
  }
}
