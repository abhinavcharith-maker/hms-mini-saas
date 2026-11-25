import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    await requireAuth([ROLES.SUPER_ADMIN]);

    const records = await prisma.backupRecord.findMany({
      take: 30,
      orderBy: { createdAt: "desc" },
      include: {
        hospital: { select: { code: true, name: true } },
      },
    });

    return NextResponse.json({ records });
  } catch (error) {
    return handleApiError(error);
  }
}
