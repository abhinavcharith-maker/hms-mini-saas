import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { medicineCatalogSchema } from "@/lib/validators";
import { recordAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const session = await requireHospitalAuth([
      ROLES.HOSPITAL_ADMIN,
      ROLES.RECEPTIONIST,
    ]);
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();

    const medicines = await prisma.medicineCatalog.findMany({
      where: {
        hospitalId: session.hospitalId,
        isActive: true,
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { description: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ medicines });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireHospitalAuth([
      ROLES.HOSPITAL_ADMIN,
      ROLES.RECEPTIONIST,
    ]);
    const body = await request.json();
    const input = medicineCatalogSchema.parse(body);

    const medicine = await prisma.$transaction(async (tx) => {
      const created = await tx.medicineCatalog.create({
        data: {
          hospitalId: session.hospitalId,
          name: input.name,
          description: input.description ?? null,
          price: input.price ?? null,
          isActive: true,
        },
      });

      await recordAuditLog(
        {
          hospitalId: session.hospitalId,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "CATALOG_UPDATED",
          referenceId: created.id,
          details: `Added medicine "${created.name}" to referral catalogue${created.price !== null ? ` (₹${created.price.toFixed(2)})` : " (optional price unset)"}.`,
        },
        tx
      );

      return created;
    });

    return NextResponse.json({ medicine }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
