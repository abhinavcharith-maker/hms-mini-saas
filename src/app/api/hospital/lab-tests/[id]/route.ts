import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { labTestCatalogSchema } from "@/lib/validators";
import { recordAuditLog } from "@/lib/audit";
import { ApiError, handleApiError } from "@/lib/api-utils";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireHospitalAuth([ROLES.HOSPITAL_ADMIN]);
    const { id } = await context.params;
    const body = await request.json();
    const input = labTestCatalogSchema.parse(body);

    const existing = await prisma.labTestCatalog.findFirst({
      where: { id, hospitalId: session.hospitalId },
    });
    if (!existing) {
      throw new ApiError(404, "Laboratory test entry not found.", "NOT_FOUND");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const test = await tx.labTestCatalog.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description ?? null,
          price: input.price ?? null,
        },
      });

      await recordAuditLog(
        {
          hospitalId: session.hospitalId,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "CATALOG_UPDATED",
          referenceId: test.id,
          details: `Updated lab test catalogue entry "${test.name}". Historical referrals remain unchanged via snapshots.`,
        },
        tx
      );

      return test;
    });

    return NextResponse.json({ test: updated });
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

    const existing = await prisma.labTestCatalog.findFirst({
      where: { id, hospitalId: session.hospitalId },
    });
    if (!existing) {
      throw new ApiError(404, "Laboratory test entry not found.", "NOT_FOUND");
    }

    await prisma.$transaction(async (tx) => {
      await tx.labTestCatalog.delete({ where: { id } });

      await recordAuditLog(
        {
          hospitalId: session.hospitalId,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "CATALOG_UPDATED",
          referenceId: id,
          details: `Removed lab test "${existing.name}" from active catalogue. Historical referral snapshots preserved.`,
        },
        tx
      );
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
