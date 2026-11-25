import { NextResponse } from "next/server";
import { ROLES, getRoleLabel } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { parseSafeTzOffset } from "@/lib/datetime";
import { recordAuditLog } from "@/lib/audit";
import { buildAllPatientsAuditPdf } from "@/lib/patient-pdf";
import { ApiError, handleApiError } from "@/lib/api-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireHospitalAuth([
      ROLES.HOSPITAL_ADMIN,
      ROLES.RECEPTIONIST,
    ]);
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const tzOffsetMinutes =
      parseSafeTzOffset(searchParams.get("tzOffset"), 0) ?? 0;

    const result = await buildAllPatientsAuditPdf({
      hospitalId: session.hospitalId,
      from,
      to,
      generatedByName: session.user.fullName,
      generatedByRole: getRoleLabel(session.user.role),
      tzOffsetMinutes,
    });

    if (!result) {
      throw new ApiError(404, "Hospital record not found.", "NOT_FOUND");
    }

    await recordAuditLog({
      hospitalId: session.hospitalId,
      actorUserId: session.user.id,
      actorUsername: session.user.username,
      actorRole: session.user.role,
      actionType: "ALL_PATIENTS_HISTORY_PDF_EXPORTED",
      referenceId: session.hospital.code,
      details: `Exported complete multi-patient history PDF (${result.timelineLabel}): ${result.counts.patients} patient(s), ${result.counts.opVisits} OP visits, ${result.counts.ipAdmissions} IP admissions, ${result.counts.pharmacyOrders} pharmacy orders, ${result.counts.labReferrals} lab referrals, ${result.counts.billingReceipts} receipts.`,
    });

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Content-Length": String(result.buffer.byteLength),
        "X-Export-Patients-Count": String(result.counts.patients),
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
