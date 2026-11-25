import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { createPatientWithOpSchema } from "@/lib/validators";
import {
  allocateOpVisitNumber,
  allocateReceiptNumber,
  allocateUhid,
} from "@/lib/sequences";
import {
  parseDateRangeBounds,
  parseSafeTzOffset,
  parseVisitDatePreservingTime,
} from "@/lib/datetime";
import { recordAuditLog } from "@/lib/audit";
import { ApiError, handleApiError } from "@/lib/api-utils";

function normalizePatientName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function GET(request: Request) {
  try {
    const session = await requireHospitalAuth([
      ROLES.HOSPITAL_ADMIN,
      ROLES.RECEPTIONIST,
    ]);
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const tzOffsetMinutes = parseSafeTzOffset(searchParams.get("tzOffset"), null);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
    const limit = Math.min(Math.max(1, Number(searchParams.get("limit") ?? 50) || 50), 100);

    const dateBounds =
      from || to ? parseDateRangeBounds({ from, to, tzOffsetMinutes }) : undefined;

    const andFilters: Prisma.PatientWhereInput[] = [];
    if (dateBounds && (dateBounds.gte || dateBounds.lte)) {
      andFilters.push({
        OR: [
          { registeredAt: dateBounds },
          { opVisits: { some: { visitDate: dateBounds } } },
        ],
      });
    }
    if (q) {
      andFilters.push({
        OR: [
          { fullName: { contains: q } },
          { uhid: { contains: q } },
          { phone: { contains: q } },
        ],
      });
    }

    const where: Prisma.PatientWhereInput = {
      hospitalId: session.hospitalId,
      ...(andFilters.length > 0 ? { AND: andFilters } : {}),
    };

    const [total, patients] = await Promise.all([
      prisma.patient.count({ where }),
      prisma.patient.findMany({
        where,
        orderBy: [
          { updatedAt: "desc" },
          { registeredAt: "desc" },
          { createdAt: "desc" },
          { id: "desc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: {
            select: {
              opVisits: true,
              ipAdmissions: true,
              pharmacyReferrals: true,
              labReferrals: true,
            },
          },
          opVisits: {
            take: 1,
            orderBy: { visitDate: "desc" },
            select: {
              id: true,
              visitNumber: true,
              visitDate: true,
              doctorNameSnapshot: true,
              billingReceipts: {
                take: 1,
                orderBy: { issuedAt: "desc" },
                select: { id: true, receiptNumber: true },
              },
            },
          },
          billingReceipts: {
            take: 1,
            orderBy: { issuedAt: "desc" },
            select: { id: true, receiptNumber: true },
          },
          ipAdmissions: {
            where: { status: "ADMITTED" },
            take: 1,
            select: {
              id: true,
              admissionNumber: true,
              wardSnapshot: true,
              bedNumberSnapshot: true,
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      patients,
      pagination: {
        total,
        page,
        pageSize: limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
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
    const input = createPatientWithOpSchema.parse(body);
    const hospitalId = session.hospitalId;

    const visitDate = parseVisitDatePreservingTime(
      input.visitDate,
      input.tzOffsetMinutes
    );
    if (Number.isNaN(visitDate.getTime())) {
      throw new ApiError(400, "Invalid visit date provided.", "INVALID_DATE");
    }

    const dob = input.dateOfBirth ? new Date(input.dateOfBirth) : null;
    if (dob && Number.isNaN(dob.getTime())) {
      throw new ApiError(400, "Invalid date of birth provided.", "INVALID_DOB");
    }

    const result = await prisma.$transaction(async (tx) => {
      const hospital = await tx.hospital.findUniqueOrThrow({
        where: { id: hospitalId },
      });

      let patient;
      let isNewPatient = false;
      let ageUpdatedFrom: number | null | undefined = undefined;

      const normalizedInputName = normalizePatientName(input.fullName);

      if (input.existingPatientId) {
        const existingRecord = await tx.patient.findFirst({
          where: { id: input.existingPatientId, hospitalId },
        });
        if (!existingRecord) {
          throw new ApiError(
            404,
            "Selected existing patient record was not found in this hospital.",
            "PATIENT_NOT_FOUND"
          );
        }

        // Prevent renaming/re-numbering a returning patient into a duplicate of another patient
        const samePhoneOthers = await tx.patient.findMany({
          where: {
            hospitalId,
            phone: input.phone,
            id: { not: existingRecord.id },
          },
          select: { id: true, uhid: true, fullName: true, phone: true },
        });
        const conflict = samePhoneOthers.find(
          (p) => normalizePatientName(p.fullName) === normalizedInputName
        );
        if (conflict) {
          throw new ApiError(
            409,
            `Another patient "${conflict.fullName}" with mobile number ${conflict.phone} is already registered (${conflict.uhid}).`,
            "DUPLICATE_PATIENT"
          );
        }

        const nextAge =
          input.age !== null && input.age !== undefined
            ? input.age
            : existingRecord.age;
        if (
          input.age !== null &&
          input.age !== undefined &&
          input.age !== existingRecord.age
        ) {
          ageUpdatedFrom = existingRecord.age;
        }

        patient = await tx.patient.update({
          where: { id: existingRecord.id },
          data: {
            fullName: input.fullName.trim(),
            phone: input.phone,
            gender: input.gender,
            age: nextAge,
            ...(dob ? { dateOfBirth: dob } : {}),
            ...(input.address !== undefined && input.address !== null
              ? { address: input.address }
              : {}),
            ...(input.bloodGroup !== undefined && input.bloodGroup !== null
              ? { bloodGroup: input.bloodGroup }
              : {}),
            ...(input.emergencyContact !== undefined &&
            input.emergencyContact !== null
              ? { emergencyContact: input.emergencyContact }
              : {}),
            updatedAt: new Date(),
          },
        });
      } else {
        // Strictly block duplicate (Patient Full Name + Mobile Number) within the same hospital
        const samePhonePatients = await tx.patient.findMany({
          where: { hospitalId, phone: input.phone },
          select: { id: true, uhid: true, fullName: true, phone: true },
        });
        const duplicate = samePhonePatients.find(
          (p) => normalizePatientName(p.fullName) === normalizedInputName
        );
        if (duplicate) {
          throw new ApiError(
            409,
            `Patient "${duplicate.fullName}" with mobile number ${duplicate.phone} is already registered (${duplicate.uhid}). Select them from the Patient Full Name recommendations to record a repeat OP visit and update their age.`,
            "DUPLICATE_PATIENT"
          );
        }

        const uhid = await allocateUhid(tx, hospitalId);
        patient = await tx.patient.create({
          data: {
            hospitalId,
            uhid,
            fullName: input.fullName.trim(),
            age: input.age ?? null,
            dateOfBirth: dob,
            gender: input.gender,
            phone: input.phone,
            address: input.address ?? null,
            bloodGroup: input.bloodGroup ?? null,
            emergencyContact: input.emergencyContact ?? null,
            registeredAt: visitDate,
            createdByUserId: session.user.id,
          },
        });
        isNewPatient = true;
      }

      const doc = await tx.doctor.findFirst({
        where: { id: input.doctorId, hospitalId },
      });
      if (!doc) {
        throw new ApiError(
          400,
          "Selected consulting doctor was not found. Please select a valid consulting doctor.",
          "DOCTOR_NOT_FOUND"
        );
      }
      if (!doc.isActive) {
        throw new ApiError(
          400,
          "Selected consulting doctor is inactive. Please choose an active consulting doctor.",
          "DOCTOR_INACTIVE"
        );
      }
      const resolvedDoctorId = doc.id;
      const doctorName = doc.name;
      const department = input.department?.trim() || doc.specialty || null;

      // Strictly use configured/entered fees — never invent unconfigured fees!
      const regFee = input.registrationFee ?? null;
      const consFee = input.consultationFee ?? null;
      const lineItems: Array<{ label: string; amount: number }> = [];

      if (regFee !== null) {
        lineItems.push({ label: "OP Registration Fee", amount: regFee });
      }
      if (consFee !== null) {
        lineItems.push({ label: "Consultation Fee", amount: consFee });
      }

      const totalAmount =
        lineItems.length > 0
          ? lineItems.reduce((sum, item) => sum + item.amount, 0)
          : null;

      const paymentStatus =
        totalAmount !== null
          ? input.paymentStatus ?? "PAID"
          : "NO_CHARGE";

      const visitNumber = await allocateOpVisitNumber(tx, hospitalId);
      const opVisit = await tx.opVisit.create({
        data: {
          hospitalId,
          visitNumber,
          patientId: patient.id,
          doctorId: resolvedDoctorId,
          doctorNameSnapshot: doctorName,
          departmentSnapshot: department,
          visitDate,
          reasonForVisit: input.reasonForVisit ?? null,
          notes: input.notes ?? null,
          registrationFee: regFee,
          consultationFee: consFee,
          totalAmount,
          paymentMode: totalAmount !== null ? input.paymentMode ?? "CASH" : null,
          paymentStatus,
          createdByUserId: session.user.id,
        },
      });

      const receiptNumber = await allocateReceiptNumber(tx, hospitalId);
      const receipt = await tx.billingReceipt.create({
        data: {
          hospitalId,
          receiptNumber,
          patientId: patient.id,
          opVisitId: opVisit.id,
          hospitalNameSnapshot: hospital.name,
          hospitalAddressSnapshot: hospital.address,
          hospitalPhoneSnapshot: hospital.phone,
          hospitalEmailSnapshot: hospital.email,
          hospitalLogoSnapshot: hospital.logoDataUrl,
          patientUhidSnapshot: patient.uhid,
          patientNameSnapshot: patient.fullName,
          visitSummarySnapshot: `OP Visit ${visitNumber} · ${doctorName}${department ? ` (${department})` : ""}`,
          lineItemsJson: JSON.stringify(lineItems),
          totalAmount,
          paymentMode: opVisit.paymentMode,
          paymentStatus,
          issuedAt: visitDate,
          issuedByUserId: session.user.id,
          issuedByNameSnapshot: session.user.fullName,
        },
      });

      if (isNewPatient) {
        await recordAuditLog(
          {
            hospitalId,
            actorUserId: session.user.id,
            actorUsername: session.user.username,
            actorRole: session.user.role,
            actionType: "PATIENT_REGISTERED",
            patientId: patient.id,
            patientUhid: patient.uhid,
            referenceId: patient.uhid,
            details: `Registered new patient "${patient.fullName}" (UHID: ${patient.uhid}, Phone: ${patient.phone}).`,
          },
          tx
        );
      } else if (ageUpdatedFrom !== undefined) {
        await recordAuditLog(
          {
            hospitalId,
            actorUserId: session.user.id,
            actorUsername: session.user.username,
            actorRole: session.user.role,
            actionType: "PATIENT_UPDATED",
            patientId: patient.id,
            patientUhid: patient.uhid,
            referenceId: patient.uhid,
            details: `Updated main profile age for returning patient "${patient.fullName}" (${patient.uhid}) from ${ageUpdatedFrom ?? "unset"} to ${patient.age} yrs during OP registration.`,
          },
          tx
        );
      }

      await recordAuditLog(
        {
          hospitalId,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "OP_VISIT_CREATED",
          patientId: patient.id,
          patientUhid: patient.uhid,
          referenceId: opVisit.visitNumber,
          details: `${isNewPatient ? "Initial" : "Repeat"} OP visit ${opVisit.visitNumber} created for ${patient.fullName} (${patient.uhid}) with ${doctorName}.`,
        },
        tx
      );

      await recordAuditLog(
        {
          hospitalId,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "RECEIPT_GENERATED",
          patientId: patient.id,
          patientUhid: patient.uhid,
          referenceId: receipt.receiptNumber,
          details: `Generated OP receipt ${receipt.receiptNumber} for ${patient.uhid}${totalAmount !== null ? ` (Total: ₹${totalAmount.toFixed(2)})` : " (No charge configured)"}.`,
        },
        tx
      );

      return { patient, opVisit, receipt, isNewPatient };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
