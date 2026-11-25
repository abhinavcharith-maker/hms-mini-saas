import { NextResponse } from "next/server";
import { ROLES } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { ApiError, handleApiError } from "@/lib/api-utils";
import { parseSafeTzOffset } from "@/lib/datetime";
import { prisma } from "@/lib/prisma";
import { generateAuditEventId, pruneHospitalAuditLogs } from "@/lib/audit";
import { buildHospitalCompletePdf } from "@/lib/hospital-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth([ROLES.SUPER_ADMIN]);
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const tzOffsetMinutes = parseSafeTzOffset(searchParams.get("tzOffset"), 0) ?? 0;

    const result = await buildHospitalCompletePdf({
      hospitalId: id,
      tzOffsetMinutes,
      actorUsername: session.user.username,
    });

    if (!result) {
      throw new ApiError(404, "Hospital not found.", "NOT_FOUND");
    }

    await prisma.auditLog.create({
      data: {
        eventId: generateAuditEventId(),
        hospitalId: id,
        actorUserId: session.user.id,
        actorUsername: session.user.username,
        actorRole: session.user.role,
        actionType: "HOSPITAL_DATA_PDF_EXPORTED",
        referenceId: result.hospitalCode,
        details: `Super Admin exported full segregated data PDF for "${result.hospitalName}" (${result.hospitalCode}) — OP: ${result.counts.opVisits}, IP: ${result.counts.ipAdmissions}, Transfers: ${result.counts.bedTransfers}, Pharmacy Refs: ${result.counts.pharmacyReferrals}, Lab Refs: ${result.counts.labReferrals}.`,
      },
    });
    await pruneHospitalAuditLogs(id);

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Content-Length": String(result.buffer.byteLength),
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
