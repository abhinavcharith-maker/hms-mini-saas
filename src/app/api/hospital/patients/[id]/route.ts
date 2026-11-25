import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/constants";
import { requireHospitalAuth } from "@/lib/auth";
import { updatePatientSchema } from "@/lib/validators";
import { recordAuditLog } from "@/lib/audit";
import { ApiError, handleApiError } from "@/lib/api-utils";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireHospitalAuth([
      ROLES.HOSPITAL_ADMIN,
      ROLES.RECEPTIONIST,
    ]);
    const { id } = await context.params;
    const hospitalId = session.hospitalId;

    const patient = await prisma.patient.findFirst({
      where: {
        hospitalId,
        OR: [{ id }, { uhid: id }],
      },
      include: {
        opVisits: {
          orderBy: { visitDate: "desc" },
          include: {
            billingReceipts: {
              select: {
                id: true,
                receiptNumber: true,
                totalAmount: true,
                paymentMode: true,
                paymentStatus: true,
                issuedAt: true,
              },
            },
          },
        },
        ipAdmissions: {
          orderBy: { admittedAt: "desc" },
          include: {
            bedTransfers: { orderBy: { transferredAt: "asc" } },
          },
        },
        pharmacyReferrals: {
          orderBy: { referredAt: "desc" },
          include: { items: true },
        },
        labReferrals: {
          orderBy: { referredAt: "desc" },
          include: { items: true },
        },
        billingReceipts: {
          orderBy: { issuedAt: "desc" },
        },
      },
    });

    if (!patient) {
      throw new ApiError(404, "Patient record not found.", "NOT_FOUND");
    }

    return NextResponse.json({
      patient,
      hospital: session.hospital,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireHospitalAuth([
      ROLES.HOSPITAL_ADMIN,
      ROLES.RECEPTIONIST,
    ]);
    const { id } = await context.params;
    const body = await request.json();
    const input = updatePatientSchema.parse(body);

    const existing = await prisma.patient.findFirst({
      where: { id, hospitalId: session.hospitalId },
    });
    if (!existing) {
      throw new ApiError(404, "Patient not found.", "NOT_FOUND");
    }

    const normalizedName = input.fullName.trim().replace(/\s+/g, " ").toLowerCase();
    const samePhoneOthers = await prisma.patient.findMany({
      where: {
        hospitalId: session.hospitalId,
        phone: input.phone,
        id: { not: id },
      },
      select: { id: true, uhid: true, fullName: true, phone: true },
    });
    const duplicate = samePhoneOthers.find(
      (p) => p.fullName.trim().replace(/\s+/g, " ").toLowerCase() === normalizedName
    );
    if (duplicate) {
      throw new ApiError(
        409,
        `Another patient "${duplicate.fullName}" with mobile number ${duplicate.phone} is already registered (${duplicate.uhid}). Duplicate full name and mobile number are not allowed.`,
        "DUPLICATE_PATIENT"
      );
    }

    const dob = input.dateOfBirth ? new Date(input.dateOfBirth) : null;
    if (dob && Number.isNaN(dob.getTime())) {
      throw new ApiError(400, "Invalid date of birth.", "INVALID_DOB");
    }

    const patient = await prisma.$transaction(async (tx) => {
      const updated = await tx.patient.update({
        where: { id },
        data: {
          fullName: input.fullName,
          age: input.age ?? null,
          dateOfBirth: dob,
          gender: input.gender,
          phone: input.phone,
          address: input.address ?? null,
          bloodGroup: input.bloodGroup ?? null,
          emergencyContact: input.emergencyContact ?? null,
        },
      });

      await recordAuditLog(
        {
          hospitalId: session.hospitalId,
          actorUserId: session.user.id,
          actorUsername: session.user.username,
          actorRole: session.user.role,
          actionType: "PATIENT_UPDATED",
          patientId: updated.id,
          patientUhid: updated.uhid,
          referenceId: updated.uhid,
          details: `Updated demographic profile for ${updated.fullName} (${updated.uhid}).`,
        },
        tx
      );

      return updated;
    });

    return NextResponse.json({ patient });
  } catch (error) {
    return handleApiError(error);
  }
}
