import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";

export async function POST() {
  try {
    const session = await requireHospitalAuth([ROLES.HOSPITAL_ADMIN]);
    await prisma.notification.updateMany({
      where: { hospitalId: session.hospitalId, isRead: false },
      data: { isRead: true },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
