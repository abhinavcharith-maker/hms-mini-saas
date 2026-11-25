import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { REFERRAL_STATUS, ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { consultancyLabReferSchema } from "@/lib/validators";
import { allocateLabReferralNumber } from "@/lib/sequences";
import { recordAuditLog } from "@/lib/audit";
import { ApiError, handleApiError } from "@/lib/api-utils";

export async function POST(request: Request) {
  try {
    const session = await requireHospitalAuth([
      ROLES.HOSPITAL_ADMIN,
      ROLES.DOCTOR,
    ]);
    const hospitalId = session.hospitalId;
    if (!session.hospital.consultancyEnabled) {
      throw new ApiError(
        403,
        "Consultancy module is disabled for this hospital by Super Admin.",
        "CONSULTANCY_DISABLED"
      );
    }
    const isDoctor = session.user.role === ROLES.DOCTOR;

    if (isDoctor && !session.doctor) {
      throw new ApiError(403, "Doctor profile is not linked.", "DOCTOR_REQUIRED");
    }

    const body = await request.json();
    const input = consultancyLabReferSchema.parse(body);

    const visit = await prisma.opVisit.findFirst({
      where: { id: input.opVisitId, hospitalId },
      include: {
        patient: true,
        doctor: true,
      },
    });
    if (!visit) {
      throw new ApiError(404, "OP consultation visit not found.", "OP_VISIT_NOT_FOUND");
    }
    if (isDoctor && visit.doctorId !== session.doctor!.id) {
      throw new ApiError(
        403,
        "You can only refer lab tests for patients assigned to you.",
        "DOCTOR_SCOPE_FORBIDDEN"
      );
    }

    const doctorName =
      visit.doctor?.name ?? visit.doctorNameSnapshot ?? session.doctor?.name ?? session.user.fullName;

    const result = await prisma.$transaction(async (tx) => {
      const lab = await tx.labAccount.findFirst({
        where: { id: input.labAccountId, hospitalId, isActive: true },
      });
      if (!lab) {
        throw new ApiError(
          404,
          "Selected active laboratory partner was not found.",
          "LAB_NOT_FOUND"
        );
      }

      const existingCatalog = await tx.labTestCatalog.findMany({
        where: { hospitalId },
      });
      const catById = new Map(existingCatalog.map((c) => [c.id, c]));
      const catByLowerName = new Map(
        existingCatalog.map((c) => [c.name.trim().toLowerCase(), c])
      );

      let computedSum = 0;
      let hasAnyPrice = false;
      const createdCatalogNames: string[] = [];

      const itemCreates: Array<{
        hospitalId: string;
        labTestCatalogId: string;
        testNameSnapshot: string;
        descriptionSnapshot: string | null;
        unitPriceSnapshot: number | null;
      }> = [];

      for (const item of input.items) {
        const cleanName = item.testName.trim();
        let test =
          (item.labTestCatalogId ? catById.get(item.labTestCatalogId) : undefined) ??
          catByLowerName.get(cleanName.toLowerCase());

        if (!test) {
          test = await tx.labTestCatalog.create({
            data: {
              hospitalId,
              name: cleanName,
              description: null,
              price: null,
              isActive: true,
            },
          });
          catById.set(test.id, test);
          catByLowerName.set(cleanName.toLowerCase(), test);
          createdCatalogNames.push(test.name);
        } else if (!test.isActive) {
          test = await tx.labTestCatalog.update({
            where: { id: test.id },
            data: { isActive: true },
          });
          catById.set(test.id, test);
        }

        const unitPrice = test.price ?? null;
        if (unitPrice !== null) {
          computedSum += unitPrice;
          hasAnyPrice = true;
        }
        itemCreates.push({
          hospitalId,
          labTestCatalogId: test.id,
          testNameSnapshot: test.name,
          descriptionSnapshot: test.description,
          unitPriceSnapshot: unitPrice,
        });
      }

      const referralNumber = await allocateLabReferralNumber(tx, hospitalId);
      const created = await tx.labReferral.create({
        data: {
          hospitalId,
          referralNumber,
          patientId: visit.patientId,
          opVisitId: visit.id,
          labAccountId: lab.id,
          patientUhidSnapshot: visit.patient.uhid,
          patientNameSnapshot: visit.patient.fullName,
          labNameSnapshot: lab.labName,
          totalAmount: hasAnyPrice ? computedSum : null,
          notes: input.notes ?? null,
          status: REFERRAL_STATUS.PENDING,
          referredByUserId: session.user.id,
          items: {
            create: itemCreates,
          },
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
          referenceId: created.referralNumber,
          details: `${doctorName} referred ${visit.patient.fullName} (${visit.patient.uhid}) to ${lab.labName} for ${created.items.length} test(s)${createdCatalogNames.length > 0 ? ` (added to lab catalog: ${createdCatalogNames.join(", ")})` : ""}.`,
        },
        tx
      );

      return { created, createdCatalogNames };
    });

    return NextResponse.json(
      {
        referral: result.created,
        createdCatalogNames: result.createdCatalogNames,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
