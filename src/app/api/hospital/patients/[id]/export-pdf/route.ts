import { NextResponse } from "next/server";
import { ROLES, getRoleLabel } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { parseSafeTzOffset } from "@/lib/datetime";
import { recordAuditLog } from "@/lib/audit";
import { buildPatientAuditPdf } from "@/lib/patient-pdf";
import { ApiError, handleApiError } from "@/lib/api-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireHospitalAuth([
      ROLES.HOSPITAL_ADMIN,
      ROLES.RECEPTIONIST,
    ]);
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const tzOffsetMinutes =
      parseSafeTzOffset(searchParams.get("tzOffset"), 0) ?? 0;

    const result = await buildPatientAuditPdf({
      hospitalId: session.hospitalId,
      patientIdOrUhid: decodeURIComponent(id),
      generatedByName: session.user.fullName,
      generatedByRole: getRoleLabel(session.user.role),
      tzOffsetMinutes,
    });

    if (!result) {
      throw new ApiError(404, "Patient record not found.", "NOT_FOUND");
    }

    await recordAuditLog({
      hospitalId: session.hospitalId,
      actorUserId: session.user.id,
      actorUsername: session.user.username,
      actorRole: session.user.role,
      actionType: "PATIENT_HISTORY_PDF_EXPORTED",
      patientUhid: result.patientUhid,
      referenceId: result.patientUhid,
      details: `Exported complete patient audit PDF for "${result.patientName}" (${result.patientUhid}): ${result.counts.opVisits} OP visits, ${result.counts.ipAdmissions} IP admissions, ${result.counts.pharmacyReferrals} pharmacy referrals, ${result.counts.labReferrals} lab referrals, ${result.counts.billingReceipts} receipts.`,
    });

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
