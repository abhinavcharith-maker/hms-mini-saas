import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const superAdminCount = await prisma.user.count({
      where: { role: ROLES.SUPER_ADMIN },
    });
    return NextResponse.json({
      status: "ok",
      database: "connected",
      needsSetup: superAdminCount === 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[HEALTH_CHECK_ERROR]", error);
    return NextResponse.json(
      { status: "error", database: "disconnected" },
      { status: 503 }
    );
  }
}
