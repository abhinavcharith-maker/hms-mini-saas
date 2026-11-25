import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { REFERRAL_STATUS, ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { createPharmacyReferralSchema } from "@/lib/validators";
import { allocatePharmacyReferralNumber } from "@/lib/sequences";
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
    const pharmacyAccountId = searchParams.get("pharmacyAccountId") || undefined;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const tzOffsetMinutes = parseSafeTzOffset(searchParams.get("tzOffset"), null);
    const q = (searchParams.get("q") ?? "").trim();

    const dateFilter = parseDateRangeBounds({ from, to, tzOffsetMinutes });

    const referrals = await prisma.pharmacyReferral.findMany({
      where: {
        hospitalId: session.hospitalId,
        ...(status ? { status } : {}),
        ...(pharmacyAccountId ? { pharmacyAccountId } : {}),
        ...(from || to ? { referredAt: dateFilter } : {}),
        ...(q
          ? {
              OR: [
                { referralNumber: { contains: q } },
                { patientNameSnapshot: { contains: q } },
                { patientUhidSnapshot: { contains: q } },
                { pharmacyNameSnapshot: { contains: q } },
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
    const input = createPharmacyReferralSchema.parse(body);
    const hospitalId = session.hospitalId;

    const referral = await prisma.$transaction(async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: input.patientId, hospitalId },
      });
      if (!patient) {
        throw new ApiError(404, "Patient not found.", "PATIENT_NOT_FOUND");
      }

      const pharmacy = await tx.pharmacyAccount.findFirst({
        where: { id: input.pharmacyAccountId, hospitalId, isActive: true },
      });
      if (!pharmacy) {
        throw new ApiError(
          404,
          "Active referral pharmacy not found.",
          "PHARMACY_NOT_FOUND"
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

      const catalogIds = input.items.map((i) => i.medicineCatalogId);
      const catalogRows = await tx.medicineCatalog.findMany({
        where: { id: { in: catalogIds }, hospitalId, isActive: true },
      });
      const catalogMap = new Map(catalogRows.map((m) => [m.id, m]));

      let computedSum = 0;
      let hasAnyPrice = false;

      const itemCreates = input.items.map((item) => {
        const med = catalogMap.get(item.medicineCatalogId);
        if (!med) {
          throw new ApiError(
            400,
            "One or more selected medicines are not in your active hospital catalogue.",
            "MEDICINE_NOT_FOUND"
          );
        }
        const unitPrice =
          item.unitPriceOverride !== undefined && item.unitPriceOverride !== null
            ? item.unitPriceOverride
            : med.price ?? null;
        const lineTotal = unitPrice !== null ? unitPrice * item.quantity : null;
        if (lineTotal !== null) {
          computedSum += lineTotal;
          hasAnyPrice = true;
        }
        return {
          hospitalId,
          medicineCatalogId: med.id,
          medicineNameSnapshot: med.name,
          descriptionSnapshot: med.description,
          quantity: item.quantity,
          unitPriceSnapshot: unitPrice,
          lineTotal,
          dosageInstructions: item.dosageInstructions ?? null,
        };
      });

      const finalTotal =
        input.overrideTotalAmount !== undefined && input.overrideTotalAmount !== null
          ? input.overrideTotalAmount
          : hasAnyPrice
            ? computedSum
            : null;

      const referralNumber = await allocatePharmacyReferralNumber(tx, hospitalId);
      const created = await tx.pharmacyReferral.create({
        data: {
          hospitalId,
          referralNumber,
          patientId: patient.id,
          pharmacyAccountId: pharmacy.id,
          opVisitId: validatedOpVisitId,
          ipAdmissionId: validatedIpAdmissionId,
          patientNameSnapshot: patient.fullName,
          patientUhidSnapshot: patient.uhid,
          patientPhoneSnapshot: patient.phone,
          pharmacyNameSnapshot: pharmacy.pharmacyName,
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
          actionType: "PHARMACY_REFERRAL_CREATED",
          patientId: patient.id,
          patientUhid: patient.uhid,
          referenceId: created.referralNumber,
          details: `Created pharmacy referral ${created.referralNumber} (${itemCreates.length} medicine(s)) to ${pharmacy.pharmacyName} for ${patient.fullName} (${patient.uhid}).`,
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
