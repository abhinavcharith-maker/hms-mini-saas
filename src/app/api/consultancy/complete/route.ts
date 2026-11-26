import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PHARMACY_MODE, REFERRAL_STATUS, ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { consultancyCompleteSchema } from "@/lib/validators";
import {
  allocateLabReferralNumber,
  allocatePharmacyReferralNumber,
} from "@/lib/sequences";
import { recordAuditLog } from "@/lib/audit";
import { ApiError, handleApiError } from "@/lib/api-utils";

function formatCombinedDosage(item: {
  dosageSchedule?: string | null;
  mealTiming?: "AFTER_MEAL" | "BEFORE_MEAL" | null;
  dosageInstructions?: string | null;
}) {
  if (item.dosageInstructions && item.dosageInstructions.trim().length > 0) {
    return item.dosageInstructions.trim();
  }
  const parts: string[] = [];
  if (item.dosageSchedule) parts.push(item.dosageSchedule);
  if (item.mealTiming === "AFTER_MEAL") parts.push("After Meal");
  else if (item.mealTiming === "BEFORE_MEAL") parts.push("Before Meal");
  return parts.length > 0 ? parts.join(" · ") : null;
}

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
    const input = consultancyCompleteSchema.parse(body);

    const visit = await prisma.opVisit.findFirst({
      where: { id: input.opVisitId, hospitalId },
      include: {
        patient: true,
        doctor: true,
      },
    });
    if (!visit) {
      throw new ApiError(
        404,
        "OP consultation visit not found.",
        "OP_VISIT_NOT_FOUND"
      );
    }
    if (isDoctor && visit.doctorId !== session.doctor!.id) {
      throw new ApiError(
        403,
        "You can only complete consultations for patients assigned to you.",
        "DOCTOR_SCOPE_FORBIDDEN"
      );
    }
    if (visit.consultancyCompletedAt) {
      throw new ApiError(
        409,
        "This patient's consultation has already been completed and cannot be selected again.",
        "CONSULTATION_ALREADY_COMPLETED"
      );
    }

    const pharmacyMode = session.hospital.pharmacyMode;

    if (
      input.medicines.length > 0 &&
      pharmacyMode === PHARMACY_MODE.REFERRALS &&
      !input.pharmacyAccountId
    ) {
      throw new ApiError(
        400,
        "Please select a pharmacy supplier for the prescribed medicines.",
        "PHARMACY_REQUIRED"
      );
    }

    if (input.labTests.length > 0 && !input.labAccountId) {
      throw new ApiError(
        400,
        "Please select a laboratory partner for the referred lab tests.",
        "LAB_REQUIRED"
      );
    }

    const doctorId = visit.doctorId ?? session.doctor?.id ?? null;
    const doctorName =
      visit.doctor?.name ??
      visit.doctorNameSnapshot ??
      session.doctor?.name ??
      session.user.fullName;
    const doctorQualification =
      visit.doctor?.qualification ?? session.doctor?.qualification ?? null;

    const result = await prisma.$transaction(async (tx) => {
      // Re-verify inside transaction to prevent double completion race conditions
      const freshVisit = await tx.opVisit.findFirst({
        where: { id: visit.id, hospitalId },
        select: { id: true, consultancyCompletedAt: true },
      });
      if (!freshVisit || freshVisit.consultancyCompletedAt) {
        throw new ApiError(
          409,
          "This patient's consultation has already been completed.",
          "CONSULTATION_ALREADY_COMPLETED"
        );
      }

      let prescription: { id: string; items: Array<{ id: string }> } | null = null;
      let pharmacyReferral: {
        id: string;
        referralNumber: string;
        items: Array<{ id: string }>;
      } | null = null;
      let labReferral: {
        id: string;
        referralNumber: string;
        items: Array<{ id: string }>;
      } | null = null;
      const createdMedicineCatalogNames: string[] = [];
      const createdLabCatalogNames: string[] = [];

      // 1. Medicines (if any)
      if (input.medicines.length > 0) {
        if (pharmacyMode === PHARMACY_MODE.MANAGEMENT) {
          const existingMeds = await tx.pharmacyMedicine.findMany({
            where: { hospitalId },
            select: { id: true, name: true },
          });
          const medById = new Map(existingMeds.map((m) => [m.id, m]));
          const medByLowerName = new Map(
            existingMeds.map((m) => [m.name.trim().toLowerCase(), m])
          );

          prescription = await tx.doctorPrescription.create({
            data: {
              hospitalId,
              patientId: visit.patientId,
              opVisitId: visit.id,
              doctorId,
              doctorNameSnapshot: doctorName,
              doctorQualificationSnapshot: doctorQualification,
              patientNameSnapshot: visit.patient.fullName,
              patientUhidSnapshot: visit.patient.uhid,
              patientPhoneSnapshot: visit.patient.phone,
              notes: input.medNotes ?? null,
              status: "PENDING",
              prescribedByUserId: session.user.id,
              items: {
                create: input.medicines.map((it) => {
                  const matched =
                    (it.pharmacyMedicineId
                      ? medById.get(it.pharmacyMedicineId)
                      : null) ??
                    medByLowerName.get(it.medicineName.trim().toLowerCase()) ??
                    null;
                  return {
                    hospitalId,
                    pharmacyMedicineId: matched?.id ?? null,
                    medicineNameSnapshot: matched?.name ?? it.medicineName.trim(),
                    quantityUnits: it.quantityUnits,
                    dosageSchedule: it.dosageSchedule ?? null,
                    mealTiming: it.mealTiming ?? null,
                    dosageInstructions: formatCombinedDosage(it),
                  };
                }),
              },
            },
            include: { items: true },
          });
        } else {
          const pharmacy = await tx.pharmacyAccount.findFirst({
            where: { id: input.pharmacyAccountId!, hospitalId, isActive: true },
          });
          if (!pharmacy) {
            throw new ApiError(
              404,
              "Selected active pharmacy supplier was not found.",
              "PHARMACY_NOT_FOUND"
            );
          }

          const existingCatalog = await tx.medicineCatalog.findMany({
            where: { hospitalId },
          });
          const catById = new Map(existingCatalog.map((c) => [c.id, c]));
          const catByLowerName = new Map(
            existingCatalog.map((c) => [c.name.trim().toLowerCase(), c])
          );

          let computedSum = 0;
          let hasAnyPrice = false;
          const itemCreates: Array<{
            hospitalId: string;
            medicineCatalogId: string;
            medicineNameSnapshot: string;
            descriptionSnapshot: string | null;
            quantity: number;
            unitPriceSnapshot: number | null;
            lineTotal: number | null;
            dosageInstructions: string | null;
          }> = [];

          for (const item of input.medicines) {
            const cleanName = item.medicineName.trim();
            let med =
              (item.medicineCatalogId
                ? catById.get(item.medicineCatalogId)
                : undefined) ?? catByLowerName.get(cleanName.toLowerCase());

            if (!med) {
              med = await tx.medicineCatalog.create({
                data: {
                  hospitalId,
                  name: cleanName,
                  description: null,
                  price: null,
                  isActive: true,
                },
              });
              catById.set(med.id, med);
              catByLowerName.set(cleanName.toLowerCase(), med);
              createdMedicineCatalogNames.push(med.name);
            } else if (!med.isActive) {
              med = await tx.medicineCatalog.update({
                where: { id: med.id },
                data: { isActive: true },
              });
              catById.set(med.id, med);
            }

            const unitPrice = med.price ?? null;
            const lineTotal =
              unitPrice !== null ? unitPrice * item.quantityUnits : null;
            if (lineTotal !== null) {
              computedSum += lineTotal;
              hasAnyPrice = true;
            }
            itemCreates.push({
              hospitalId,
              medicineCatalogId: med.id,
              medicineNameSnapshot: med.name,
              descriptionSnapshot: med.description,
              quantity: item.quantityUnits,
              unitPriceSnapshot: unitPrice,
              lineTotal,
              dosageInstructions: formatCombinedDosage(item),
            });
          }

          const referralNumber = await allocatePharmacyReferralNumber(
            tx,
            hospitalId
          );
          pharmacyReferral = await tx.pharmacyReferral.create({
            data: {
              hospitalId,
              referralNumber,
              patientId: visit.patientId,
              opVisitId: visit.id,
              pharmacyAccountId: pharmacy.id,
              patientUhidSnapshot: visit.patient.uhid,
              patientNameSnapshot: visit.patient.fullName,
              pharmacyNameSnapshot: pharmacy.pharmacyName,
              totalAmount: hasAnyPrice ? computedSum : null,
              notes: input.medNotes ?? null,
              status: REFERRAL_STATUS.PENDING,
              referredByUserId: session.user.id,
              items: { create: itemCreates },
            },
            include: { items: true },
          });
        }
      }

      // 2. Laboratory Tests (if any)
      if (input.labTests.length > 0) {
        const lab = await tx.labAccount.findFirst({
          where: { id: input.labAccountId!, hospitalId, isActive: true },
        });
        if (!lab) {
          throw new ApiError(
            404,
            "Selected active laboratory partner was not found.",
            "LAB_NOT_FOUND"
          );
        }

        const existingLabCatalog = await tx.labTestCatalog.findMany({
          where: { hospitalId },
        });
        const labById = new Map(existingLabCatalog.map((c) => [c.id, c]));
        const labByLowerName = new Map(
          existingLabCatalog.map((c) => [c.name.trim().toLowerCase(), c])
        );

        let computedLabSum = 0;
        let hasAnyLabPrice = false;
        const labItemCreates: Array<{
          hospitalId: string;
          labTestCatalogId: string;
          testNameSnapshot: string;
          descriptionSnapshot: string | null;
          unitPriceSnapshot: number | null;
        }> = [];

        for (const item of input.labTests) {
          const cleanName = item.testName.trim();
          let test =
            (item.labTestCatalogId
              ? labById.get(item.labTestCatalogId)
              : undefined) ?? labByLowerName.get(cleanName.toLowerCase());

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
            labById.set(test.id, test);
            labByLowerName.set(cleanName.toLowerCase(), test);
            createdLabCatalogNames.push(test.name);
          } else if (!test.isActive) {
            test = await tx.labTestCatalog.update({
              where: { id: test.id },
              data: { isActive: true },
            });
            labById.set(test.id, test);
          }

          const unitPrice = test.price ?? null;
          if (unitPrice !== null) {
            computedLabSum += unitPrice;
            hasAnyLabPrice = true;
          }
          labItemCreates.push({
            hospitalId,
            labTestCatalogId: test.id,
            testNameSnapshot: test.name,
            descriptionSnapshot: test.description,
            unitPriceSnapshot: unitPrice,
          });
        }

        const referralNumber = await allocateLabReferralNumber(tx, hospitalId);
        labReferral = await tx.labReferral.create({
          data: {
            hospitalId,
            referralNumber,
            patientId: visit.patientId,
            opVisitId: visit.id,
            labAccountId: lab.id,
            patientUhidSnapshot: visit.patient.uhid,
            patientNameSnapshot: visit.patient.fullName,
            labNameSnapshot: lab.labName,
            totalAmount: hasAnyLabPrice ? computedLabSum : null,
            notes: input.labNotes ?? null,
            status: REFERRAL_STATUS.PENDING,
            referredByUserId: session.user.id,
            items: { create: labItemCreates },
          },
          include: { items: true },
        });
      }

      // 3. Mark OP Visit consultation as completed so patient cannot be selected again
      const completedAt = new Date();
      await tx.opVisit.update({
        where: { id: visit.id },
        data: {
          consultancyCompletedAt: completedAt,
          consultancyCompletedByUserId: session.user.id,
        },
      });

      const summaryParts: string[] = [];
      if (input.medicines.length > 0) {
        summaryParts.push(`${input.medicines.length} medicine(s)`);
      }
      if (input.labTests.length > 0) {
        summaryParts.push(`${input.labTests.length} lab test(s)`);
      }
      const summaryText =
        summaryParts.length > 0
          ? summaryParts.join(" & ")
          : "no medicines or lab tests (consultation/advice only)";

      await recordAuditLog(
        {
          hospitalId,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "CONSULTANCY_COMPLETED",
          referenceId: visit.visitNumber,
          details: `${doctorName} completed consultation for ${visit.patient.fullName} (${visit.patient.uhid}) with ${summaryText}.`,
        },
        tx
      );

      return {
        completedAt,
        prescription,
        pharmacyReferral,
        labReferral,
        createdMedicineCatalogNames,
        createdLabCatalogNames,
      };
    });

    return NextResponse.json(
      {
        ok: true,
        mode: pharmacyMode,
        completedAt: result.completedAt,
        prescription: result.prescription,
        pharmacyReferral: result.pharmacyReferral,
        labReferral: result.labReferral,
        createdMedicineCatalogNames: result.createdMedicineCatalogNames,
        createdLabCatalogNames: result.createdLabCatalogNames,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
