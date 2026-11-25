import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { getMaintenanceStatus } from "@/lib/maintenance";
import { recordAuditLog } from "@/lib/audit";
import { ApiError, handleApiError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

const setMaintenanceSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Please enter a clear maintenance reason (minimum 3 characters)")
    .max(500, "Maintenance reason must be under 500 characters"),
  durationMinutes: z
    .number()
    .int()
    .min(1, "Maintenance break must be at least 1 minute")
    .max(43_200, "Maximum single maintenance window is 30 days")
    .optional(),
  endsAt: z.string().trim().optional(),
});

export async function GET() {
  try {
    await requireAuth([ROLES.SUPER_ADMIN]);
    const [maintenance, history] = await Promise.all([
      getMaintenanceStatus(),
      prisma.auditLog.findMany({
        where: {
          hospitalId: null,
          actionType: {
            in: [
              "MAINTENANCE_STARTED",
              "MAINTENANCE_UPDATED",
              "MAINTENANCE_ENDED",
            ],
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 25,
      }),
    ]);

    return NextResponse.json({ maintenance, history });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuth([ROLES.SUPER_ADMIN]);
    const body = await request.json();
    const input = setMaintenanceSchema.parse(body);

    const now = new Date();
    let endsAt: Date;

    if (input.endsAt) {
      endsAt = new Date(input.endsAt);
      if (Number.isNaN(endsAt.getTime())) {
        throw new ApiError(400, "Invalid maintenance end date & time.", "INVALID_DATE");
      }
      if (endsAt.getTime() <= now.getTime() + 30_000) {
        throw new ApiError(
          400,
          "Maintenance end time must be in the future.",
          "INVALID_DURATION"
        );
      }
    } else if (input.durationMinutes) {
      endsAt = new Date(now.getTime() + input.durationMinutes * 60_000);
    } else {
      throw new ApiError(
        400,
        "Select a maintenance duration or specify a custom end date & time.",
        "DURATION_REQUIRED"
      );
    }

    const existing = await prisma.systemMaintenance.findUnique({
      where: { id: "singleton" },
      select: { isActive: true, endsAt: true },
    });
    const wasActive =
      Boolean(existing?.isActive) &&
      (!existing?.endsAt || existing.endsAt.getTime() > now.getTime());

    await prisma.$transaction(async (tx) => {
      await tx.systemMaintenance.upsert({
        where: { id: "singleton" },
        create: {
          id: "singleton",
          isActive: true,
          reason: input.reason,
          startsAt: now,
          endsAt,
          activatedByUserId: session.user.id,
          activatedByUsername: session.user.username,
          activatedAt: now,
          endedAt: null,
        },
        update: {
          isActive: true,
          reason: input.reason,
          startsAt: now,
          endsAt,
          activatedByUserId: session.user.id,
          activatedByUsername: session.user.username,
          activatedAt: now,
          endedAt: null,
        },
      });

      const diffMins = Math.max(1, Math.round((endsAt.getTime() - now.getTime()) / 60_000));
      await recordAuditLog(
        {
          hospitalId: null,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: wasActive ? "MAINTENANCE_UPDATED" : "MAINTENANCE_STARTED",
          details: `${wasActive ? "Updated" : "Scheduled"} platform maintenance (~${diffMins} min, until ${endsAt.toLocaleString()}). Reason: ${input.reason}`,
        },
        tx
      );
    });

    const maintenance = await getMaintenanceStatus();
    return NextResponse.json({ maintenance });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    const session = await requireAuth([ROLES.SUPER_ADMIN]);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      const existing = await tx.systemMaintenance.findUnique({
        where: { id: "singleton" },
      });

      if (existing) {
        await tx.systemMaintenance.update({
          where: { id: "singleton" },
          data: {
            isActive: false,
            endedAt: now,
          },
        });
      }

      await recordAuditLog(
        {
          hospitalId: null,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "MAINTENANCE_ENDED",
          details: `Super Admin @${session.user.username} ended maintenance break early and restored portal access across all logins.`,
        },
        tx
      );
    });

    const maintenance = await getMaintenanceStatus();
    return NextResponse.json({ maintenance });
  } catch (error) {
    return handleApiError(error);
  }
}
