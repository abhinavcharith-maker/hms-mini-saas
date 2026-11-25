import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PHARMACY_MODE, REFERRAL_STATUS, ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { consultancyPrescribeSchema } from "@/lib/validators";
import { allocatePharmacyReferralNumber } from "@/lib/sequences";
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
    const input = consultancyPrescribeSchema.parse(body);

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
        "You can only prescribe for patients assigned to you.",
        "DOCTOR_SCOPE_FORBIDDEN"
      );
    }

    const doctorId = visit.doctorId ?? session.doctor?.id ?? null;
    const doctorName =
      visit.doctor?.name ?? visit.doctorNameSnapshot ?? session.doctor?.name ?? session.user.fullName;
    const doctorQualification =
      visit.doctor?.qualification ?? session.doctor?.qualification ?? null;

    if (session.hospital.pharmacyMode === PHARMACY_MODE.MANAGEMENT) {
      // Pharmacy Management Mode: create DoctorPrescription (no batch selection; Pharmacy auto-picks earliest expiry FEFO!)
      const existingMeds = await prisma.pharmacyMedicine.findMany({
        where: { hospitalId },
        select: { id: true, name: true },
      });
      const medById = new Map(existingMeds.map((m) => [m.id, m]));
      const medByLowerName = new Map(
        existingMeds.map((m) => [m.name.trim().toLowerCase(), m])
      );

      const prescription = await prisma.$transaction(async (tx) => {
        const created = await tx.doctorPrescription.create({
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
            notes: input.notes ?? null,
            status: "PENDING",
            prescribedByUserId: session.user.id,
            items: {
              create: input.items.map((it) => {
                const matched =
                  (it.pharmacyMedicineId ? medById.get(it.pharmacyMedicineId) : null) ??
                  medByLowerName.get(it.medicineName.trim().toLowerCase()) ??
                  null;
                return {
                  hospitalId,
                  pharmacyMedicineId: matched?.id ?? null,
                  medicineNameSnapshot: matched?.name ?? it.medicineName.trim(),
                  quantityUnits: it.quantityUnits,
                  dosageInstructions: it.dosageInstructions ?? null,
                };
              }),
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
            actionType: "DOCTOR_PRESCRIPTION_CREATED",
            referenceId: created.id,
            details: `${doctorName} prescribed ${created.items.length} medicine(s) for ${visit.patient.fullName} (${visit.patient.uhid}) to Pharmacy Management queue.`,
          },
          tx
        );

        return created;
      });

      return NextResponse.json(
        { mode: PHARMACY_MODE.MANAGEMENT, prescription },
        { status: 201 }
      );
    }

    // Pharmacy Referrals Mode: require supplier & auto-create any new medicine in MedicineCatalog!
    if (!input.pharmacyAccountId) {
      throw new ApiError(
        400,
        "Please select a pharmacy supplier for this medicine referral.",
        "PHARMACY_REQUIRED"
      );
    }

    const referral = await prisma.$transaction(async (tx) => {
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
      const createdCatalogNames: string[] = [];

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

      for (const item of input.items) {
        const cleanName = item.medicineName.trim();
        let med =
          (item.medicineCatalogId ? catById.get(item.medicineCatalogId) : undefined) ??
          catByLowerName.get(cleanName.toLowerCase());

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
          createdCatalogNames.push(med.name);
        } else if (!med.isActive) {
          med = await tx.medicineCatalog.update({
            where: { id: med.id },
            data: { isActive: true },
          });
          catById.set(med.id, med);
        }

        const unitPrice = med.price ?? null;
        const lineTotal = unitPrice !== null ? unitPrice * item.quantityUnits : null;
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
          dosageInstructions: item.dosageInstructions ?? null,
        });
      }

      const referralNumber = await allocatePharmacyReferralNumber(tx, hospitalId);
      const created = await tx.pharmacyReferral.create({
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
          actionType: "PHARMACY_REFERRAL_CREATED",
          referenceId: created.referralNumber,
          details: `${doctorName} referred ${visit.patient.fullName} (${visit.patient.uhid}) to ${pharmacy.pharmacyName} with ${created.items.length} medicine(s)${createdCatalogNames.length > 0 ? ` (added to catalog: ${createdCatalogNames.join(", ")})` : ""}.`,
        },
        tx
      );

      return { created, createdCatalogNames };
    });

    return NextResponse.json(
      {
        mode: PHARMACY_MODE.REFERRALS,
        referral: referral.created,
        createdCatalogNames: referral.createdCatalogNames,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
