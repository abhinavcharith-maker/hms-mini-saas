import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BED_STATUS, IP_STATUS, ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { admitPatientSchema } from "@/lib/validators";
import {
  allocateIpAdmissionNumber,
  allocateReceiptNumber,
} from "@/lib/sequences";
import { recordAuditLog } from "@/lib/audit";
import { ApiError, handleApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const session = await requireHospitalAuth([
      ROLES.HOSPITAL_ADMIN,
      ROLES.RECEPTIONIST,
    ]);
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status") || undefined;

    const admissions = await prisma.ipAdmission.findMany({
      where: {
        hospitalId: session.hospitalId,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      orderBy: [{ status: "asc" }, { admittedAt: "desc" }],
      include: {
        patient: {
          select: {
            id: true,
            uhid: true,
            fullName: true,
            age: true,
            gender: true,
            phone: true,
          },
        },
        bed: {
          select: { id: true, bedNumber: true, ward: true, category: true, status: true },
        },
        bedTransfers: {
          orderBy: { transferredAt: "asc" },
        },
        stayExtensions: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    const nowMs = Date.now();
    const enriched = admissions.map((a) => {
      const effectiveExpectedCheckout =
        a.expectedCheckoutAt ??
        new Date(a.admittedAt.getTime() + Math.max(1, a.stayDays || 1) * 86_400_000);
      const isStayOverdue =
        a.status === IP_STATUS.ADMITTED && nowMs > effectiveExpectedCheckout.getTime();
      const overdueHours = isStayOverdue
        ? Math.max(1, Math.ceil((nowMs - effectiveExpectedCheckout.getTime()) / 3_600_000))
        : 0;
      return {
        ...a,
        expectedCheckoutAt: effectiveExpectedCheckout.toISOString(),
        isStayOverdue,
        overdueHours,
      };
    });

    return NextResponse.json({ admissions: enriched });
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
    const input = admitPatientSchema.parse(body);
    const hospitalId = session.hospitalId;

    const admittedAt = input.admittedAt ? new Date(input.admittedAt) : new Date();
    if (Number.isNaN(admittedAt.getTime())) {
      throw new ApiError(400, "Invalid admission date/time.", "INVALID_DATE");
    }

    const admission = await prisma.$transaction(async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: input.patientId, hospitalId },
      });
      if (!patient) {
        throw new ApiError(404, "Patient not found in this hospital.", "PATIENT_NOT_FOUND");
      }

      const activeForPatient = await tx.ipAdmission.findFirst({
        where: { hospitalId, patientId: patient.id, status: IP_STATUS.ADMITTED },
      });
      if (activeForPatient) {
        throw new ApiError(
          409,
          `Patient ${patient.fullName} (${patient.uhid}) is already admitted under ${activeForPatient.admissionNumber}.`,
          "PATIENT_ALREADY_ADMITTED"
        );
      }

      const bed = await tx.bed.findFirst({
        where: { id: input.bedId, hospitalId },
      });
      if (!bed) {
        throw new ApiError(404, "Selected bed not found.", "BED_NOT_FOUND");
      }

      // Optimistic concurrency guard: bed can ONLY be claimed if currently AVAILABLE
      const claimed = await tx.bed.updateMany({
        where: { id: bed.id, hospitalId, status: BED_STATUS.AVAILABLE },
        data: { status: BED_STATUS.OCCUPIED },
      });
      if (claimed.count !== 1) {
        throw new ApiError(
          409,
          `Bed ${bed.bedNumber} is no longer available (current status: ${bed.status}).`,
          "BED_UNAVAILABLE"
        );
      }

      const activeBedCollision = await tx.ipAdmission.count({
        where: { bedId: bed.id, status: IP_STATUS.ADMITTED },
      });
      if (activeBedCollision > 0) {
        throw new ApiError(
          409,
          `Bed ${bed.bedNumber} already has an active admission.`,
          "BED_OCCUPIED"
        );
      }

      let doctorName = input.doctorName?.trim() || "Attending Physician";
      let resolvedDoctorId: string | null = null;
      if (input.doctorId) {
        const doc = await tx.doctor.findFirst({
          where: { id: input.doctorId, hospitalId },
        });
        if (!doc) {
          throw new ApiError(404, "Selected doctor not found.", "DOCTOR_NOT_FOUND");
        }
        resolvedDoctorId = doc.id;
        doctorName = doc.name;
      }

      const hospital = await tx.hospital.findUniqueOrThrow({
        where: { id: hospitalId },
      });

      const admissionNumber = await allocateIpAdmissionNumber(tx, hospitalId);
      const stayDays = Math.max(1, input.stayDays || 1);
      const expectedCheckoutAt = new Date(
        admittedAt.getTime() + stayDays * 86_400_000
      );
      const paymentMode = input.paymentMode || "CASH";

      const created = await tx.ipAdmission.create({
        data: {
          hospitalId,
          admissionNumber,
          patientId: patient.id,
          bedId: bed.id,
          doctorId: resolvedDoctorId,
          doctorNameSnapshot: doctorName,
          wardSnapshot: bed.ward,
          bedNumberSnapshot: bed.bedNumber,
          admittedAt,
          status: IP_STATUS.ADMITTED,
          chargeAmount: input.chargeAmount ?? null,
          paymentMode,
          stayDays,
          expectedCheckoutAt,
          admissionNotes: input.admissionNotes ?? null,
          admittedByUserId: session.user.id,
        },
        include: {
          patient: true,
          bed: true,
        },
      });

      if (input.chargeAmount !== null && input.chargeAmount !== undefined) {
        const receiptNumber = await allocateReceiptNumber(tx, hospitalId);
        await tx.billingReceipt.create({
          data: {
            hospitalId,
            receiptNumber,
            patientId: patient.id,
            ipAdmissionId: created.id,
            hospitalNameSnapshot: hospital.name,
            hospitalAddressSnapshot: hospital.address,
            hospitalPhoneSnapshot: hospital.phone,
            hospitalEmailSnapshot: hospital.email,
            hospitalLogoSnapshot: hospital.logoDataUrl,
            patientUhidSnapshot: patient.uhid,
            patientNameSnapshot: patient.fullName,
            visitSummarySnapshot: `IP Admission ${admissionNumber} · ${bed.ward} · Bed ${bed.bedNumber} (${stayDays} day${stayDays === 1 ? "" : "s"})`,
            lineItemsJson: JSON.stringify([
              {
                label: `IP Admission / Bed Charge (${stayDays} day${stayDays === 1 ? "" : "s"})`,
                amount: input.chargeAmount,
              },
            ]),
            totalAmount: input.chargeAmount,
            paymentMode,
            paymentStatus: "PAID",
            issuedAt: admittedAt,
            issuedByUserId: session.user.id,
            issuedByNameSnapshot: session.user.fullName,
          },
        });

        await recordAuditLog(
          {
            hospitalId,
            actorUserId: session.user.id,
            actorUsername: session.user.username,
            actorRole: session.user.role,
            actionType: "RECEIPT_GENERATED",
            patientId: patient.id,
            patientUhid: patient.uhid,
            referenceId: receiptNumber,
            details: `Generated IP receipt ${receiptNumber} for ${patient.uhid} (Charge: ₹${input.chargeAmount.toFixed(2)}).`,
          },
          tx
        );
      }

      await tx.bedTransfer.create({
        data: {
          hospitalId,
          ipAdmissionId: created.id,
          fromBedId: null,
          fromBedLabel: null,
          toBedId: bed.id,
          toBedLabel: `${bed.ward} · ${bed.bedNumber}`,
          reason: "Initial admission bed assignment",
          transferredAt: admittedAt,
          transferredByUserId: session.user.id,
        },
      });

      await recordAuditLog(
        {
          hospitalId,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "IP_ADMITTED",
          patientId: patient.id,
          patientUhid: patient.uhid,
          referenceId: created.admissionNumber,
          details: `Admitted ${patient.fullName} (${patient.uhid}) to ${bed.ward} · Bed ${bed.bedNumber} under ${doctorName}${input.chargeAmount !== null && input.chargeAmount !== undefined ? ` (Charge: ₹${input.chargeAmount.toFixed(2)})` : ""}.`,
        },
        tx
      );

      return created;
    });

    return NextResponse.json({ admission }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
