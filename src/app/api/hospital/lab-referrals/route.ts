import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { REFERRAL_STATUS, ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { createLabReferralSchema } from "@/lib/validators";
import { allocateLabReferralNumber } from "@/lib/sequences";
import { parseDateRangeBounds, parseSafeTzOffset } from "@/lib/datetime";
import { recordAuditLog } from "@/lib/audit";
import { ApiError, handleApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const session = await requireHospitalAuth([
      ROLES.HOSPITAL_ADMIN,
      ROLES.RECEPTIONIST,
    ]);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const labAccountId = searchParams.get("labAccountId") || undefined;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const tzOffsetMinutes = parseSafeTzOffset(searchParams.get("tzOffset"), null);
    const q = (searchParams.get("q") ?? "").trim();

    const dateFilter = parseDateRangeBounds({ from, to, tzOffsetMinutes });

    const referrals = await prisma.labReferral.findMany({
      where: {
        hospitalId: session.hospitalId,
        ...(status ? { status } : {}),
        ...(labAccountId ? { labAccountId } : {}),
        ...(from || to ? { referredAt: dateFilter } : {}),
        ...(q
          ? {
              OR: [
                { referralNumber: { contains: q } },
                { patientNameSnapshot: { contains: q } },
                { patientUhidSnapshot: { contains: q } },
                { labNameSnapshot: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: { referredAt: "desc" },
      include: { items: true },
      take: 150,
    });

    return NextResponse.json({ referrals });
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
    const input = createLabReferralSchema.parse(body);
    const hospitalId = session.hospitalId;

    const referral = await prisma.$transaction(async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: input.patientId, hospitalId },
      });
      if (!patient) {
        throw new ApiError(404, "Patient not found.", "PATIENT_NOT_FOUND");
      }

      const lab = await tx.labAccount.findFirst({
        where: { id: input.labAccountId, hospitalId, isActive: true },
      });
      if (!lab) {
        throw new ApiError(
          404,
          "Active referral laboratory not found.",
          "LAB_NOT_FOUND"
        );
      }

      let validatedOpVisitId: string | null = null;
      if (input.opVisitId) {
        const visit = await tx.opVisit.findFirst({
          where: { id: input.opVisitId, hospitalId, patientId: patient.id },
          select: { id: true },
        });
        if (!visit) {
          throw new ApiError(
            404,
            "Linked OP visit not found for this patient in your hospital.",
            "OP_VISIT_NOT_FOUND"
          );
        }
        validatedOpVisitId = visit.id;
      }

      let validatedIpAdmissionId: string | null = null;
      if (input.ipAdmissionId) {
        const admission = await tx.ipAdmission.findFirst({
          where: { id: input.ipAdmissionId, hospitalId, patientId: patient.id },
          select: { id: true },
        });
        if (!admission) {
          throw new ApiError(
            404,
            "Linked IP admission not found for this patient in your hospital.",
            "IP_ADMISSION_NOT_FOUND"
          );
        }
        validatedIpAdmissionId = admission.id;
      }

      const catalogIds = input.items.map((i) => i.labTestCatalogId);
      const catalogRows = await tx.labTestCatalog.findMany({
        where: { id: { in: catalogIds }, hospitalId, isActive: true },
      });
      const catalogMap = new Map(catalogRows.map((t) => [t.id, t]));

      let computedSum = 0;
      let hasAnyPrice = false;

      const itemCreates = input.items.map((item) => {
        const test = catalogMap.get(item.labTestCatalogId);
        if (!test) {
          throw new ApiError(
            400,
            "One or more selected tests are not in your active laboratory catalogue.",
            "TEST_NOT_FOUND"
          );
        }
        const unitPrice =
          item.unitPriceOverride !== undefined && item.unitPriceOverride !== null
            ? item.unitPriceOverride
            : test.price ?? null;
        if (unitPrice !== null) {
          computedSum += unitPrice;
          hasAnyPrice = true;
        }
        return {
          hospitalId,
          labTestCatalogId: test.id,
          testNameSnapshot: test.name,
          descriptionSnapshot: test.description,
          unitPriceSnapshot: unitPrice,
        };
      });

      const finalTotal =
        input.overrideTotalAmount !== undefined && input.overrideTotalAmount !== null
          ? input.overrideTotalAmount
          : hasAnyPrice
            ? computedSum
            : null;

      const referralNumber = await allocateLabReferralNumber(tx, hospitalId);
      const created = await tx.labReferral.create({
        data: {
          hospitalId,
          referralNumber,
          patientId: patient.id,
          labAccountId: lab.id,
          opVisitId: validatedOpVisitId,
          ipAdmissionId: validatedIpAdmissionId,
          patientNameSnapshot: patient.fullName,
          patientUhidSnapshot: patient.uhid,
          patientPhoneSnapshot: patient.phone,
          labNameSnapshot: lab.labName,
          notes: input.notes ?? null,
          totalAmount: finalTotal,
          status: REFERRAL_STATUS.PENDING,
          referredByUserId: session.user.id,
          items: { create: itemCreates },
        },
        include: { items: true },
      });

      await recordAuditLog(
        {
          hospitalId,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "LAB_REFERRAL_CREATED",
          patientId: patient.id,
          patientUhid: patient.uhid,
          referenceId: created.referralNumber,
          details: `Created laboratory referral ${created.referralNumber} (${itemCreates.length} test(s)) to ${lab.labName} for ${patient.fullName} (${patient.uhid}).`,
        },
        tx
      );

      return created;
    });

    return NextResponse.json({ referral }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
