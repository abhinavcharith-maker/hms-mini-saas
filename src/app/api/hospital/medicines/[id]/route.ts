import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { medicineCatalogSchema } from "@/lib/validators";
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
    const input = medicineCatalogSchema.parse(body);

    const existing = await prisma.medicineCatalog.findFirst({
      where: { id, hospitalId: session.hospitalId },
    });
    if (!existing) {
      throw new ApiError(404, "Medicine entry not found.", "NOT_FOUND");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const med = await tx.medicineCatalog.update({
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
          referenceId: med.id,
          details: `Updated medicine catalogue entry "${med.name}". Historical referrals remain unchanged via snapshots.`,
        },
        tx
      );

      return med;
    });

    return NextResponse.json({ medicine: updated });
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

    const existing = await prisma.medicineCatalog.findFirst({
      where: { id, hospitalId: session.hospitalId },
    });
    if (!existing) {
      throw new ApiError(404, "Medicine entry not found.", "NOT_FOUND");
    }

    await prisma.$transaction(async (tx) => {
      // Historical PharmacyReferralItems keep full snapshot strings/prices even after deletion (onDelete: SetNull)
      await tx.medicineCatalog.delete({ where: { id } });

      await recordAuditLog(
        {
          hospitalId: session.hospitalId,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "CATALOG_UPDATED",
          referenceId: id,
          details: `Removed medicine "${existing.name}" from active catalogue. All historical referral snapshots remain preserved.`,
        },
        tx
      );
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
