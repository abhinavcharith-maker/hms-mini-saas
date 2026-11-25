import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";
import { requireAuth, revokeHospitalSessions } from "@/lib/auth";
import { hospitalStatusSchema } from "@/lib/validators";
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
    const input = hospitalStatusSchema.parse(body);

    const existing = await prisma.hospital.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError(404, "Hospital not found.", "NOT_FOUND");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const h = await tx.hospital.update({
        where: { id },
        data: {
          isActive: input.isActive,
          deactivatedAt: input.isActive ? null : new Date(),
        },
      });

      if (!input.isActive) {
        // Immediately revoke all active sessions for admin, receptionists, pharmacies, and labs of this hospital
        await revokeHospitalSessions(id, tx);
      }

      await tx.auditLog.create({
        data: {
          eventId: generateAuditEventId(),
          hospitalId: h.id,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "HOSPITAL_STATUS_CHANGED",
          referenceId: h.code,
          details: input.isActive
            ? `Super Admin reactivated hospital "${h.name}" (${h.code}). Associated portals restored.`
            : `Super Admin deactivated hospital "${h.name}" (${h.code}) and revoked all active sessions.${input.reason ? ` Reason: ${input.reason}` : ""}`,
        },
      });
      await pruneHospitalAuditLogs(h.id, tx);

      return h;
    });

    return NextResponse.json({ hospital: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
