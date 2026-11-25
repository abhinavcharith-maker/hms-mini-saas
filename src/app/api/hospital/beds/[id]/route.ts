import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { BED_STATUS, IP_STATUS, ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { ApiError, handleApiError } from "@/lib/api-utils";

const patchBedSchema = z.object({
  bedNumber: z.string().trim().min(1).max(30).optional(),
  ward: z.string().trim().min(1).max(80).optional(),
  category: z.string().trim().max(60).nullable().optional(),
  notes: z.string().trim().max(250).nullable().optional(),
  status: z.enum([BED_STATUS.AVAILABLE, BED_STATUS.INACTIVE]).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireHospitalAuth([ROLES.HOSPITAL_ADMIN]);
    const { id } = await context.params;
    const body = await request.json();
    const input = patchBedSchema.parse(body);

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.bed.findFirst({
        where: { id, hospitalId: session.hospitalId },
      });
      if (!existing) {
        throw new ApiError(404, "Bed not found.", "NOT_FOUND");
      }

      if (input.status && existing.status === BED_STATUS.OCCUPIED) {
        const activeAdm = await tx.ipAdmission.findFirst({
          where: { bedId: id, hospitalId: session.hospitalId, status: IP_STATUS.ADMITTED },
        });
        if (activeAdm) {
          throw new ApiError(
            409,
            "Cannot deactivate or alter status of an occupied bed. Transfer or discharge the admitted patient first.",
            "BED_OCCUPIED"
          );
        }
      }

      const bed = await tx.bed.update({
        where: { id },
        data: {
          ...(input.bedNumber !== undefined ? { bedNumber: input.bedNumber } : {}),
          ...(input.ward !== undefined ? { ward: input.ward } : {}),
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });

      await recordAuditLog(
        {
          hospitalId: session.hospitalId,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "BED_UPDATED",
          referenceId: bed.bedNumber,
          details: `Updated bed ${bed.bedNumber} (${bed.ward}) — status: ${bed.status}.`,
        },
        tx
      );

      return bed;
    });

    return NextResponse.json({ bed: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireHospitalAuth([ROLES.HOSPITAL_ADMIN]);
    const { id } = await context.params;

    await prisma.$transaction(async (tx) => {
      const existing = await tx.bed.findFirst({
        where: { id, hospitalId: session.hospitalId },
      });
      if (!existing) {
        throw new ApiError(404, "Bed not found.", "NOT_FOUND");
      }

      const activeAdm = await tx.ipAdmission.findFirst({
        where: { bedId: id, hospitalId: session.hospitalId, status: IP_STATUS.ADMITTED },
        select: { id: true, admissionNumber: true },
      });
      if (existing.status === BED_STATUS.OCCUPIED || activeAdm) {
        throw new ApiError(
          409,
          "Cannot delete an occupied bed. Transfer or discharge the admitted patient first.",
          "BED_OCCUPIED"
        );
      }

      await tx.bed.delete({ where: { id } });

      await recordAuditLog(
        {
          hospitalId: session.hospitalId,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "BED_DELETED",
          referenceId: existing.bedNumber,
          details: `Deleted registered bed ${existing.bedNumber} (${existing.ward}).`,
        },
        tx
      );
    });

    return NextResponse.json({ deleted: true, bedId: id });
  } catch (error) {
    return handleApiError(error);
  }
}
