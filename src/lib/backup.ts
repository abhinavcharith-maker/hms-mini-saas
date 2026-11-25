import crypto from "crypto";
import { z } from "zod";
import { prisma } from "./prisma";
import {
  BACKUP_FORMAT,
  BACKUP_SCHEMA_VERSION,
  ROLES,
  SUPPORTED_BACKUP_VERSIONS,
} from "./constants";
import { computeSha256, generateTempPassword, hashPassword } from "./security";
import {
  generateAuditEventId,
  pruneHospitalAuditLogs,
  prunePlatformAuditLogs,
} from "./audit";
import { ApiError } from "./api-utils";
import { revokeHospitalSessions } from "./auth";

async function createManyChunked<T>(
  runner: (chunk: T[]) => Promise<unknown>,
  rows: T[],
  chunkSize = 200
) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    await runner(rows.slice(i, i + chunkSize));
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}

function newCuidLike(): string {
  return `rest_${crypto.randomBytes(10).toString("hex")}`;
}

const isoDateOrNull = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v ? new Date(v) : null))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), {
    message: "Invalid date value in backup",
  });

const isoDateRequired = z
  .string()
  .transform((v) => new Date(v))
  .refine((d) => !Number.isNaN(d.getTime()), {
    message: "Invalid required date value in backup",
  });

const backupDataSchema = z.object({
  hospitals: z.array(
    z.object({
      id: z.string().min(1),
      code: z.string().min(1),
      name: z.string().min(1),
      slug: z.string().min(1),
      address: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      logoDataUrl: z.string().nullable().optional(),
      tagline: z.string().nullable().optional(),
      registrationNo: z.string().nullable().optional(),
      defaultConsultationFee: z.number().nullable().optional(),
      dailyOpLimit: z.number().int().nullable().optional(),
      dailyIpLimit: z.number().int().nullable().optional(),
      subscriptionMonthsPaid: z.number().int().min(0).optional(),
      subscriptionExpiresAt: isoDateOrNull.optional(),
      subscriptionTotalPaid: z.number().min(0).optional(),
      pharmacyMode: z.enum(["REFERRALS", "MANAGEMENT"]).optional(),
      consultancyEnabled: z.boolean().optional(),
      uhidPrefix: z.string().default("UHID"),
      nextUhidSeq: z.number().int().min(1).default(1),
      nextOpSeq: z.number().int().min(1).default(1),
      nextIpSeq: z.number().int().min(1).default(1),
      nextPharmRefSeq: z.number().int().min(1).default(1),
      nextPharmSaleSeq: z.number().int().min(1).optional(),
      nextLabRefSeq: z.number().int().min(1).default(1),
      nextReceiptSeq: z.number().int().min(1).default(1),
      isActive: z.boolean().default(true),
      deactivatedAt: isoDateOrNull,
      createdAt: isoDateRequired,
    })
  ),
  users: z.array(
    z.object({
      id: z.string().min(1),
      hospitalId: z.string().nullable().optional(),
      username: z.string().min(1),
      fullName: z.string().min(1),
      email: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      passwordHash: z.string().min(20).optional(),
      role: z.enum([
        ROLES.SUPER_ADMIN,
        ROLES.HOSPITAL_ADMIN,
        ROLES.RECEPTIONIST,
        ROLES.DOCTOR,
        ROLES.PHARMACY_USER,
        ROLES.LAB_USER,
      ]),
      isActive: z.boolean().default(true),
      passwordChangedAt: isoDateOrNull,
      lastLoginAt: isoDateOrNull.optional(),
      createdAt: isoDateRequired,
    })
  ),
  doctors: z.array(
    z.object({
      id: z.string().min(1),
      hospitalId: z.string().min(1),
      userId: z.string().nullable().optional(),
      name: z.string().min(1),
      specialty: z.string().nullable().optional(),
      qualification: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      consultationFee: z.number().nullable().optional(),
      signatureDataUrl: z.string().nullable().optional(),
      isActive: z.boolean().default(true),
      createdAt: isoDateRequired,
    })
  ),
  patients: z.array(
    z.object({
      id: z.string().min(1),
      hospitalId: z.string().min(1),
      uhid: z.string().min(1),
      fullName: z.string().min(1),
      age: z.number().int().nullable().optional(),
      dateOfBirth: isoDateOrNull,
      gender: z.string().min(1),
      phone: z.string().min(1),
      address: z.string().nullable().optional(),
      bloodGroup: z.string().nullable().optional(),
      emergencyContact: z.string().nullable().optional(),
      registeredAt: isoDateRequired,
      createdByUserId: z.string().nullable().optional(),
      createdAt: isoDateRequired,
    })
  ),
  opVisits: z.array(
    z.object({
      id: z.string().min(1),
      hospitalId: z.string().min(1),
      visitNumber: z.string().min(1),
      patientId: z.string().min(1),
      doctorId: z.string().nullable().optional(),
      doctorNameSnapshot: z.string().min(1),
      departmentSnapshot: z.string().nullable().optional(),
      visitDate: isoDateRequired,
      reasonForVisit: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      consultationFee: z.number().nullable().optional(),
      registrationFee: z.number().nullable().optional(),
      totalAmount: z.number().nullable().optional(),
      paymentMode: z.string().nullable().optional(),
      paymentStatus: z.string().nullable().optional(),
      createdByUserId: z.string().nullable().optional(),
      createdAt: isoDateRequired,
    })
  ),
  billingReceipts: z.array(
    z.object({
      id: z.string().min(1),
      hospitalId: z.string().min(1),
      receiptNumber: z.string().min(1),
      patientId: z.string().min(1),
      opVisitId: z.string().nullable().optional(),
      ipAdmissionId: z.string().nullable().optional(),
      hospitalNameSnapshot: z.string().min(1),
      hospitalAddressSnapshot: z.string().nullable().optional(),
      hospitalPhoneSnapshot: z.string().nullable().optional(),
      hospitalEmailSnapshot: z.string().nullable().optional(),
      hospitalLogoSnapshot: z.string().nullable().optional(),
      patientUhidSnapshot: z.string().min(1),
      patientNameSnapshot: z.string().min(1),
      visitSummarySnapshot: z.string().min(1),
      lineItemsJson: z.string().default("[]"),
      totalAmount: z.number().nullable().optional(),
      paymentMode: z.string().nullable().optional(),
      paymentStatus: z.string().nullable().optional(),
      issuedAt: isoDateRequired,
      issuedByUserId: z.string().nullable().optional(),
      issuedByNameSnapshot: z.string().min(1),
    })
  ),
  beds: z.array(
    z.object({
      id: z.string().min(1),
      hospitalId: z.string().min(1),
      bedNumber: z.string().min(1),
      ward: z.string().min(1),
      category: z.string().nullable().optional(),
      status: z.enum(["AVAILABLE", "OCCUPIED", "INACTIVE"]),
      notes: z.string().nullable().optional(),
      createdAt: isoDateRequired,
    })
  ),
  ipAdmissions: z.array(
    z.object({
      id: z.string().min(1),
      hospitalId: z.string().min(1),
      admissionNumber: z.string().min(1),
      patientId: z.string().min(1),
      bedId: z.string().nullable().optional(),
      doctorId: z.string().nullable().optional(),
      doctorNameSnapshot: z.string().min(1),
      wardSnapshot: z.string().min(1),
      bedNumberSnapshot: z.string().min(1),
      admittedAt: isoDateRequired,
      dischargedAt: isoDateOrNull,
      status: z.enum(["ADMITTED", "DISCHARGED"]),
      chargeAmount: z.number().nullable().optional(),
      paymentMode: z.string().nullable().optional(),
      stayDays: z.number().int().min(1).optional(),
      expectedCheckoutAt: isoDateOrNull.optional(),
      admissionNotes: z.string().nullable().optional(),
      dischargeNotes: z.string().nullable().optional(),
      admittedByUserId: z.string().nullable().optional(),
      dischargedByUserId: z.string().nullable().optional(),
      createdAt: isoDateRequired,
    })
  ),
  bedTransfers: z.array(
    z.object({
      id: z.string().min(1),
      hospitalId: z.string().min(1),
      ipAdmissionId: z.string().min(1),
      fromBedId: z.string().nullable().optional(),
      fromBedLabel: z.string().nullable().optional(),
      toBedId: z.string().min(1),
      toBedLabel: z.string().min(1),
      reason: z.string().nullable().optional(),
      transferredAt: isoDateRequired,
      transferredByUserId: z.string().nullable().optional(),
    })
  ),
  medicineCatalog: z.array(
    z.object({
      id: z.string().min(1),
      hospitalId: z.string().min(1),
      name: z.string().min(1),
      description: z.string().nullable().optional(),
      price: z.number().nullable().optional(),
      isActive: z.boolean().default(true),
      createdAt: isoDateRequired,
    })
  ),
  pharmacyAccounts: z.array(
    z.object({
      id: z.string().min(1),
      hospitalId: z.string().min(1),
      userId: z.string().min(1),
      pharmacyName: z.string().min(1),
      contactPerson: z.string().min(1),
      phone: z.string().min(1),
      address: z.string().nullable().optional(),
      isActive: z.boolean().default(true),
      createdAt: isoDateRequired,
    })
  ),
  pharmacyReferrals: z.array(
    z.object({
      id: z.string().min(1),
      hospitalId: z.string().min(1),
      referralNumber: z.string().min(1),
      patientId: z.string().min(1),
      pharmacyAccountId: z.string().min(1),
      opVisitId: z.string().nullable().optional(),
      ipAdmissionId: z.string().nullable().optional(),
      patientNameSnapshot: z.string().min(1),
      patientUhidSnapshot: z.string().min(1),
      patientPhoneSnapshot: z.string().nullable().optional(),
      pharmacyNameSnapshot: z.string().min(1),
      notes: z.string().nullable().optional(),
      totalAmount: z.number().nullable().optional(),
      status: z.enum(["PENDING", "COMPLETED", "CANCELLED"]),
      referredAt: isoDateRequired,
      referredByUserId: z.string().min(1),
      completedAt: isoDateOrNull,
      completedByUserId: z.string().nullable().optional(),
      completedByNameSnapshot: z.string().nullable().optional(),
      cancelledAt: isoDateOrNull,
      cancelledByUserId: z.string().nullable().optional(),
      createdAt: isoDateRequired,
    })
  ),
  pharmacyReferralItems: z.array(
    z.object({
      id: z.string().min(1),
      hospitalId: z.string().min(1),
      referralId: z.string().min(1),
      medicineCatalogId: z.string().nullable().optional(),
      medicineNameSnapshot: z.string().min(1),
      descriptionSnapshot: z.string().nullable().optional(),
      quantity: z.number().int().min(1),
      unitPriceSnapshot: z.number().nullable().optional(),
      lineTotal: z.number().nullable().optional(),
      dosageInstructions: z.string().nullable().optional(),
    })
  ),
  labTestCatalog: z.array(
    z.object({
      id: z.string().min(1),
      hospitalId: z.string().min(1),
      name: z.string().min(1),
      description: z.string().nullable().optional(),
      price: z.number().nullable().optional(),
      isActive: z.boolean().default(true),
      createdAt: isoDateRequired,
    })
  ),
  labAccounts: z.array(
    z.object({
      id: z.string().min(1),
      hospitalId: z.string().min(1),
      userId: z.string().min(1),
      labName: z.string().min(1),
      contactPerson: z.string().min(1),
      phone: z.string().min(1),
      address: z.string().nullable().optional(),
      isActive: z.boolean().default(true),
      createdAt: isoDateRequired,
    })
  ),
  labReferrals: z.array(
    z.object({
      id: z.string().min(1),
      hospitalId: z.string().min(1),
      referralNumber: z.string().min(1),
      patientId: z.string().min(1),
      labAccountId: z.string().min(1),
      opVisitId: z.string().nullable().optional(),
      ipAdmissionId: z.string().nullable().optional(),
      patientNameSnapshot: z.string().min(1),
      patientUhidSnapshot: z.string().min(1),
      patientPhoneSnapshot: z.string().nullable().optional(),
      labNameSnapshot: z.string().min(1),
      notes: z.string().nullable().optional(),
      totalAmount: z.number().nullable().optional(),
      status: z.enum(["PENDING", "COMPLETED", "CANCELLED"]),
      referredAt: isoDateRequired,
      referredByUserId: z.string().min(1),
      completedAt: isoDateOrNull,
      completedByUserId: z.string().nullable().optional(),
      completedByNameSnapshot: z.string().nullable().optional(),
      cancelledAt: isoDateOrNull,
      cancelledByUserId: z.string().nullable().optional(),
      createdAt: isoDateRequired,
    })
  ),
  labReferralItems: z.array(
    z.object({
      id: z.string().min(1),
      hospitalId: z.string().min(1),
      referralId: z.string().min(1),
      labTestCatalogId: z.string().nullable().optional(),
      testNameSnapshot: z.string().min(1),
      descriptionSnapshot: z.string().nullable().optional(),
      unitPriceSnapshot: z.number().nullable().optional(),
    })
  ),
  auditLogs: z.array(
    z.object({
      id: z.string().min(1),
      eventId: z.string().min(1),
      hospitalId: z.string().nullable().optional(),
      actorUserId: z.string().nullable().optional(),
      actorUsername: z.string().min(1),
      actorRole: z.string().min(1),
      actionType: z.string().min(1),
      patientId: z.string().nullable().optional(),
      patientUhid: z.string().nullable().optional(),
      referenceId: z.string().nullable().optional(),
      details: z.string().min(1),
      metadataJson: z.string().nullable().optional(),
      createdAt: isoDateRequired,
    })
  ),
  notifications: z
    .array(
      z.object({
        id: z.string().min(1),
        hospitalId: z.string().min(1),
        targetRole: z.string().min(1),
        title: z.string().min(1),
        message: z.string().min(1),
        category: z.string().min(1),
        isRead: z.boolean(),
        createdAt: isoDateRequired,
      })
    )
    .default([]),
  hospitalPayments: z
    .array(
      z.object({
        id: z.string().min(1),
        hospitalId: z.string().min(1),
        durationValue: z.number().int().min(1),
        durationUnit: z.string().min(1),
        monthsAdded: z.number().int().min(0),
        amountCollected: z.number().min(0),
        previousExpiresAt: isoDateOrNull.optional(),
        newExpiresAt: isoDateRequired,
        notes: z.string().nullable().optional(),
        recordedByUserId: z.string().nullable().optional(),
        recordedByUsername: z.string().min(1),
        paidAt: isoDateRequired,
        createdAt: isoDateRequired,
      })
    )
    .optional(),
  pharmacyMedicines: z
    .array(
      z.object({
        id: z.string().min(1),
        hospitalId: z.string().min(1),
        name: z.string().min(1),
        packagingType: z.string().min(1),
        unitsPerSheet: z.number().int().min(1),
        minStock: z.number().int().min(0),
        unitSellingPrice: z.number().min(0),
        sheetSellingPrice: z.number().min(0),
        hsnCode: z.string().nullable().optional(),
        gstPercent: z.number().min(0),
        prescriptionRequired: z.boolean(),
        placement: z.string().nullable().optional(),
        createdAt: isoDateRequired,
      })
    )
    .optional(),
  pharmacyBatches: z
    .array(
      z.object({
        id: z.string().min(1),
        hospitalId: z.string().min(1),
        medicineId: z.string().min(1),
        batchNumber: z.string().min(1),
        expiryMonth: z.number().int().min(1).max(12),
        expiryYear: z.number().int().min(2000).max(2150),
        expiryDate: z.string().min(1),
        quantityUnits: z.number().int().min(0),
        initialQuantityUnits: z.number().int().min(0),
        createdAt: isoDateRequired,
      })
    )
    .optional(),
  pharmacySales: z
    .array(
      z.object({
        id: z.string().min(1),
        hospitalId: z.string().min(1),
        saleNumber: z.string().min(1),
        patientName: z.string().min(1),
        patientPhone: z.string().min(1),
        doctorId: z.string().nullable().optional(),
        doctorName: z.string().min(1),
        doctorQualificationSnapshot: z.string().nullable().optional(),
        subtotal: z.number().min(0),
        gstAmount: z.number().min(0),
        totalAmount: z.number().min(0),
        totalUnitsSold: z.number().int().min(0),
        paymentMode: z.string().min(1),
        soldByUserId: z.string().nullable().optional(),
        soldByNameSnapshot: z.string().min(1),
        soldAt: isoDateRequired,
        createdAt: isoDateRequired,
      })
    )
    .optional(),
  pharmacySaleItems: z
    .array(
      z.object({
        id: z.string().min(1),
        hospitalId: z.string().min(1),
        saleId: z.string().min(1),
        medicineId: z.string().nullable().optional(),
        batchId: z.string().nullable().optional(),
        medicineNameSnapshot: z.string().min(1),
        batchNumberSnapshot: z.string().min(1),
        expiryDateSnapshot: z.string().min(1),
        hsnCodeSnapshot: z.string().nullable().optional(),
        placementSnapshot: z.string().nullable().optional(),
        prescriptionRequired: z.boolean(),
        sellMode: z.string().min(1),
        enteredQuantity: z.number().int().min(1),
        unitsPerSheetSnapshot: z.number().int().min(1),
        basicUnitsDeducted: z.number().int().min(1),
        unitPriceSnapshot: z.number().min(0),
        gstPercentSnapshot: z.number().min(0),
        subtotal: z.number().min(0),
        gstAmount: z.number().min(0),
        lineTotal: z.number().min(0),
      })
    )
    .optional(),
  pharmacyStockLogs: z
    .array(
      z.object({
        id: z.string().min(1),
        hospitalId: z.string().min(1),
        medicineId: z.string().nullable().optional(),
        medicineNameSnapshot: z.string().min(1),
        batchNumberSnapshot: z.string().min(1),
        changeType: z.string().min(1),
        unitsDelta: z.number().int(),
        recordedByUserId: z.string().nullable().optional(),
        recordedByNameSnapshot: z.string().min(1),
        createdAt: isoDateRequired,
      })
    )
    .optional(),
  ipStayExtensions: z
    .array(
      z.object({
        id: z.string().min(1),
        hospitalId: z.string().min(1),
        ipAdmissionId: z.string().min(1),
        additionalDays: z.number().int().min(1),
        amountCollected: z.number().min(0),
        paymentMode: z.string().min(1),
        reason: z.string().min(1),
        previousCheckoutAt: isoDateOrNull.optional(),
        newCheckoutAt: isoDateRequired,
        extendedByUserId: z.string().nullable().optional(),
        extendedByNameSnapshot: z.string().min(1),
        createdAt: isoDateRequired,
      })
    )
    .optional(),
  employeeProfiles: z
    .array(
      z.object({
        id: z.string().min(1),
        hospitalId: z.string().min(1),
        employeeCode: z.string().min(1),
        fullName: z.string().min(1),
        roleTitle: z.string().min(1),
        department: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        shift: z.string().nullable().optional(),
        linkedDoctorId: z.string().nullable().optional(),
        linkedUserId: z.string().nullable().optional(),
        isActive: z.boolean().default(true),
        joinedAt: isoDateRequired,
        createdAt: isoDateRequired,
      })
    )
    .optional(),
  attendanceRecords: z
    .array(
      z.object({
        id: z.string().min(1),
        hospitalId: z.string().min(1),
        employeeId: z.string().min(1),
        attendanceDate: z.string().min(1),
        status: z.string().min(1),
        checkInTime: z.string().nullable().optional(),
        checkOutTime: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        markedByUserId: z.string().nullable().optional(),
        markedByNameSnapshot: z.string().min(1),
        createdAt: isoDateRequired,
      })
    )
    .optional(),
  maintenance: z
    .object({
      isActive: z.boolean(),
      reason: z.string().nullable().optional(),
      startsAt: isoDateOrNull,
      endsAt: isoDateOrNull,
      activatedByUserId: z.string().nullable().optional(),
      activatedByUsername: z.string().nullable().optional(),
      activatedAt: isoDateOrNull,
      endedAt: isoDateOrNull,
    })
    .nullable()
    .optional(),
});

export const backupFileSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.enum(SUPPORTED_BACKUP_VERSIONS),
  scope: z.enum(["PLATFORM", "HOSPITAL"]),
  exportedAt: z.string(),
  exportedBy: z.object({
    username: z.string(),
    fullName: z.string(),
  }),
  checksum: z.string().min(10),
  data: backupDataSchema,
});

export async function buildBackupExport(params: {
  hospitalId?: string | null;
  actor: { id: string; username: string; fullName: string; role: string };
}) {
  const scope = params.hospitalId ? "HOSPITAL" : "PLATFORM";
  const hospitalFilter = params.hospitalId ? { id: params.hospitalId } : {};
  const tenantFilter = params.hospitalId ? { hospitalId: params.hospitalId } : {};

  const hospitals = await prisma.hospital.findMany({
    where: hospitalFilter,
    orderBy: { createdAt: "asc" },
  });

  if (params.hospitalId && hospitals.length === 0) {
    throw new ApiError(404, "Target hospital not found for backup export.", "NOT_FOUND");
  }

  // Export full user records including salted bcrypt passwordHash (never plaintext) so
  // restoring snapshots preserves every user's exact credentials and state.
  const users = await prisma.user.findMany({
    where: params.hospitalId ? { hospitalId: params.hospitalId } : {},
    select: {
      id: true,
      hospitalId: true,
      username: true,
      fullName: true,
      email: true,
      phone: true,
      passwordHash: true,
      role: true,
      isActive: true,
      passwordChangedAt: true,
      lastLoginAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const [
    doctors,
    patients,
    opVisits,
    billingReceipts,
    beds,
    ipAdmissions,
    bedTransfers,
    medicineCatalog,
    pharmacyAccounts,
    pharmacyReferrals,
    pharmacyReferralItems,
    labTestCatalog,
    labAccounts,
    labReferrals,
    labReferralItems,
    auditLogs,
    notifications,
    hospitalPayments,
    pharmacyMedicines,
    pharmacyBatches,
    pharmacySales,
    pharmacySaleItems,
    pharmacyStockLogs,
    ipStayExtensions,
    maintenanceRow,
  ] = await Promise.all([
    prisma.doctor.findMany({ where: tenantFilter, orderBy: { createdAt: "asc" } }),
    prisma.patient.findMany({ where: tenantFilter, orderBy: { createdAt: "asc" } }),
    prisma.opVisit.findMany({ where: tenantFilter, orderBy: { createdAt: "asc" } }),
    prisma.billingReceipt.findMany({ where: tenantFilter, orderBy: { issuedAt: "asc" } }),
    prisma.bed.findMany({ where: tenantFilter, orderBy: { createdAt: "asc" } }),
    prisma.ipAdmission.findMany({ where: tenantFilter, orderBy: { createdAt: "asc" } }),
    prisma.bedTransfer.findMany({ where: tenantFilter, orderBy: { transferredAt: "asc" } }),
    prisma.medicineCatalog.findMany({ where: tenantFilter, orderBy: { createdAt: "asc" } }),
    prisma.pharmacyAccount.findMany({ where: tenantFilter, orderBy: { createdAt: "asc" } }),
    prisma.pharmacyReferral.findMany({ where: tenantFilter, orderBy: { createdAt: "asc" } }),
    prisma.pharmacyReferralItem.findMany({ where: tenantFilter }),
    prisma.labTestCatalog.findMany({ where: tenantFilter, orderBy: { createdAt: "asc" } }),
    prisma.labAccount.findMany({ where: tenantFilter, orderBy: { createdAt: "asc" } }),
    prisma.labReferral.findMany({ where: tenantFilter, orderBy: { createdAt: "asc" } }),
    prisma.labReferralItem.findMany({ where: tenantFilter }),
    prisma.auditLog.findMany({
      where: params.hospitalId ? { hospitalId: params.hospitalId } : {},
      orderBy: { createdAt: "asc" },
    }),
    prisma.notification.findMany({ where: tenantFilter, orderBy: { createdAt: "asc" } }),
    prisma.hospitalPayment.findMany({ where: tenantFilter, orderBy: { paidAt: "asc" } }),
    prisma.pharmacyMedicine.findMany({ where: tenantFilter, orderBy: { createdAt: "asc" } }),
    prisma.pharmacyBatch.findMany({ where: tenantFilter, orderBy: { createdAt: "asc" } }),
    prisma.pharmacySale.findMany({ where: tenantFilter, orderBy: { soldAt: "asc" } }),
    prisma.pharmacySaleItem.findMany({ where: tenantFilter }),
    prisma.pharmacyStockLog.findMany({ where: tenantFilter, orderBy: { createdAt: "asc" } }),
    prisma.ipStayExtension.findMany({ where: tenantFilter, orderBy: { createdAt: "asc" } }),
    params.hospitalId
      ? Promise.resolve(null)
      : prisma.systemMaintenance.findUnique({ where: { id: "singleton" } }),
  ]);

  const rawData = {
    hospitals: hospitals.map((h) => ({
      id: h.id,
      code: h.code,
      name: h.name,
      slug: h.slug,
      address: h.address,
      phone: h.phone,
      email: h.email,
      logoDataUrl: h.logoDataUrl,
      tagline: h.tagline,
      registrationNo: h.registrationNo,
      defaultConsultationFee: h.defaultConsultationFee,
      dailyOpLimit: h.dailyOpLimit,
      dailyIpLimit: h.dailyIpLimit,
      subscriptionMonthsPaid: h.subscriptionMonthsPaid,
      subscriptionExpiresAt: h.subscriptionExpiresAt
        ? h.subscriptionExpiresAt.toISOString()
        : null,
      subscriptionTotalPaid: h.subscriptionTotalPaid,
      pharmacyMode: h.pharmacyMode,
      consultancyEnabled: h.consultancyEnabled,
      uhidPrefix: h.uhidPrefix,
      nextUhidSeq: h.nextUhidSeq,
      nextOpSeq: h.nextOpSeq,
      nextIpSeq: h.nextIpSeq,
      nextPharmRefSeq: h.nextPharmRefSeq,
      nextPharmSaleSeq: h.nextPharmSaleSeq,
      nextLabRefSeq: h.nextLabRefSeq,
      nextReceiptSeq: h.nextReceiptSeq,
      isActive: h.isActive,
      deactivatedAt: h.deactivatedAt ? h.deactivatedAt.toISOString() : null,
      createdAt: h.createdAt.toISOString(),
    })),
    users: users.map((u) => ({
      id: u.id,
      hospitalId: u.hospitalId,
      username: u.username,
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
      passwordHash: u.passwordHash,
      role: u.role,
      isActive: u.isActive,
      passwordChangedAt: u.passwordChangedAt ? u.passwordChangedAt.toISOString() : null,
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
    })),
    doctors: doctors.map((d) => ({
      id: d.id,
      hospitalId: d.hospitalId,
      userId: d.userId ?? null,
      name: d.name,
      specialty: d.specialty,
      qualification: d.qualification,
      phone: d.phone,
      consultationFee: d.consultationFee,
      signatureDataUrl: d.signatureDataUrl,
      isActive: d.isActive,
      createdAt: d.createdAt.toISOString(),
    })),
    patients: patients.map((p) => ({
      id: p.id,
      hospitalId: p.hospitalId,
      uhid: p.uhid,
      fullName: p.fullName,
      age: p.age,
      dateOfBirth: p.dateOfBirth ? p.dateOfBirth.toISOString() : null,
      gender: p.gender,
      phone: p.phone,
      address: p.address,
      bloodGroup: p.bloodGroup,
      emergencyContact: p.emergencyContact,
      registeredAt: p.registeredAt.toISOString(),
      createdByUserId: p.createdByUserId,
      createdAt: p.createdAt.toISOString(),
    })),
    opVisits: opVisits.map((v) => ({
      id: v.id,
      hospitalId: v.hospitalId,
      visitNumber: v.visitNumber,
      patientId: v.patientId,
      doctorId: v.doctorId,
      doctorNameSnapshot: v.doctorNameSnapshot,
      departmentSnapshot: v.departmentSnapshot,
      visitDate: v.visitDate.toISOString(),
      reasonForVisit: v.reasonForVisit,
      notes: v.notes,
      consultationFee: v.consultationFee,
      registrationFee: v.registrationFee,
      totalAmount: v.totalAmount,
      paymentMode: v.paymentMode,
      paymentStatus: v.paymentStatus,
      createdByUserId: v.createdByUserId,
      createdAt: v.createdAt.toISOString(),
    })),
    billingReceipts: billingReceipts.map((r) => ({
      id: r.id,
      hospitalId: r.hospitalId,
      receiptNumber: r.receiptNumber,
      patientId: r.patientId,
      opVisitId: r.opVisitId,
      ipAdmissionId: r.ipAdmissionId,
      hospitalNameSnapshot: r.hospitalNameSnapshot,
      hospitalAddressSnapshot: r.hospitalAddressSnapshot,
      hospitalPhoneSnapshot: r.hospitalPhoneSnapshot,
      hospitalEmailSnapshot: r.hospitalEmailSnapshot,
      hospitalLogoSnapshot: r.hospitalLogoSnapshot,
      patientUhidSnapshot: r.patientUhidSnapshot,
      patientNameSnapshot: r.patientNameSnapshot,
      visitSummarySnapshot: r.visitSummarySnapshot,
      lineItemsJson: r.lineItemsJson,
      totalAmount: r.totalAmount,
      paymentMode: r.paymentMode,
      paymentStatus: r.paymentStatus,
      issuedAt: r.issuedAt.toISOString(),
      issuedByUserId: r.issuedByUserId,
      issuedByNameSnapshot: r.issuedByNameSnapshot,
    })),
    beds: beds.map((b) => ({
      id: b.id,
      hospitalId: b.hospitalId,
      bedNumber: b.bedNumber,
      ward: b.ward,
      category: b.category,
      status: b.status,
      notes: b.notes,
      createdAt: b.createdAt.toISOString(),
    })),
    ipAdmissions: ipAdmissions.map((a) => ({
      id: a.id,
      hospitalId: a.hospitalId,
      admissionNumber: a.admissionNumber,
      patientId: a.patientId,
      bedId: a.bedId,
      doctorId: a.doctorId,
      doctorNameSnapshot: a.doctorNameSnapshot,
      wardSnapshot: a.wardSnapshot,
      bedNumberSnapshot: a.bedNumberSnapshot,
      admittedAt: a.admittedAt.toISOString(),
      dischargedAt: a.dischargedAt ? a.dischargedAt.toISOString() : null,
      status: a.status,
      chargeAmount: a.chargeAmount,
      paymentMode: a.paymentMode,
      stayDays: a.stayDays,
      expectedCheckoutAt: a.expectedCheckoutAt ? a.expectedCheckoutAt.toISOString() : null,
      admissionNotes: a.admissionNotes,
      dischargeNotes: a.dischargeNotes,
      admittedByUserId: a.admittedByUserId,
      dischargedByUserId: a.dischargedByUserId,
      createdAt: a.createdAt.toISOString(),
    })),
    bedTransfers: bedTransfers.map((t) => ({
      id: t.id,
      hospitalId: t.hospitalId,
      ipAdmissionId: t.ipAdmissionId,
      fromBedId: t.fromBedId,
      fromBedLabel: t.fromBedLabel,
      toBedId: t.toBedId,
      toBedLabel: t.toBedLabel,
      reason: t.reason,
      transferredAt: t.transferredAt.toISOString(),
      transferredByUserId: t.transferredByUserId,
    })),
    medicineCatalog: medicineCatalog.map((m) => ({
      id: m.id,
      hospitalId: m.hospitalId,
      name: m.name,
      description: m.description,
      price: m.price,
      isActive: m.isActive,
      createdAt: m.createdAt.toISOString(),
    })),
    pharmacyAccounts: pharmacyAccounts.map((p) => ({
      id: p.id,
      hospitalId: p.hospitalId,
      userId: p.userId,
      pharmacyName: p.pharmacyName,
      contactPerson: p.contactPerson,
      phone: p.phone,
      address: p.address,
      isActive: p.isActive,
      createdAt: p.createdAt.toISOString(),
    })),
    pharmacyReferrals: pharmacyReferrals.map((r) => ({
      id: r.id,
      hospitalId: r.hospitalId,
      referralNumber: r.referralNumber,
      patientId: r.patientId,
      pharmacyAccountId: r.pharmacyAccountId,
      opVisitId: r.opVisitId,
      ipAdmissionId: r.ipAdmissionId,
      patientNameSnapshot: r.patientNameSnapshot,
      patientUhidSnapshot: r.patientUhidSnapshot,
      patientPhoneSnapshot: r.patientPhoneSnapshot,
      pharmacyNameSnapshot: r.pharmacyNameSnapshot,
      notes: r.notes,
      totalAmount: r.totalAmount,
      status: r.status,
      referredAt: r.referredAt.toISOString(),
      referredByUserId: r.referredByUserId,
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      completedByUserId: r.completedByUserId,
      completedByNameSnapshot: r.completedByNameSnapshot,
      cancelledAt: r.cancelledAt ? r.cancelledAt.toISOString() : null,
      cancelledByUserId: r.cancelledByUserId,
      createdAt: r.createdAt.toISOString(),
    })),
    pharmacyReferralItems: pharmacyReferralItems.map((i) => ({
      id: i.id,
      hospitalId: i.hospitalId,
      referralId: i.referralId,
      medicineCatalogId: i.medicineCatalogId,
      medicineNameSnapshot: i.medicineNameSnapshot,
      descriptionSnapshot: i.descriptionSnapshot,
      quantity: i.quantity,
      unitPriceSnapshot: i.unitPriceSnapshot,
      lineTotal: i.lineTotal,
      dosageInstructions: i.dosageInstructions,
    })),
    labTestCatalog: labTestCatalog.map((t) => ({
      id: t.id,
      hospitalId: t.hospitalId,
      name: t.name,
      description: t.description,
      price: t.price,
      isActive: t.isActive,
      createdAt: t.createdAt.toISOString(),
    })),
    labAccounts: labAccounts.map((l) => ({
      id: l.id,
      hospitalId: l.hospitalId,
      userId: l.userId,
      labName: l.labName,
      contactPerson: l.contactPerson,
      phone: l.phone,
      address: l.address,
      isActive: l.isActive,
      createdAt: l.createdAt.toISOString(),
    })),
    labReferrals: labReferrals.map((r) => ({
      id: r.id,
      hospitalId: r.hospitalId,
      referralNumber: r.referralNumber,
      patientId: r.patientId,
      labAccountId: r.labAccountId,
      opVisitId: r.opVisitId,
      ipAdmissionId: r.ipAdmissionId,
      patientNameSnapshot: r.patientNameSnapshot,
      patientUhidSnapshot: r.patientUhidSnapshot,
      patientPhoneSnapshot: r.patientPhoneSnapshot,
      labNameSnapshot: r.labNameSnapshot,
      notes: r.notes,
      totalAmount: r.totalAmount,
      status: r.status,
      referredAt: r.referredAt.toISOString(),
      referredByUserId: r.referredByUserId,
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      completedByUserId: r.completedByUserId,
      completedByNameSnapshot: r.completedByNameSnapshot,
      cancelledAt: r.cancelledAt ? r.cancelledAt.toISOString() : null,
      cancelledByUserId: r.cancelledByUserId,
      createdAt: r.createdAt.toISOString(),
    })),
    labReferralItems: labReferralItems.map((i) => ({
      id: i.id,
      hospitalId: i.hospitalId,
      referralId: i.referralId,
      labTestCatalogId: i.labTestCatalogId,
      testNameSnapshot: i.testNameSnapshot,
      descriptionSnapshot: i.descriptionSnapshot,
      unitPriceSnapshot: i.unitPriceSnapshot,
    })),
    auditLogs: auditLogs.map((a) => ({
      id: a.id,
      eventId: a.eventId,
      hospitalId: a.hospitalId,
      actorUserId: a.actorUserId,
      actorUsername: a.actorUsername,
      actorRole: a.actorRole,
      actionType: a.actionType,
      patientId: a.patientId,
      patientUhid: a.patientUhid,
      referenceId: a.referenceId,
      details: a.details,
      metadataJson: a.metadataJson,
      createdAt: a.createdAt.toISOString(),
    })),
    notifications: notifications.map((n) => ({
      id: n.id,
      hospitalId: n.hospitalId,
      targetRole: n.targetRole,
      title: n.title,
      message: n.message,
      category: n.category,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    })),
    hospitalPayments: hospitalPayments.map((p) => ({
      id: p.id,
      hospitalId: p.hospitalId,
      durationValue: p.durationValue,
      durationUnit: p.durationUnit,
      monthsAdded: p.monthsAdded,
      amountCollected: p.amountCollected,
      previousExpiresAt: p.previousExpiresAt
        ? p.previousExpiresAt.toISOString()
        : null,
      newExpiresAt: p.newExpiresAt.toISOString(),
      notes: p.notes,
      recordedByUserId: p.recordedByUserId,
      recordedByUsername: p.recordedByUsername,
      paidAt: p.paidAt.toISOString(),
      createdAt: p.createdAt.toISOString(),
    })),
    pharmacyMedicines: pharmacyMedicines.map((m) => ({
      id: m.id,
      hospitalId: m.hospitalId,
      name: m.name,
      packagingType: m.packagingType,
      unitsPerSheet: m.unitsPerSheet,
      minStock: m.minStock,
      unitSellingPrice: m.unitSellingPrice,
      sheetSellingPrice: m.sheetSellingPrice,
      hsnCode: m.hsnCode,
      gstPercent: m.gstPercent,
      prescriptionRequired: m.prescriptionRequired,
      placement: m.placement,
      createdAt: m.createdAt.toISOString(),
    })),
    pharmacyBatches: pharmacyBatches.map((b) => ({
      id: b.id,
      hospitalId: b.hospitalId,
      medicineId: b.medicineId,
      batchNumber: b.batchNumber,
      expiryMonth: b.expiryMonth,
      expiryYear: b.expiryYear,
      expiryDate: b.expiryDate,
      quantityUnits: b.quantityUnits,
      initialQuantityUnits: b.initialQuantityUnits,
      createdAt: b.createdAt.toISOString(),
    })),
    pharmacySales: pharmacySales.map((s) => ({
      id: s.id,
      hospitalId: s.hospitalId,
      saleNumber: s.saleNumber,
      patientName: s.patientName,
      patientPhone: s.patientPhone,
      doctorId: s.doctorId,
      doctorName: s.doctorName,
      doctorQualificationSnapshot: s.doctorQualificationSnapshot,
      subtotal: s.subtotal,
      gstAmount: s.gstAmount,
      totalAmount: s.totalAmount,
      totalUnitsSold: s.totalUnitsSold,
      paymentMode: s.paymentMode,
      soldByUserId: s.soldByUserId,
      soldByNameSnapshot: s.soldByNameSnapshot,
      soldAt: s.soldAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
    })),
    pharmacySaleItems: pharmacySaleItems.map((it) => ({
      id: it.id,
      hospitalId: it.hospitalId,
      saleId: it.saleId,
      medicineId: it.medicineId,
      batchId: it.batchId,
      medicineNameSnapshot: it.medicineNameSnapshot,
      batchNumberSnapshot: it.batchNumberSnapshot,
      expiryDateSnapshot: it.expiryDateSnapshot,
      hsnCodeSnapshot: it.hsnCodeSnapshot,
      placementSnapshot: it.placementSnapshot,
      prescriptionRequired: it.prescriptionRequired,
      sellMode: it.sellMode,
      enteredQuantity: it.enteredQuantity,
      unitsPerSheetSnapshot: it.unitsPerSheetSnapshot,
      basicUnitsDeducted: it.basicUnitsDeducted,
      unitPriceSnapshot: it.unitPriceSnapshot,
      gstPercentSnapshot: it.gstPercentSnapshot,
      subtotal: it.subtotal,
      gstAmount: it.gstAmount,
      lineTotal: it.lineTotal,
    })),
    pharmacyStockLogs: pharmacyStockLogs.map((l) => ({
      id: l.id,
      hospitalId: l.hospitalId,
      medicineId: l.medicineId,
      medicineNameSnapshot: l.medicineNameSnapshot,
      batchNumberSnapshot: l.batchNumberSnapshot,
      changeType: l.changeType,
      unitsDelta: l.unitsDelta,
      recordedByUserId: l.recordedByUserId,
      recordedByNameSnapshot: l.recordedByNameSnapshot,
      createdAt: l.createdAt.toISOString(),
    })),
    ipStayExtensions: ipStayExtensions.map((e) => ({
      id: e.id,
      hospitalId: e.hospitalId,
      ipAdmissionId: e.ipAdmissionId,
      additionalDays: e.additionalDays,
      amountCollected: e.amountCollected,
      paymentMode: e.paymentMode,
      reason: e.reason,
      previousCheckoutAt: e.previousCheckoutAt ? e.previousCheckoutAt.toISOString() : null,
      newCheckoutAt: e.newCheckoutAt.toISOString(),
      extendedByUserId: e.extendedByUserId,
      extendedByNameSnapshot: e.extendedByNameSnapshot,
      createdAt: e.createdAt.toISOString(),
    })),
    ...(maintenanceRow
      ? {
          maintenance: {
            isActive: maintenanceRow.isActive,
            reason: maintenanceRow.reason,
            startsAt: maintenanceRow.startsAt
              ? maintenanceRow.startsAt.toISOString()
              : null,
            endsAt: maintenanceRow.endsAt
              ? maintenanceRow.endsAt.toISOString()
              : null,
            activatedByUserId: maintenanceRow.activatedByUserId,
            activatedByUsername: maintenanceRow.activatedByUsername,
            activatedAt: maintenanceRow.activatedAt
              ? maintenanceRow.activatedAt.toISOString()
              : null,
            endedAt: maintenanceRow.endedAt
              ? maintenanceRow.endedAt.toISOString()
              : null,
          },
        }
      : {}),
  };

  const checksum = computeSha256(canonicalJson(rawData));
  const summary = {
    hospitals: rawData.hospitals.length,
    users: rawData.users.length,
    patients: rawData.patients.length,
    opVisits: rawData.opVisits.length,
    ipAdmissions: rawData.ipAdmissions.length,
    beds: rawData.beds.length,
    pharmacyReferrals: rawData.pharmacyReferrals.length,
    labReferrals: rawData.labReferrals.length,
    billingReceipts: rawData.billingReceipts.length,
    auditLogs: rawData.auditLogs.length,
  };

  await prisma.$transaction(async (tx) => {
    await tx.backupRecord.create({
      data: {
        hospitalId: params.hospitalId ?? null,
        operation: "EXPORT",
        scope,
        backupVersion: BACKUP_SCHEMA_VERSION,
        checksum,
        summaryJson: JSON.stringify(summary),
        performedByUserId: params.actor.id,
        performedByUsername: params.actor.username,
      },
    });
    await tx.auditLog.create({
      data: {
        eventId: generateAuditEventId(),
        hospitalId: params.hospitalId ?? null,
        actorUserId: params.actor.id,
        actorUsername: params.actor.username,
        actorRole: params.actor.role,
        actionType: "BACKUP_EXPORTED",
        referenceId: checksum.slice(0, 12).toUpperCase(),
        details: `${scope === "PLATFORM" ? "Platform-wide" : `Hospital (${hospitals[0]?.code})`} JSON backup exported (${summary.patients} patients, ${summary.opVisits} OP visits, ${summary.ipAdmissions} IP admissions).`,
        metadataJson: JSON.stringify(summary),
      },
    });
    if (params.hospitalId) {
      await pruneHospitalAuditLogs(params.hospitalId, tx);
    } else {
      await prunePlatformAuditLogs(tx);
    }
  });

  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    scope,
    exportedAt: new Date().toISOString(),
    exportedBy: {
      username: params.actor.username,
      fullName: params.actor.fullName,
    },
    checksum,
    data: rawData,
  };
}

export async function validateBackupPayload(rawInput: unknown) {
  const parsed = backupFileSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      valid: false,
      checksumValid: false,
      errors: parsed.error.issues.map(
        (i) => `${i.path.join(".") || "root"}: ${i.message}`
      ),
      warnings: [] as string[],
      summary: null,
      conflicts: null,
      parsedData: null,
    };
  }

  const file = parsed.data;
  // Re-verify checksum against raw input's data object using canonicalJson
  const rawObj = rawInput as { data?: unknown; checksum?: string };
  const computed = computeSha256(canonicalJson(rawObj.data));
  const checksumValid = computed === file.checksum;

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!checksumValid) {
    errors.push(
      "Backup checksum verification failed. The file may be corrupted or manually altered."
    );
  }

  const d = file.data;
  const hospitalIds = new Set(d.hospitals.map((h) => h.id));
  const doctorMap = new Map(d.doctors.map((doc) => [doc.id, doc]));
  const patientMap = new Map(d.patients.map((p) => [p.id, p]));
  const opVisitMap = new Map(d.opVisits.map((v) => [v.id, v]));
  const bedMap = new Map(d.beds.map((b) => [b.id, b]));
  const userMap = new Map(d.users.map((u) => [u.id, u]));
  const medCatalogMap = new Map(d.medicineCatalog.map((m) => [m.id, m]));
  const labCatalogMap = new Map(d.labTestCatalog.map((t) => [t.id, t]));
  const pharmAccMap = new Map(d.pharmacyAccounts.map((p) => [p.id, p]));
  const labAccMap = new Map(d.labAccounts.map((l) => [l.id, l]));
  const pharmRefMap = new Map(d.pharmacyReferrals.map((r) => [r.id, r]));
  const labRefMap = new Map(d.labReferrals.map((r) => [r.id, r]));
  const ipAdmMap = new Map(d.ipAdmissions.map((a) => [a.id, a]));

  if (file.scope === "HOSPITAL" && d.hospitals.length === 0) {
    errors.push("Backup contains no hospital records.");
  }

  for (const u of d.users) {
    if (u.role === ROLES.SUPER_ADMIN) {
      if (file.scope !== "PLATFORM") {
        errors.push(`Hospital backup cannot contain SUPER_ADMIN user "${u.username}".`);
      } else if (u.hospitalId !== null && u.hospitalId !== undefined) {
        errors.push(`SUPER_ADMIN user "${u.username}" must not be linked to a hospital.`);
      }
    } else if (!u.hospitalId || !hospitalIds.has(u.hospitalId)) {
      errors.push(`User ${u.username} references missing hospital ${u.hospitalId}.`);
    }
  }
  for (const doc of d.doctors) {
    if (!hospitalIds.has(doc.hospitalId)) {
      errors.push(`Doctor ${doc.name} references missing hospital ${doc.hospitalId}.`);
    }
  }
  for (const b of d.beds) {
    if (!hospitalIds.has(b.hospitalId)) {
      errors.push(`Bed ${b.bedNumber} references missing hospital ${b.hospitalId}.`);
    }
  }
  for (const m of d.medicineCatalog) {
    if (!hospitalIds.has(m.hospitalId)) {
      errors.push(`Medicine ${m.name} references missing hospital ${m.hospitalId}.`);
    }
  }
  for (const t of d.labTestCatalog) {
    if (!hospitalIds.has(t.hospitalId)) {
      errors.push(`Lab test ${t.name} references missing hospital ${t.hospitalId}.`);
    }
  }
  for (const n of d.notifications) {
    if (!hospitalIds.has(n.hospitalId)) {
      errors.push(`Notification ${n.id} references missing hospital ${n.hospitalId}.`);
    }
  }
  for (const p of d.patients) {
    if (!hospitalIds.has(p.hospitalId)) {
      errors.push(`Patient ${p.uhid} references missing hospital ${p.hospitalId}.`);
    }
  }
  for (const v of d.opVisits) {
    const pt = patientMap.get(v.patientId);
    if (!pt || pt.hospitalId !== v.hospitalId) {
      errors.push(`OP Visit ${v.visitNumber} references invalid patient ${v.patientId}.`);
    }
    if (v.doctorId) {
      const doc = doctorMap.get(v.doctorId);
      if (!doc || doc.hospitalId !== v.hospitalId) {
        errors.push(`OP Visit ${v.visitNumber} references invalid doctor ${v.doctorId}.`);
      }
    }
  }
  for (const r of d.billingReceipts) {
    const pt = patientMap.get(r.patientId);
    if (!pt || pt.hospitalId !== r.hospitalId) {
      errors.push(`Receipt ${r.receiptNumber} references invalid patient ${r.patientId}.`);
    }
    if (r.opVisitId) {
      const v = opVisitMap.get(r.opVisitId);
      if (!v || v.hospitalId !== r.hospitalId) {
        errors.push(`Receipt ${r.receiptNumber} references invalid OP visit ${r.opVisitId}.`);
      }
    }
    if (r.ipAdmissionId) {
      const a = ipAdmMap.get(r.ipAdmissionId);
      if (!a || a.hospitalId !== r.hospitalId) {
        errors.push(`Receipt ${r.receiptNumber} references invalid IP admission ${r.ipAdmissionId}.`);
      }
    }
  }
  for (const a of d.ipAdmissions) {
    const pt = patientMap.get(a.patientId);
    if (!pt || pt.hospitalId !== a.hospitalId) {
      errors.push(`IP Admission ${a.admissionNumber} references invalid patient ${a.patientId}.`);
    }
    if (a.bedId) {
      const b = bedMap.get(a.bedId);
      if (!b || b.hospitalId !== a.hospitalId) {
        errors.push(`IP Admission ${a.admissionNumber} references invalid bed ${a.bedId}.`);
      }
    }
    if (a.doctorId) {
      const doc = doctorMap.get(a.doctorId);
      if (!doc || doc.hospitalId !== a.hospitalId) {
        errors.push(`IP Admission ${a.admissionNumber} references invalid doctor ${a.doctorId}.`);
      }
    }
  }
  for (const t of d.bedTransfers) {
    const adm = ipAdmMap.get(t.ipAdmissionId);
    if (!adm || adm.hospitalId !== t.hospitalId) {
      errors.push(`Bed transfer ${t.id} references invalid admission ${t.ipAdmissionId}.`);
    }
  }
  for (const pa of d.pharmacyAccounts) {
    const linkedUser = userMap.get(pa.userId);
    if (
      !linkedUser ||
      !hospitalIds.has(pa.hospitalId) ||
      linkedUser.hospitalId !== pa.hospitalId ||
      linkedUser.role !== ROLES.PHARMACY_USER
    ) {
      errors.push(`Pharmacy account ${pa.pharmacyName} has broken user or hospital link.`);
    }
  }
  for (const la of d.labAccounts) {
    const linkedUser = userMap.get(la.userId);
    if (
      !linkedUser ||
      !hospitalIds.has(la.hospitalId) ||
      linkedUser.hospitalId !== la.hospitalId ||
      linkedUser.role !== ROLES.LAB_USER
    ) {
      errors.push(`Lab account ${la.labName} has broken user or hospital link.`);
    }
  }
  for (const pr of d.pharmacyReferrals) {
    const pt = patientMap.get(pr.patientId);
    const pa = pharmAccMap.get(pr.pharmacyAccountId);
    if (!pt || pt.hospitalId !== pr.hospitalId || !pa || pa.hospitalId !== pr.hospitalId) {
      errors.push(`Pharmacy referral ${pr.referralNumber} has broken patient/pharmacy relation.`);
    }
    if (pr.opVisitId) {
      const v = opVisitMap.get(pr.opVisitId);
      if (!v || v.hospitalId !== pr.hospitalId || v.patientId !== pr.patientId) {
        errors.push(`Pharmacy referral ${pr.referralNumber} references invalid OP visit.`);
      }
    }
    if (pr.ipAdmissionId) {
      const a = ipAdmMap.get(pr.ipAdmissionId);
      if (!a || a.hospitalId !== pr.hospitalId || a.patientId !== pr.patientId) {
        errors.push(`Pharmacy referral ${pr.referralNumber} references invalid IP admission.`);
      }
    }
  }
  for (const pri of d.pharmacyReferralItems) {
    const pr = pharmRefMap.get(pri.referralId);
    if (!pr || pr.hospitalId !== pri.hospitalId) {
      errors.push(`Pharmacy referral item ${pri.id} references missing referral.`);
    }
    if (pri.medicineCatalogId) {
      const med = medCatalogMap.get(pri.medicineCatalogId);
      if (!med || med.hospitalId !== pri.hospitalId) {
        errors.push(`Pharmacy referral item ${pri.id} references cross-tenant medicine.`);
      }
    }
  }
  for (const lr of d.labReferrals) {
    const pt = patientMap.get(lr.patientId);
    const la = labAccMap.get(lr.labAccountId);
    if (!pt || pt.hospitalId !== lr.hospitalId || !la || la.hospitalId !== lr.hospitalId) {
      errors.push(`Lab referral ${lr.referralNumber} has broken patient/lab relation.`);
    }
    if (lr.opVisitId) {
      const v = opVisitMap.get(lr.opVisitId);
      if (!v || v.hospitalId !== lr.hospitalId || v.patientId !== lr.patientId) {
        errors.push(`Lab referral ${lr.referralNumber} references invalid OP visit.`);
      }
    }
    if (lr.ipAdmissionId) {
      const a = ipAdmMap.get(lr.ipAdmissionId);
      if (!a || a.hospitalId !== lr.hospitalId || a.patientId !== lr.patientId) {
        errors.push(`Lab referral ${lr.referralNumber} references invalid IP admission.`);
      }
    }
  }
  for (const lri of d.labReferralItems) {
    const lr = labRefMap.get(lri.referralId);
    if (!lr || lr.hospitalId !== lri.hospitalId) {
      errors.push(`Lab referral item ${lri.id} references missing referral.`);
    }
    if (lri.labTestCatalogId) {
      const tst = labCatalogMap.get(lri.labTestCatalogId);
      if (!tst || tst.hospitalId !== lri.hospitalId) {
        errors.push(`Lab referral item ${lri.id} references cross-tenant lab test.`);
      }
    }
  }

  // Check database conflicts
  const existingHospitals = await prisma.hospital.findMany({
    where: {
      OR: [
        { id: { in: d.hospitals.map((h) => h.id) } },
        { code: { in: d.hospitals.map((h) => h.code) } },
        { slug: { in: d.hospitals.map((h) => h.slug) } },
      ],
    },
    select: { id: true, code: true, name: true, slug: true },
  });

  const existingUsers = await prisma.user.findMany({
    where: {
      username: { in: d.users.map((u) => u.username) },
    },
    select: { id: true, username: true, hospitalId: true, role: true },
  });

  if (existingHospitals.length > 0) {
    warnings.push(
      `Matching hospital identifier(s) found in database (${existingHospitals.map((h) => h.code).join(", ")}). Choose "Restore Existing Hospital" to update/replace in place, or "Import as New Hospital" to create an isolated copy.`
    );
  }
  if (existingUsers.length > 0) {
    warnings.push(
      `${existingUsers.length} username(s) already exist in the system. Importing as a new hospital will require a unique username prefix.`
    );
  }

  return {
    valid: errors.length === 0,
    checksumValid,
    errors,
    warnings,
    summary: {
      scope: file.scope,
      schemaVersion: file.schemaVersion,
      exportedAt: file.exportedAt,
      exportedBy: file.exportedBy,
      includesCredentialHashes: d.users.some((u) => Boolean(u.passwordHash)),
      hasSuperAdmin: d.users.some((u) => u.role === ROLES.SUPER_ADMIN),
      maintenance: d.maintenance
        ? {
            isActive: d.maintenance.isActive,
            reason: d.maintenance.reason ?? null,
            endsAt: d.maintenance.endsAt ? d.maintenance.endsAt.toISOString() : null,
          }
        : null,
      hospitals: d.hospitals.map((h) => ({
        id: h.id,
        code: h.code,
        name: h.name,
        patients: d.patients.filter((p) => p.hospitalId === h.id).length,
        opVisits: d.opVisits.filter((v) => v.hospitalId === h.id).length,
        ipAdmissions: d.ipAdmissions.filter((a) => a.hospitalId === h.id).length,
        pharmacyReferrals: d.pharmacyReferrals.filter((r) => r.hospitalId === h.id).length,
        labReferrals: d.labReferrals.filter((r) => r.hospitalId === h.id).length,
      })),
      totals: {
        hospitals: d.hospitals.length,
        users: d.users.length,
        patients: d.patients.length,
        opVisits: d.opVisits.length,
        ipAdmissions: d.ipAdmissions.length,
        beds: d.beds.length,
        pharmacyReferrals: d.pharmacyReferrals.length,
        labReferrals: d.labReferrals.length,
        billingReceipts: d.billingReceipts.length,
        auditLogs: d.auditLogs.length,
      },
    },
    conflicts: {
      existingHospitals,
      existingUsers,
    },
    parsedData: errors.length === 0 ? file : null,
  };
}

export async function restoreBackupPayload(params: {
  rawInput: unknown;
  mode: "RESTORE_PLATFORM" | "RESTORE_EXISTING" | "IMPORT_NEW";
  sourceHospitalId?: string;
  targetHospitalId?: string;
  newHospitalName?: string;
  newHospitalCode?: string;
  usernamePrefix?: string;
  confirmOverwrite?: boolean;
  actor: { id: string; username: string; fullName: string; role: string };
}) {
  const validation = await validateBackupPayload(params.rawInput);
  if (!validation.valid || !validation.parsedData) {
    throw new ApiError(
      400,
      validation.errors[0] ?? "Backup file failed validation.",
      "INVALID_BACKUP",
      validation.errors
    );
  }

  const file = validation.parsedData;
  const d = file.data;

  const generatedCredentials: Array<{
    username: string;
    role: string;
    temporaryPassword: string;
  }> = [];

  if (params.mode === "RESTORE_PLATFORM") {
    if (!params.confirmOverwrite) {
      throw new ApiError(
        400,
        "Explicit overwrite confirmation is required before replacing the entire platform database.",
        "CONFIRMATION_REQUIRED"
      );
    }

    const currentActorDb = await prisma.user.findUnique({
      where: { id: params.actor.id },
      select: {
        id: true,
        hospitalId: true,
        username: true,
        fullName: true,
        email: true,
        phone: true,
        passwordHash: true,
        role: true,
        isActive: true,
        passwordChangedAt: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    const existingUsersAll = await prisma.user.findMany({
      select: { username: true, passwordHash: true },
    });
    const existingHashByUsername = new Map(
      existingUsersAll.map((u) => [u.username, u.passwordHash])
    );

    const backupUsersToCreate: Array<{
      id: string;
      hospitalId: string | null;
      username: string;
      fullName: string;
      email: string | null;
      phone: string | null;
      passwordHash: string;
      role: string;
      isActive: boolean;
      passwordChangedAt: Date | null;
      lastLoginAt: Date | null;
      createdAt: Date;
    }> = [];

    for (const u of d.users) {
      let hash = u.passwordHash ?? existingHashByUsername.get(u.username);
      if (!hash) {
        const tempPw = generateTempPassword(12);
        hash = await hashPassword(tempPw);
        generatedCredentials.push({
          username: u.username,
          role: u.role,
          temporaryPassword: tempPw,
        });
      }
      backupUsersToCreate.push({
        id: u.id,
        hospitalId: u.role === ROLES.SUPER_ADMIN ? null : (u.hospitalId ?? null),
        username: u.username,
        fullName: u.fullName,
        email: u.email ?? null,
        phone: u.phone ?? null,
        passwordHash: hash,
        role: u.role,
        isActive: u.isActive,
        passwordChangedAt: u.passwordChangedAt ?? null,
        lastLoginAt: u.lastLoginAt ?? null,
        createdAt: u.createdAt,
      });
    }

    // Legacy 1.0.0 backups excluded SUPER_ADMIN from `users`; preserve current Super Admin so the platform is never locked out
    const hasSuperAdminInBackup = backupUsersToCreate.some(
      (u) => u.role === ROLES.SUPER_ADMIN
    );
    if (!hasSuperAdminInBackup && currentActorDb) {
      const fallbackUsername = backupUsersToCreate.some(
        (u) => u.username === currentActorDb.username
      )
        ? `sa_${currentActorDb.username}`
        : currentActorDb.username;
      backupUsersToCreate.push({
        id: currentActorDb.id,
        hospitalId: null,
        username: fallbackUsername,
        fullName: currentActorDb.fullName,
        email: currentActorDb.email,
        phone: currentActorDb.phone,
        passwordHash: currentActorDb.passwordHash,
        role: ROLES.SUPER_ADMIN,
        isActive: true,
        passwordChangedAt: currentActorDb.passwordChangedAt,
        lastLoginAt: currentActorDb.lastLoginAt,
        createdAt: currentActorDb.createdAt,
      });
    }

    if (!backupUsersToCreate.some((u) => u.role === ROLES.SUPER_ADMIN && u.isActive)) {
      throw new ApiError(
        400,
        "Cannot restore platform backup without an active Super Admin account.",
        "SUPER_ADMIN_MISSING"
      );
    }

    const restoredMatchingActor = backupUsersToCreate.find(
      (u) =>
        u.role === ROLES.SUPER_ADMIN &&
        u.isActive &&
        (currentActorDb
          ? u.id === currentActorDb.id || u.username === currentActorDb.username
          : false)
    );
    const actorCredentialsUnchanged = Boolean(
      currentActorDb &&
        restoredMatchingActor &&
        restoredMatchingActor.id === currentActorDb.id &&
        restoredMatchingActor.username === currentActorDb.username &&
        restoredMatchingActor.passwordHash === currentActorDb.passwordHash
    );

    const hospitalsToCreate = d.hospitals.map((h) => ({
      id: h.id,
      code: h.code,
      name: h.name,
      slug: h.slug,
      address: h.address ?? null,
      phone: h.phone ?? null,
      email: h.email ?? null,
      logoDataUrl: h.logoDataUrl ?? null,
      tagline: h.tagline ?? null,
      registrationNo: h.registrationNo ?? null,
      defaultConsultationFee: h.defaultConsultationFee ?? null,
      dailyOpLimit: h.dailyOpLimit ?? null,
      dailyIpLimit: h.dailyIpLimit ?? null,
      subscriptionMonthsPaid: h.subscriptionMonthsPaid ?? 0,
      subscriptionExpiresAt: h.subscriptionExpiresAt ?? null,
      subscriptionTotalPaid: h.subscriptionTotalPaid ?? 0,
      pharmacyMode: h.pharmacyMode ?? "REFERRALS",
      consultancyEnabled: h.consultancyEnabled ?? true,
      uhidPrefix: h.uhidPrefix,
      nextUhidSeq: h.nextUhidSeq,
      nextOpSeq: h.nextOpSeq,
      nextIpSeq: h.nextIpSeq,
      nextPharmRefSeq: h.nextPharmRefSeq,
      nextPharmSaleSeq: h.nextPharmSaleSeq ?? 1,
      nextLabRefSeq: h.nextLabRefSeq,
      nextReceiptSeq: h.nextReceiptSeq,
      isActive: h.isActive,
      deactivatedAt: h.deactivatedAt ?? null,
      createdAt: h.createdAt,
    }));

    await prisma.$transaction(
      async (tx) => {
        // Complete database wipe in strict reverse-dependency order
        await tx.session.deleteMany({});
        await tx.pharmacyBillScanSession.deleteMany({});
        await tx.pharmacyBillScanQuota.deleteMany({});
        await tx.pharmacySaleItem.deleteMany({});
        await tx.pharmacySale.deleteMany({});
        await tx.pharmacyBatch.deleteMany({});
        await tx.pharmacyStockLog.deleteMany({});
        await tx.pharmacyMedicine.deleteMany({});
        await tx.pharmacyReferralItem.deleteMany({});
        await tx.labReferralItem.deleteMany({});
        await tx.pharmacyReferral.deleteMany({});
        await tx.labReferral.deleteMany({});
        await tx.billingReceipt.deleteMany({});
        await tx.ipStayExtension.deleteMany({});
        await tx.bedTransfer.deleteMany({});
        await tx.ipAdmission.deleteMany({});
        await tx.opVisit.deleteMany({});
        await tx.patient.deleteMany({});
        await tx.bed.deleteMany({});
        await tx.medicineCatalog.deleteMany({});
        await tx.labTestCatalog.deleteMany({});
        await tx.pharmacyAccount.deleteMany({});
        await tx.labAccount.deleteMany({});
        await tx.doctor.deleteMany({});
        await tx.notification.deleteMany({});
        await tx.hospitalPayment.deleteMany({});
        await tx.auditLog.deleteMany({});
        await tx.systemMaintenance.deleteMany({});
        await tx.backupRecord.deleteMany({});
        await tx.user.deleteMany({});
        await tx.hospital.deleteMany({});

        // Restore exact snapshot state from top of dependency tree down
        if (hospitalsToCreate.length) {
          await createManyChunked(
            (chunk) => tx.hospital.createMany({ data: chunk }),
            hospitalsToCreate
          );
        }
        if (backupUsersToCreate.length) {
          await createManyChunked(
            (chunk) => tx.user.createMany({ data: chunk }),
            backupUsersToCreate
          );
        }
        if (d.doctors.length) {
          await createManyChunked(
            (chunk) => tx.doctor.createMany({ data: chunk }),
            d.doctors.map((x) => ({
              id: x.id,
              hospitalId: x.hospitalId,
              userId: x.userId ?? null,
              name: x.name,
              specialty: x.specialty ?? null,
              qualification: x.qualification ?? null,
              phone: x.phone ?? null,
              consultationFee: x.consultationFee ?? null,
              signatureDataUrl: x.signatureDataUrl ?? null,
              isActive: x.isActive,
              createdAt: x.createdAt,
            }))
          );
        }
        if (d.beds.length) {
          await createManyChunked(
            (chunk) => tx.bed.createMany({ data: chunk }),
            d.beds.map((x) => ({
              id: x.id,
              hospitalId: x.hospitalId,
              bedNumber: x.bedNumber,
              ward: x.ward,
              category: x.category ?? null,
              status: x.status,
              notes: x.notes ?? null,
              createdAt: x.createdAt,
            }))
          );
        }
        if (d.medicineCatalog.length) {
          await createManyChunked(
            (chunk) => tx.medicineCatalog.createMany({ data: chunk }),
            d.medicineCatalog.map((x) => ({
              id: x.id,
              hospitalId: x.hospitalId,
              name: x.name,
              description: x.description ?? null,
              price: x.price ?? null,
              isActive: x.isActive,
              createdAt: x.createdAt,
            }))
          );
        }
        if (d.labTestCatalog.length) {
          await createManyChunked(
            (chunk) => tx.labTestCatalog.createMany({ data: chunk }),
            d.labTestCatalog.map((x) => ({
              id: x.id,
              hospitalId: x.hospitalId,
              name: x.name,
              description: x.description ?? null,
              price: x.price ?? null,
              isActive: x.isActive,
              createdAt: x.createdAt,
            }))
          );
        }
        if (d.pharmacyAccounts.length) {
          await createManyChunked(
            (chunk) => tx.pharmacyAccount.createMany({ data: chunk }),
            d.pharmacyAccounts.map((x) => ({
              id: x.id,
              hospitalId: x.hospitalId,
              userId: x.userId,
              pharmacyName: x.pharmacyName,
              contactPerson: x.contactPerson,
              phone: x.phone,
              address: x.address ?? null,
              isActive: x.isActive,
              createdAt: x.createdAt,
            }))
          );
        }
        if (d.labAccounts.length) {
          await createManyChunked(
            (chunk) => tx.labAccount.createMany({ data: chunk }),
            d.labAccounts.map((x) => ({
              id: x.id,
              hospitalId: x.hospitalId,
              userId: x.userId,
              labName: x.labName,
              contactPerson: x.contactPerson,
              phone: x.phone,
              address: x.address ?? null,
              isActive: x.isActive,
              createdAt: x.createdAt,
            }))
          );
        }
        if (d.patients.length) {
          await createManyChunked(
            (chunk) => tx.patient.createMany({ data: chunk }),
            d.patients.map((x) => ({
              id: x.id,
              hospitalId: x.hospitalId,
              uhid: x.uhid,
              fullName: x.fullName,
              age: x.age ?? null,
              dateOfBirth: x.dateOfBirth,
              gender: x.gender,
              phone: x.phone,
              address: x.address ?? null,
              bloodGroup: x.bloodGroup ?? null,
              emergencyContact: x.emergencyContact ?? null,
              registeredAt: x.registeredAt,
              createdByUserId: x.createdByUserId ?? null,
              createdAt: x.createdAt,
            }))
          );
        }
        if (d.opVisits.length) {
          await createManyChunked(
            (chunk) => tx.opVisit.createMany({ data: chunk }),
            d.opVisits.map((x) => ({
              id: x.id,
              hospitalId: x.hospitalId,
              visitNumber: x.visitNumber,
              patientId: x.patientId,
              doctorId: x.doctorId ?? null,
              doctorNameSnapshot: x.doctorNameSnapshot,
              departmentSnapshot: x.departmentSnapshot ?? null,
              visitDate: x.visitDate,
              reasonForVisit: x.reasonForVisit ?? null,
              notes: x.notes ?? null,
              consultationFee: x.consultationFee ?? null,
              registrationFee: x.registrationFee ?? null,
              totalAmount: x.totalAmount ?? null,
              paymentMode: x.paymentMode ?? null,
              paymentStatus: x.paymentStatus ?? null,
              createdByUserId: x.createdByUserId ?? null,
              createdAt: x.createdAt,
            }))
          );
        }
        if (d.ipAdmissions.length) {
          await createManyChunked(
            (chunk) => tx.ipAdmission.createMany({ data: chunk }),
            d.ipAdmissions.map((x) => ({
              id: x.id,
              hospitalId: x.hospitalId,
              admissionNumber: x.admissionNumber,
              patientId: x.patientId,
              bedId: x.bedId ?? null,
              doctorId: x.doctorId ?? null,
              doctorNameSnapshot: x.doctorNameSnapshot,
              wardSnapshot: x.wardSnapshot,
              bedNumberSnapshot: x.bedNumberSnapshot,
              admittedAt: x.admittedAt,
              dischargedAt: x.dischargedAt,
              status: x.status,
              chargeAmount: x.chargeAmount ?? null,
              paymentMode: x.paymentMode ?? "CASH",
              stayDays: x.stayDays ?? 1,
              expectedCheckoutAt: x.expectedCheckoutAt ?? null,
              admissionNotes: x.admissionNotes ?? null,
              dischargeNotes: x.dischargeNotes ?? null,
              admittedByUserId: x.admittedByUserId ?? null,
              dischargedByUserId: x.dischargedByUserId ?? null,
              createdAt: x.createdAt,
            }))
          );
        }
        if (d.bedTransfers.length) {
          await createManyChunked(
            (chunk) => tx.bedTransfer.createMany({ data: chunk }),
            d.bedTransfers.map((x) => ({
              id: x.id,
              hospitalId: x.hospitalId,
              ipAdmissionId: x.ipAdmissionId,
              fromBedId: x.fromBedId ?? null,
              fromBedLabel: x.fromBedLabel ?? null,
              toBedId: x.toBedId,
              toBedLabel: x.toBedLabel,
              reason: x.reason ?? null,
              transferredAt: x.transferredAt,
              transferredByUserId: x.transferredByUserId ?? null,
            }))
          );
        }
        if (d.billingReceipts.length) {
          await createManyChunked(
            (chunk) => tx.billingReceipt.createMany({ data: chunk }),
            d.billingReceipts.map((x) => ({
              id: x.id,
              hospitalId: x.hospitalId,
              receiptNumber: x.receiptNumber,
              patientId: x.patientId,
              opVisitId: x.opVisitId ?? null,
              ipAdmissionId: x.ipAdmissionId ?? null,
              hospitalNameSnapshot: x.hospitalNameSnapshot,
              hospitalAddressSnapshot: x.hospitalAddressSnapshot ?? null,
              hospitalPhoneSnapshot: x.hospitalPhoneSnapshot ?? null,
              hospitalEmailSnapshot: x.hospitalEmailSnapshot ?? null,
              hospitalLogoSnapshot: x.hospitalLogoSnapshot ?? null,
              patientUhidSnapshot: x.patientUhidSnapshot,
              patientNameSnapshot: x.patientNameSnapshot,
              visitSummarySnapshot: x.visitSummarySnapshot,
              lineItemsJson: x.lineItemsJson,
              totalAmount: x.totalAmount ?? null,
              paymentMode: x.paymentMode ?? null,
              paymentStatus: x.paymentStatus ?? null,
              issuedAt: x.issuedAt,
              issuedByUserId: x.issuedByUserId ?? null,
              issuedByNameSnapshot: x.issuedByNameSnapshot,
            }))
          );
        }
        if (d.pharmacyReferrals.length) {
          await createManyChunked(
            (chunk) => tx.pharmacyReferral.createMany({ data: chunk }),
            d.pharmacyReferrals.map((x) => ({
              id: x.id,
              hospitalId: x.hospitalId,
              referralNumber: x.referralNumber,
              patientId: x.patientId,
              pharmacyAccountId: x.pharmacyAccountId,
              opVisitId: x.opVisitId ?? null,
              ipAdmissionId: x.ipAdmissionId ?? null,
              patientNameSnapshot: x.patientNameSnapshot,
              patientUhidSnapshot: x.patientUhidSnapshot,
              patientPhoneSnapshot: x.patientPhoneSnapshot ?? null,
              pharmacyNameSnapshot: x.pharmacyNameSnapshot,
              notes: x.notes ?? null,
              totalAmount: x.totalAmount ?? null,
              status: x.status,
              referredAt: x.referredAt,
              referredByUserId: x.referredByUserId,
              completedAt: x.completedAt,
              completedByUserId: x.completedByUserId ?? null,
              completedByNameSnapshot: x.completedByNameSnapshot ?? null,
              cancelledAt: x.cancelledAt,
              cancelledByUserId: x.cancelledByUserId ?? null,
              createdAt: x.createdAt,
            }))
          );
        }
        if (d.pharmacyReferralItems.length) {
          await createManyChunked(
            (chunk) => tx.pharmacyReferralItem.createMany({ data: chunk }),
            d.pharmacyReferralItems.map((x) => ({
              id: x.id,
              hospitalId: x.hospitalId,
              referralId: x.referralId,
              medicineCatalogId: x.medicineCatalogId ?? null,
              medicineNameSnapshot: x.medicineNameSnapshot,
              descriptionSnapshot: x.descriptionSnapshot ?? null,
              quantity: x.quantity,
              unitPriceSnapshot: x.unitPriceSnapshot ?? null,
              lineTotal: x.lineTotal ?? null,
              dosageInstructions: x.dosageInstructions ?? null,
            }))
          );
        }
        if (d.labReferrals.length) {
          await createManyChunked(
            (chunk) => tx.labReferral.createMany({ data: chunk }),
            d.labReferrals.map((x) => ({
              id: x.id,
              hospitalId: x.hospitalId,
              referralNumber: x.referralNumber,
              patientId: x.patientId,
              labAccountId: x.labAccountId,
              opVisitId: x.opVisitId ?? null,
              ipAdmissionId: x.ipAdmissionId ?? null,
              patientNameSnapshot: x.patientNameSnapshot,
              patientUhidSnapshot: x.patientUhidSnapshot,
              patientPhoneSnapshot: x.patientPhoneSnapshot ?? null,
              labNameSnapshot: x.labNameSnapshot,
              notes: x.notes ?? null,
              totalAmount: x.totalAmount ?? null,
              status: x.status,
              referredAt: x.referredAt,
              referredByUserId: x.referredByUserId,
              completedAt: x.completedAt,
              completedByUserId: x.completedByUserId ?? null,
              completedByNameSnapshot: x.completedByNameSnapshot ?? null,
              cancelledAt: x.cancelledAt,
              cancelledByUserId: x.cancelledByUserId ?? null,
              createdAt: x.createdAt,
            }))
          );
        }
        if (d.labReferralItems.length) {
          await createManyChunked(
            (chunk) => tx.labReferralItem.createMany({ data: chunk }),
            d.labReferralItems.map((x) => ({
              id: x.id,
              hospitalId: x.hospitalId,
              referralId: x.referralId,
              labTestCatalogId: x.labTestCatalogId ?? null,
              testNameSnapshot: x.testNameSnapshot,
              descriptionSnapshot: x.descriptionSnapshot ?? null,
              unitPriceSnapshot: x.unitPriceSnapshot ?? null,
            }))
          );
        }
        if (d.auditLogs.length) {
          await createManyChunked(
            (chunk) => tx.auditLog.createMany({ data: chunk }),
            d.auditLogs.map((x) => ({
              id: x.id,
              eventId: x.eventId,
              hospitalId: x.hospitalId ?? null,
              actorUserId: x.actorUserId ?? null,
              actorUsername: x.actorUsername,
              actorRole: x.actorRole,
              actionType: x.actionType,
              patientId: x.patientId ?? null,
              patientUhid: x.patientUhid ?? null,
              referenceId: x.referenceId ?? null,
              details: x.details,
              metadataJson: x.metadataJson ?? null,
              createdAt: x.createdAt,
            }))
          );
        }
        if (d.notifications.length) {
          await createManyChunked(
            (chunk) => tx.notification.createMany({ data: chunk }),
            d.notifications.map((x) => ({
              id: x.id,
              hospitalId: x.hospitalId,
              targetRole: x.targetRole,
              title: x.title,
              message: x.message,
              category: x.category,
              isRead: x.isRead,
              createdAt: x.createdAt,
            }))
          );
        }
        if (d.hospitalPayments?.length) {
          await createManyChunked(
            (chunk) => tx.hospitalPayment.createMany({ data: chunk }),
            d.hospitalPayments.map((x) => ({
              id: x.id,
              hospitalId: x.hospitalId,
              durationValue: x.durationValue,
              durationUnit: x.durationUnit,
              monthsAdded: x.monthsAdded,
              amountCollected: x.amountCollected,
              previousExpiresAt: x.previousExpiresAt ?? null,
              newExpiresAt: x.newExpiresAt,
              notes: x.notes ?? null,
              recordedByUserId: x.recordedByUserId ?? null,
              recordedByUsername: x.recordedByUsername,
              paidAt: x.paidAt,
              createdAt: x.createdAt,
            }))
          );
        }
        if (d.pharmacyMedicines?.length) {
          await createManyChunked(
            (chunk) => tx.pharmacyMedicine.createMany({ data: chunk }),
            d.pharmacyMedicines.map((x) => ({
              id: x.id,
              hospitalId: x.hospitalId,
              name: x.name,
              packagingType: x.packagingType,
              unitsPerSheet: x.unitsPerSheet,
              minStock: x.minStock,
              unitSellingPrice: x.unitSellingPrice,
              sheetSellingPrice: x.sheetSellingPrice,
              hsnCode: x.hsnCode ?? null,
              gstPercent: x.gstPercent,
              prescriptionRequired: x.prescriptionRequired,
              placement: x.placement ?? null,
              createdAt: x.createdAt,
            }))
          );
        }
        if (d.pharmacyBatches?.length) {
          await createManyChunked(
            (chunk) => tx.pharmacyBatch.createMany({ data: chunk }),
            d.pharmacyBatches.map((x) => ({
              id: x.id,
              hospitalId: x.hospitalId,
              medicineId: x.medicineId,
              batchNumber: x.batchNumber,
              expiryMonth: x.expiryMonth,
              expiryYear: x.expiryYear,
              expiryDate: x.expiryDate,
              quantityUnits: x.quantityUnits,
              initialQuantityUnits: x.initialQuantityUnits,
              createdAt: x.createdAt,
            }))
          );
        }
        if (d.pharmacySales?.length) {
          await createManyChunked(
            (chunk) => tx.pharmacySale.createMany({ data: chunk }),
            d.pharmacySales.map((x) => ({
              id: x.id,
              hospitalId: x.hospitalId,
              saleNumber: x.saleNumber,
              patientName: x.patientName,
              patientPhone: x.patientPhone,
              doctorId: x.doctorId ?? null,
              doctorName: x.doctorName,
              doctorQualificationSnapshot: x.doctorQualificationSnapshot ?? null,
              subtotal: x.subtotal,
              gstAmount: x.gstAmount,
              totalAmount: x.totalAmount,
              totalUnitsSold: x.totalUnitsSold,
              paymentMode: x.paymentMode,
              soldByUserId: x.soldByUserId ?? null,
              soldByNameSnapshot: x.soldByNameSnapshot,
              soldAt: x.soldAt,
              createdAt: x.createdAt,
            }))
          );
        }
        if (d.pharmacySaleItems?.length) {
          await createManyChunked(
            (chunk) => tx.pharmacySaleItem.createMany({ data: chunk }),
            d.pharmacySaleItems.map((x) => ({
              id: x.id,
              hospitalId: x.hospitalId,
              saleId: x.saleId,
              medicineId: x.medicineId ?? null,
              batchId: x.batchId ?? null,
              medicineNameSnapshot: x.medicineNameSnapshot,
              batchNumberSnapshot: x.batchNumberSnapshot,
              expiryDateSnapshot: x.expiryDateSnapshot,
              hsnCodeSnapshot: x.hsnCodeSnapshot ?? null,
              placementSnapshot: x.placementSnapshot ?? null,
              prescriptionRequired: x.prescriptionRequired,
              sellMode: x.sellMode,
              enteredQuantity: x.enteredQuantity,
              unitsPerSheetSnapshot: x.unitsPerSheetSnapshot,
              basicUnitsDeducted: x.basicUnitsDeducted,
              unitPriceSnapshot: x.unitPriceSnapshot,
              gstPercentSnapshot: x.gstPercentSnapshot,
              subtotal: x.subtotal,
              gstAmount: x.gstAmount,
              lineTotal: x.lineTotal,
            }))
          );
        }
        if (d.pharmacyStockLogs?.length) {
          await createManyChunked(
            (chunk) => tx.pharmacyStockLog.createMany({ data: chunk }),
            d.pharmacyStockLogs.map((x) => ({
              id: x.id,
              hospitalId: x.hospitalId,
              medicineId: x.medicineId ?? null,
              medicineNameSnapshot: x.medicineNameSnapshot,
              batchNumberSnapshot: x.batchNumberSnapshot,
              changeType: x.changeType,
              unitsDelta: x.unitsDelta,
              recordedByUserId: x.recordedByUserId ?? null,
              recordedByNameSnapshot: x.recordedByNameSnapshot,
              createdAt: x.createdAt,
            }))
          );
        }
        if (d.ipStayExtensions?.length) {
          await createManyChunked(
            (chunk) => tx.ipStayExtension.createMany({ data: chunk }),
            d.ipStayExtensions.map((x) => ({
              id: x.id,
              hospitalId: x.hospitalId,
              ipAdmissionId: x.ipAdmissionId,
              additionalDays: x.additionalDays,
              amountCollected: x.amountCollected,
              paymentMode: x.paymentMode,
              reason: x.reason,
              previousCheckoutAt: x.previousCheckoutAt ?? null,
              newCheckoutAt: x.newCheckoutAt,
              extendedByUserId: x.extendedByUserId ?? null,
              extendedByNameSnapshot: x.extendedByNameSnapshot,
              createdAt: x.createdAt,
            }))
          );
        }
        if (d.maintenance) {
          await tx.systemMaintenance.create({
            data: {
              id: "singleton",
              isActive: d.maintenance.isActive,
              reason: d.maintenance.reason ?? null,
              startsAt: d.maintenance.startsAt ?? null,
              endsAt: d.maintenance.endsAt ?? null,
              activatedByUserId: d.maintenance.activatedByUserId ?? null,
              activatedByUsername: d.maintenance.activatedByUsername ?? null,
              activatedAt: d.maintenance.activatedAt ?? null,
              endedAt: d.maintenance.endedAt ?? null,
            },
          });
        }

        const actorIdAfterRestore = restoredMatchingActor?.id ?? params.actor.id;
        const actorUsernameAfterRestore =
          restoredMatchingActor?.username ?? params.actor.username;

        await tx.backupRecord.create({
          data: {
            hospitalId: null,
            operation: "RESTORE_PLATFORM",
            scope: file.scope,
            backupVersion: file.schemaVersion,
            checksum: file.checksum,
            summaryJson: JSON.stringify(validation.summary?.totals ?? {}),
            performedByUserId: actorIdAfterRestore,
            performedByUsername: actorUsernameAfterRestore,
          },
        });

        await tx.auditLog.create({
          data: {
            eventId: generateAuditEventId(),
            hospitalId: null,
            actorUserId: actorIdAfterRestore,
            actorUsername: actorUsernameAfterRestore,
            actorRole: ROLES.SUPER_ADMIN,
            actionType: "BACKUP_RESTORED",
            referenceId: file.checksum.slice(0, 12).toUpperCase(),
            details: `Full platform database replaced from backup snapshot (${hospitalsToCreate.length} hospitals, ${backupUsersToCreate.length} users, ${d.patients.length} patients, ${d.opVisits.length} OP visits, ${d.ipAdmissions.length} IP admissions).`,
          },
        });
        await prunePlatformAuditLogs(tx);
      },
      { timeout: 120_000, maxWait: 15_000 }
    );

    return {
      mode: "RESTORE_PLATFORM" as const,
      hospitalId: null,
      hospitalCode: "PLATFORM",
      hospitalName: "Full Platform Snapshot",
      actorCredentialsUnchanged,
      restoredSuperAdminId: restoredMatchingActor?.id ?? null,
      restoredCounts: {
        hospitals: hospitalsToCreate.length,
        users: backupUsersToCreate.length,
        patients: d.patients.length,
        opVisits: d.opVisits.length,
        ipAdmissions: d.ipAdmissions.length,
        pharmacyReferrals: d.pharmacyReferrals.length,
        labReferrals: d.labReferrals.length,
      },
      generatedCredentials,
    };
  }

  const sourceHospital = params.sourceHospitalId
    ? d.hospitals.find((h) => h.id === params.sourceHospitalId)
    : undefined;
  if (!sourceHospital) {
    throw new ApiError(
      400,
      "Selected source hospital was not found in this backup file.",
      "SOURCE_HOSPITAL_MISSING"
    );
  }

  // Filter tenant records for the selected hospital (explicitly excluding any SUPER_ADMIN role)
  const srcUsers = d.users.filter(
    (u) => u.hospitalId === sourceHospital.id && u.role !== ROLES.SUPER_ADMIN
  );
  const srcDoctors = d.doctors.filter((x) => x.hospitalId === sourceHospital.id);
  const srcPatients = d.patients.filter((x) => x.hospitalId === sourceHospital.id);
  const srcOpVisits = d.opVisits.filter((x) => x.hospitalId === sourceHospital.id);
  const srcReceipts = d.billingReceipts.filter((x) => x.hospitalId === sourceHospital.id);
  const srcBeds = d.beds.filter((x) => x.hospitalId === sourceHospital.id);
  const srcAdmissions = d.ipAdmissions.filter((x) => x.hospitalId === sourceHospital.id);
  const srcTransfers = d.bedTransfers.filter((x) => x.hospitalId === sourceHospital.id);
  const srcMeds = d.medicineCatalog.filter((x) => x.hospitalId === sourceHospital.id);
  const srcPharmAccounts = d.pharmacyAccounts.filter((x) => x.hospitalId === sourceHospital.id);
  const srcPharmRefs = d.pharmacyReferrals.filter((x) => x.hospitalId === sourceHospital.id);
  const srcPharmItems = d.pharmacyReferralItems.filter((x) => x.hospitalId === sourceHospital.id);
  const srcTests = d.labTestCatalog.filter((x) => x.hospitalId === sourceHospital.id);
  const srcLabAccounts = d.labAccounts.filter((x) => x.hospitalId === sourceHospital.id);
  const srcLabRefs = d.labReferrals.filter((x) => x.hospitalId === sourceHospital.id);
  const srcLabItems = d.labReferralItems.filter((x) => x.hospitalId === sourceHospital.id);
  const srcAudits = d.auditLogs.filter((x) => x.hospitalId === sourceHospital.id);
  const srcNotifs = d.notifications.filter((x) => x.hospitalId === sourceHospital.id);
  const srcPayments = (d.hospitalPayments ?? []).filter((x) => x.hospitalId === sourceHospital.id);
  const srcPharmMeds = (d.pharmacyMedicines ?? []).filter((x) => x.hospitalId === sourceHospital.id);
  const srcPharmBatches = (d.pharmacyBatches ?? []).filter((x) => x.hospitalId === sourceHospital.id);
  const srcPharmSales = (d.pharmacySales ?? []).filter((x) => x.hospitalId === sourceHospital.id);
  const srcPharmSaleItems = (d.pharmacySaleItems ?? []).filter((x) => x.hospitalId === sourceHospital.id);
  const srcPharmStockLogs = (d.pharmacyStockLogs ?? []).filter((x) => x.hospitalId === sourceHospital.id);
  const srcIpStayExtensions = (d.ipStayExtensions ?? []).filter((x) => x.hospitalId === sourceHospital.id);

  if (params.mode === "RESTORE_EXISTING") {
    if (!params.confirmOverwrite) {
      throw new ApiError(
        400,
        "Explicit overwrite confirmation is required before restoring into an existing hospital.",
        "CONFIRMATION_REQUIRED"
      );
    }

    const targetId = params.targetHospitalId || sourceHospital.id;
    if (targetId !== sourceHospital.id) {
      throw new ApiError(
        400,
        "Restore Existing Hospital must target the matching hospital record from the backup. To load this backup into a separate tenant, choose 'Import as New Hospital'.",
        "TARGET_MISMATCH"
      );
    }
    const existingHospital = await prisma.hospital.findUnique({
      where: { id: targetId },
    });

    if (!existingHospital) {
      throw new ApiError(
        404,
        "Target hospital does not exist. Use 'Import as New Hospital' instead.",
        "TARGET_NOT_FOUND"
      );
    }

    const existingUsersForTarget = await prisma.user.findMany({
      where: { hospitalId: targetId },
    });
    const existingHashByUsername = new Map(
      existingUsersForTarget.map((u) => [u.username, u.passwordHash])
    );

    // Ensure no username in backup conflicts with a user belonging to a DIFFERENT hospital
    const conflictingForeignUsers = await prisma.user.findMany({
      where: {
        username: { in: srcUsers.map((u) => u.username) },
        OR: [{ hospitalId: { not: targetId } }, { hospitalId: null }],
      },
      select: { username: true },
    });
    if (conflictingForeignUsers.length > 0) {
      throw new ApiError(
        409,
        `Cannot restore: username(s) already belong to another tenant (${conflictingForeignUsers.map((u) => u.username).join(", ")}).`,
        "USERNAME_CONFLICT"
      );
    }

    // Prepare password hashes outside transaction so bcrypt doesn't stall SQLite write lock
    const userCreateData: Array<{
      id: string;
      hospitalId: string;
      username: string;
      fullName: string;
      email: string | null;
      phone: string | null;
      passwordHash: string;
      role: string;
      isActive: boolean;
      passwordChangedAt: Date | null;
      lastLoginAt: Date | null;
      createdAt: Date;
    }> = [];

    for (const u of srcUsers) {
      let hash = u.passwordHash ?? existingHashByUsername.get(u.username);
      if (!hash) {
        const tempPw = generateTempPassword(12);
        hash = await hashPassword(tempPw);
        generatedCredentials.push({
          username: u.username,
          role: u.role,
          temporaryPassword: tempPw,
        });
      }
      userCreateData.push({
        id: u.id,
        hospitalId: targetId,
        username: u.username,
        fullName: u.fullName,
        email: u.email ?? null,
        phone: u.phone ?? null,
        passwordHash: hash,
        role: u.role,
        isActive: u.isActive,
        passwordChangedAt: u.passwordChangedAt,
        lastLoginAt: u.lastLoginAt ?? null,
        createdAt: u.createdAt,
      });
    }

    await prisma.$transaction(async (tx) => {
      await revokeHospitalSessions(targetId, tx);

      // Delete existing tenant records in safe reverse-dependency order
      await tx.pharmacyBillScanSession.deleteMany({ where: { hospitalId: targetId } });
      await tx.pharmacyBillScanQuota.deleteMany({ where: { hospitalId: targetId } });
      await tx.pharmacySaleItem.deleteMany({ where: { hospitalId: targetId } });
      await tx.pharmacySale.deleteMany({ where: { hospitalId: targetId } });
      await tx.pharmacyBatch.deleteMany({ where: { hospitalId: targetId } });
      await tx.pharmacyStockLog.deleteMany({ where: { hospitalId: targetId } });
      await tx.pharmacyMedicine.deleteMany({ where: { hospitalId: targetId } });
      await tx.pharmacyReferralItem.deleteMany({ where: { hospitalId: targetId } });
      await tx.labReferralItem.deleteMany({ where: { hospitalId: targetId } });
      await tx.pharmacyReferral.deleteMany({ where: { hospitalId: targetId } });
      await tx.labReferral.deleteMany({ where: { hospitalId: targetId } });
      await tx.billingReceipt.deleteMany({ where: { hospitalId: targetId } });
      await tx.ipStayExtension.deleteMany({ where: { hospitalId: targetId } });
      await tx.bedTransfer.deleteMany({ where: { hospitalId: targetId } });
      await tx.ipAdmission.deleteMany({ where: { hospitalId: targetId } });
      await tx.opVisit.deleteMany({ where: { hospitalId: targetId } });
      await tx.patient.deleteMany({ where: { hospitalId: targetId } });
      await tx.bed.deleteMany({ where: { hospitalId: targetId } });
      await tx.medicineCatalog.deleteMany({ where: { hospitalId: targetId } });
      await tx.labTestCatalog.deleteMany({ where: { hospitalId: targetId } });
      await tx.pharmacyAccount.deleteMany({ where: { hospitalId: targetId } });
      await tx.labAccount.deleteMany({ where: { hospitalId: targetId } });
      await tx.doctor.deleteMany({ where: { hospitalId: targetId } });
      await tx.notification.deleteMany({ where: { hospitalId: targetId } });
      await tx.hospitalPayment.deleteMany({ where: { hospitalId: targetId } });
      await tx.auditLog.deleteMany({ where: { hospitalId: targetId } });
      await tx.user.deleteMany({ where: { hospitalId: targetId } });

      // Update hospital metadata & sequence counters (preserve targetId/code/slug if distinct)
      await tx.hospital.update({
        where: { id: targetId },
        data: {
          name: sourceHospital.name,
          address: sourceHospital.address ?? null,
          phone: sourceHospital.phone ?? null,
          email: sourceHospital.email ?? null,
          logoDataUrl: sourceHospital.logoDataUrl ?? null,
          tagline: sourceHospital.tagline ?? null,
          registrationNo: sourceHospital.registrationNo ?? null,
          defaultConsultationFee: sourceHospital.defaultConsultationFee ?? null,
          dailyOpLimit: sourceHospital.dailyOpLimit ?? null,
          dailyIpLimit: sourceHospital.dailyIpLimit ?? null,
          subscriptionMonthsPaid: sourceHospital.subscriptionMonthsPaid ?? 0,
          subscriptionExpiresAt: sourceHospital.subscriptionExpiresAt ?? null,
          subscriptionTotalPaid: sourceHospital.subscriptionTotalPaid ?? 0,
          pharmacyMode: sourceHospital.pharmacyMode ?? "REFERRALS",
          consultancyEnabled: sourceHospital.consultancyEnabled ?? true,
          uhidPrefix: sourceHospital.uhidPrefix,
          nextUhidSeq: sourceHospital.nextUhidSeq,
          nextOpSeq: sourceHospital.nextOpSeq,
          nextIpSeq: sourceHospital.nextIpSeq,
          nextPharmRefSeq: sourceHospital.nextPharmRefSeq,
          nextPharmSaleSeq: sourceHospital.nextPharmSaleSeq ?? 1,
          nextLabRefSeq: sourceHospital.nextLabRefSeq,
          nextReceiptSeq: sourceHospital.nextReceiptSeq,
          isActive: sourceHospital.isActive,
          deactivatedAt: sourceHospital.deactivatedAt,
        },
      });

      if (userCreateData.length) {
        await createManyChunked(
          (chunk) => tx.user.createMany({ data: chunk }),
          userCreateData
        );
      }
      if (srcDoctors.length) {
        await createManyChunked(
          (chunk) => tx.doctor.createMany({ data: chunk }),
          srcDoctors.map((x) => ({
            id: x.id,
            hospitalId: targetId,
            userId: x.userId ?? null,
            name: x.name,
            specialty: x.specialty ?? null,
            qualification: x.qualification ?? null,
            phone: x.phone ?? null,
            consultationFee: x.consultationFee ?? null,
            signatureDataUrl: x.signatureDataUrl ?? null,
            isActive: x.isActive,
            createdAt: x.createdAt,
          }))
        );
      }
      if (srcBeds.length) {
        await createManyChunked(
          (chunk) => tx.bed.createMany({ data: chunk }),
          srcBeds.map((x) => ({
            id: x.id,
            hospitalId: targetId,
            bedNumber: x.bedNumber,
            ward: x.ward,
            category: x.category ?? null,
            status: x.status,
            notes: x.notes ?? null,
            createdAt: x.createdAt,
          }))
        );
      }
      if (srcPatients.length) {
        await createManyChunked(
          (chunk) => tx.patient.createMany({ data: chunk }),
          srcPatients.map((x) => ({
            id: x.id,
            hospitalId: targetId,
            uhid: x.uhid,
            fullName: x.fullName,
            age: x.age ?? null,
            dateOfBirth: x.dateOfBirth,
            gender: x.gender,
            phone: x.phone,
            address: x.address ?? null,
            bloodGroup: x.bloodGroup ?? null,
            emergencyContact: x.emergencyContact ?? null,
            registeredAt: x.registeredAt,
            createdByUserId: x.createdByUserId ?? null,
            createdAt: x.createdAt,
          }))
        );
      }
      if (srcOpVisits.length) {
        await createManyChunked(
          (chunk) => tx.opVisit.createMany({ data: chunk }),
          srcOpVisits.map((x) => ({
            id: x.id,
            hospitalId: targetId,
            visitNumber: x.visitNumber,
            patientId: x.patientId,
            doctorId: x.doctorId ?? null,
            doctorNameSnapshot: x.doctorNameSnapshot,
            departmentSnapshot: x.departmentSnapshot ?? null,
            visitDate: x.visitDate,
            reasonForVisit: x.reasonForVisit ?? null,
            notes: x.notes ?? null,
            consultationFee: x.consultationFee ?? null,
            registrationFee: x.registrationFee ?? null,
            totalAmount: x.totalAmount ?? null,
            paymentMode: x.paymentMode ?? null,
            paymentStatus: x.paymentStatus ?? null,
            createdByUserId: x.createdByUserId ?? null,
            createdAt: x.createdAt,
          }))
        );
      }
      if (srcAdmissions.length) {
        await createManyChunked(
          (chunk) => tx.ipAdmission.createMany({ data: chunk }),
          srcAdmissions.map((x) => ({
            id: x.id,
            hospitalId: targetId,
            admissionNumber: x.admissionNumber,
            patientId: x.patientId,
            bedId: x.bedId ?? null,
            doctorId: x.doctorId ?? null,
            doctorNameSnapshot: x.doctorNameSnapshot,
            wardSnapshot: x.wardSnapshot,
            bedNumberSnapshot: x.bedNumberSnapshot,
            admittedAt: x.admittedAt,
            dischargedAt: x.dischargedAt,
            status: x.status,
            chargeAmount: x.chargeAmount ?? null,
            admissionNotes: x.admissionNotes ?? null,
            dischargeNotes: x.dischargeNotes ?? null,
            admittedByUserId: x.admittedByUserId ?? null,
            dischargedByUserId: x.dischargedByUserId ?? null,
            createdAt: x.createdAt,
          }))
        );
      }
      if (srcTransfers.length) {
        await createManyChunked(
          (chunk) => tx.bedTransfer.createMany({ data: chunk }),
          srcTransfers.map((x) => ({
            id: x.id,
            hospitalId: targetId,
            ipAdmissionId: x.ipAdmissionId,
            fromBedId: x.fromBedId ?? null,
            fromBedLabel: x.fromBedLabel ?? null,
            toBedId: x.toBedId,
            toBedLabel: x.toBedLabel,
            reason: x.reason ?? null,
            transferredAt: x.transferredAt,
            transferredByUserId: x.transferredByUserId ?? null,
          }))
        );
      }
      if (srcReceipts.length) {
        await createManyChunked(
          (chunk) => tx.billingReceipt.createMany({ data: chunk }),
          srcReceipts.map((x) => ({
            id: x.id,
            hospitalId: targetId,
            receiptNumber: x.receiptNumber,
            patientId: x.patientId,
            opVisitId: x.opVisitId ?? null,
            ipAdmissionId: x.ipAdmissionId ?? null,
            hospitalNameSnapshot: x.hospitalNameSnapshot,
            hospitalAddressSnapshot: x.hospitalAddressSnapshot ?? null,
            hospitalPhoneSnapshot: x.hospitalPhoneSnapshot ?? null,
            hospitalEmailSnapshot: x.hospitalEmailSnapshot ?? null,
            hospitalLogoSnapshot: x.hospitalLogoSnapshot ?? null,
            patientUhidSnapshot: x.patientUhidSnapshot,
            patientNameSnapshot: x.patientNameSnapshot,
            visitSummarySnapshot: x.visitSummarySnapshot,
            lineItemsJson: x.lineItemsJson,
            totalAmount: x.totalAmount ?? null,
            paymentMode: x.paymentMode ?? null,
            paymentStatus: x.paymentStatus ?? null,
            issuedAt: x.issuedAt,
            issuedByUserId: x.issuedByUserId ?? null,
            issuedByNameSnapshot: x.issuedByNameSnapshot,
          }))
        );
      }
      if (srcMeds.length) {
        await createManyChunked(
          (chunk) => tx.medicineCatalog.createMany({ data: chunk }),
          srcMeds.map((x) => ({
            id: x.id,
            hospitalId: targetId,
            name: x.name,
            description: x.description ?? null,
            price: x.price ?? null,
            isActive: x.isActive,
            createdAt: x.createdAt,
          }))
        );
      }
      if (srcPharmAccounts.length) {
        await createManyChunked(
          (chunk) => tx.pharmacyAccount.createMany({ data: chunk }),
          srcPharmAccounts.map((x) => ({
            id: x.id,
            hospitalId: targetId,
            userId: x.userId,
            pharmacyName: x.pharmacyName,
            contactPerson: x.contactPerson,
            phone: x.phone,
            address: x.address ?? null,
            isActive: x.isActive,
            createdAt: x.createdAt,
          }))
        );
      }
      if (srcPharmRefs.length) {
        await createManyChunked(
          (chunk) => tx.pharmacyReferral.createMany({ data: chunk }),
          srcPharmRefs.map((x) => ({
            id: x.id,
            hospitalId: targetId,
            referralNumber: x.referralNumber,
            patientId: x.patientId,
            pharmacyAccountId: x.pharmacyAccountId,
            opVisitId: x.opVisitId ?? null,
            ipAdmissionId: x.ipAdmissionId ?? null,
            patientNameSnapshot: x.patientNameSnapshot,
            patientUhidSnapshot: x.patientUhidSnapshot,
            patientPhoneSnapshot: x.patientPhoneSnapshot ?? null,
            pharmacyNameSnapshot: x.pharmacyNameSnapshot,
            notes: x.notes ?? null,
            totalAmount: x.totalAmount ?? null,
            status: x.status,
            referredAt: x.referredAt,
            referredByUserId: x.referredByUserId,
            completedAt: x.completedAt,
            completedByUserId: x.completedByUserId ?? null,
            completedByNameSnapshot: x.completedByNameSnapshot ?? null,
            cancelledAt: x.cancelledAt,
            cancelledByUserId: x.cancelledByUserId ?? null,
            createdAt: x.createdAt,
          }))
        );
      }
      if (srcPharmItems.length) {
        await createManyChunked(
          (chunk) => tx.pharmacyReferralItem.createMany({ data: chunk }),
          srcPharmItems.map((x) => ({
            id: x.id,
            hospitalId: targetId,
            referralId: x.referralId,
            medicineCatalogId: x.medicineCatalogId ?? null,
            medicineNameSnapshot: x.medicineNameSnapshot,
            descriptionSnapshot: x.descriptionSnapshot ?? null,
            quantity: x.quantity,
            unitPriceSnapshot: x.unitPriceSnapshot ?? null,
            lineTotal: x.lineTotal ?? null,
            dosageInstructions: x.dosageInstructions ?? null,
          }))
        );
      }
      if (srcTests.length) {
        await createManyChunked(
          (chunk) => tx.labTestCatalog.createMany({ data: chunk }),
          srcTests.map((x) => ({
            id: x.id,
            hospitalId: targetId,
            name: x.name,
            description: x.description ?? null,
            price: x.price ?? null,
            isActive: x.isActive,
            createdAt: x.createdAt,
          }))
        );
      }
      if (srcLabAccounts.length) {
        await createManyChunked(
          (chunk) => tx.labAccount.createMany({ data: chunk }),
          srcLabAccounts.map((x) => ({
            id: x.id,
            hospitalId: targetId,
            userId: x.userId,
            labName: x.labName,
            contactPerson: x.contactPerson,
            phone: x.phone,
            address: x.address ?? null,
            isActive: x.isActive,
            createdAt: x.createdAt,
          }))
        );
      }
      if (srcLabRefs.length) {
        await createManyChunked(
          (chunk) => tx.labReferral.createMany({ data: chunk }),
          srcLabRefs.map((x) => ({
            id: x.id,
            hospitalId: targetId,
            referralNumber: x.referralNumber,
            patientId: x.patientId,
            labAccountId: x.labAccountId,
            opVisitId: x.opVisitId ?? null,
            ipAdmissionId: x.ipAdmissionId ?? null,
            patientNameSnapshot: x.patientNameSnapshot,
            patientUhidSnapshot: x.patientUhidSnapshot,
            patientPhoneSnapshot: x.patientPhoneSnapshot ?? null,
            labNameSnapshot: x.labNameSnapshot,
            notes: x.notes ?? null,
            totalAmount: x.totalAmount ?? null,
            status: x.status,
            referredAt: x.referredAt,
            referredByUserId: x.referredByUserId,
            completedAt: x.completedAt,
            completedByUserId: x.completedByUserId ?? null,
            completedByNameSnapshot: x.completedByNameSnapshot ?? null,
            cancelledAt: x.cancelledAt,
            cancelledByUserId: x.cancelledByUserId ?? null,
            createdAt: x.createdAt,
          }))
        );
      }
      if (srcLabItems.length) {
        await createManyChunked(
          (chunk) => tx.labReferralItem.createMany({ data: chunk }),
          srcLabItems.map((x) => ({
            id: x.id,
            hospitalId: targetId,
            referralId: x.referralId,
            labTestCatalogId: x.labTestCatalogId ?? null,
            testNameSnapshot: x.testNameSnapshot,
            descriptionSnapshot: x.descriptionSnapshot ?? null,
            unitPriceSnapshot: x.unitPriceSnapshot ?? null,
          }))
        );
      }
      if (srcAudits.length) {
        await tx.auditLog.createMany({
          data: srcAudits.map((x) => ({
            id: x.id,
            eventId: x.eventId,
            hospitalId: targetId,
            actorUserId: x.actorUserId ?? null,
            actorUsername: x.actorUsername,
            actorRole: x.actorRole,
            actionType: x.actionType,
            patientId: x.patientId ?? null,
            patientUhid: x.patientUhid ?? null,
            referenceId: x.referenceId ?? null,
            details: x.details,
            metadataJson: x.metadataJson ?? null,
            createdAt: x.createdAt,
          })),
        });
      }
      if (srcNotifs.length) {
        await tx.notification.createMany({
          data: srcNotifs.map((x) => ({
            id: x.id,
            hospitalId: targetId,
            targetRole: x.targetRole,
            title: x.title,
            message: x.message,
            category: x.category,
            isRead: x.isRead,
            createdAt: x.createdAt,
          })),
        });
      }
      if (srcPayments.length) {
        await tx.hospitalPayment.createMany({
          data: srcPayments.map((x) => ({
            id: x.id,
            hospitalId: targetId,
            durationValue: x.durationValue,
            durationUnit: x.durationUnit,
            monthsAdded: x.monthsAdded,
            amountCollected: x.amountCollected,
            previousExpiresAt: x.previousExpiresAt ?? null,
            newExpiresAt: x.newExpiresAt,
            notes: x.notes ?? null,
            recordedByUserId: x.recordedByUserId ?? null,
            recordedByUsername: x.recordedByUsername,
            paidAt: x.paidAt,
            createdAt: x.createdAt,
          })),
        });
      }
      if (srcPharmMeds.length) {
        await createManyChunked(
          (chunk) => tx.pharmacyMedicine.createMany({ data: chunk }),
          srcPharmMeds.map((x) => ({
            id: x.id,
            hospitalId: targetId,
            name: x.name,
            packagingType: x.packagingType,
            unitsPerSheet: x.unitsPerSheet,
            minStock: x.minStock,
            unitSellingPrice: x.unitSellingPrice,
            sheetSellingPrice: x.sheetSellingPrice,
            hsnCode: x.hsnCode ?? null,
            gstPercent: x.gstPercent,
            prescriptionRequired: x.prescriptionRequired,
            placement: x.placement ?? null,
            createdAt: x.createdAt,
          }))
        );
      }
      if (srcPharmBatches.length) {
        await createManyChunked(
          (chunk) => tx.pharmacyBatch.createMany({ data: chunk }),
          srcPharmBatches.map((x) => ({
            id: x.id,
            hospitalId: targetId,
            medicineId: x.medicineId,
            batchNumber: x.batchNumber,
            expiryMonth: x.expiryMonth,
            expiryYear: x.expiryYear,
            expiryDate: x.expiryDate,
            quantityUnits: x.quantityUnits,
            initialQuantityUnits: x.initialQuantityUnits,
            createdAt: x.createdAt,
          }))
        );
      }
      if (srcPharmSales.length) {
        await createManyChunked(
          (chunk) => tx.pharmacySale.createMany({ data: chunk }),
          srcPharmSales.map((x) => ({
            id: x.id,
            hospitalId: targetId,
            saleNumber: x.saleNumber,
            patientName: x.patientName,
            patientPhone: x.patientPhone,
            doctorId: x.doctorId ?? null,
            doctorName: x.doctorName,
            subtotal: x.subtotal,
            gstAmount: x.gstAmount,
            totalAmount: x.totalAmount,
            totalUnitsSold: x.totalUnitsSold,
            paymentMode: x.paymentMode,
            soldByUserId: x.soldByUserId ?? null,
            soldByNameSnapshot: x.soldByNameSnapshot,
            soldAt: x.soldAt,
            createdAt: x.createdAt,
          }))
        );
      }
      if (srcPharmSaleItems.length) {
        await createManyChunked(
          (chunk) => tx.pharmacySaleItem.createMany({ data: chunk }),
          srcPharmSaleItems.map((x) => ({
            id: x.id,
            hospitalId: targetId,
            saleId: x.saleId,
            medicineId: x.medicineId ?? null,
            batchId: x.batchId ?? null,
            medicineNameSnapshot: x.medicineNameSnapshot,
            batchNumberSnapshot: x.batchNumberSnapshot,
            expiryDateSnapshot: x.expiryDateSnapshot,
            hsnCodeSnapshot: x.hsnCodeSnapshot ?? null,
            placementSnapshot: x.placementSnapshot ?? null,
            prescriptionRequired: x.prescriptionRequired,
            sellMode: x.sellMode,
            enteredQuantity: x.enteredQuantity,
            unitsPerSheetSnapshot: x.unitsPerSheetSnapshot,
            basicUnitsDeducted: x.basicUnitsDeducted,
            unitPriceSnapshot: x.unitPriceSnapshot,
            gstPercentSnapshot: x.gstPercentSnapshot,
            subtotal: x.subtotal,
            gstAmount: x.gstAmount,
            lineTotal: x.lineTotal,
          }))
        );
      }
      if (srcPharmStockLogs.length) {
        await createManyChunked(
          (chunk) => tx.pharmacyStockLog.createMany({ data: chunk }),
          srcPharmStockLogs.map((x) => ({
            id: x.id,
            hospitalId: targetId,
            medicineId: x.medicineId ?? null,
            medicineNameSnapshot: x.medicineNameSnapshot,
            batchNumberSnapshot: x.batchNumberSnapshot,
            changeType: x.changeType,
            unitsDelta: x.unitsDelta,
            recordedByUserId: x.recordedByUserId ?? null,
            recordedByNameSnapshot: x.recordedByNameSnapshot,
            createdAt: x.createdAt,
          }))
        );
      }
      if (srcIpStayExtensions.length) {
        await createManyChunked(
          (chunk) => tx.ipStayExtension.createMany({ data: chunk }),
          srcIpStayExtensions.map((x) => ({
            id: x.id,
            hospitalId: targetId,
            ipAdmissionId: x.ipAdmissionId,
            additionalDays: x.additionalDays,
            amountCollected: x.amountCollected,
            paymentMode: x.paymentMode,
            reason: x.reason,
            previousCheckoutAt: x.previousCheckoutAt ?? null,
            newCheckoutAt: x.newCheckoutAt,
            extendedByUserId: x.extendedByUserId ?? null,
            extendedByNameSnapshot: x.extendedByNameSnapshot,
            createdAt: x.createdAt,
          }))
        );
      }

      await tx.backupRecord.create({
        data: {
          hospitalId: targetId,
          operation: "RESTORE_EXISTING",
          scope: file.scope,
          backupVersion: file.schemaVersion,
          checksum: file.checksum,
          summaryJson: JSON.stringify(validation.summary?.totals ?? {}),
          performedByUserId: params.actor.id,
          performedByUsername: params.actor.username,
        },
      });

      await tx.auditLog.create({
        data: {
          eventId: generateAuditEventId(),
          hospitalId: targetId,
          actorUserId: params.actor.id,
          actorUsername: params.actor.username,
          actorRole: params.actor.role,
          actionType: "BACKUP_RESTORED",
          referenceId: file.checksum.slice(0, 12).toUpperCase(),
          details: `Hospital backup restored into existing tenant ${existingHospital.code} (${srcPatients.length} patients, ${srcOpVisits.length} OP visits, ${srcAdmissions.length} IP admissions).`,
        },
      });
      await pruneHospitalAuditLogs(targetId, tx);
    }, { timeout: 90_000, maxWait: 15_000 });

    return {
      mode: "RESTORE_EXISTING" as const,
      hospitalId: targetId,
      hospitalCode: existingHospital.code,
      hospitalName: sourceHospital.name,
      restoredCounts: {
        users: userCreateData.length,
        patients: srcPatients.length,
        opVisits: srcOpVisits.length,
        ipAdmissions: srcAdmissions.length,
        pharmacyReferrals: srcPharmRefs.length,
        labReferrals: srcLabRefs.length,
      },
      generatedCredentials,
    };
  }

  // IMPORT_NEW mode: Create a brand-new isolated hospital with remapped IDs
  const newHospitalId = newCuidLike();
  const suffix = crypto.randomBytes(2).toString("hex").toUpperCase();
  const targetCode = (params.newHospitalCode?.trim() || `${sourceHospital.code}-${suffix}`).toUpperCase();
  const targetName = params.newHospitalName?.trim() || `${sourceHospital.name} (Imported)`;
  const targetSlug = `${targetCode.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}-${suffix.toLowerCase()}`;
  const prefix = (params.usernamePrefix?.trim() || `${targetCode.toLowerCase().replace(/[^a-z0-9]/g, "")}_`);

  const codeCollision = await prisma.hospital.findFirst({
    where: { OR: [{ code: targetCode }, { slug: targetSlug }] },
  });
  if (codeCollision) {
    throw new ApiError(
      409,
      `Hospital code "${targetCode}" is already in use. Choose another unique identifier.`,
      "HOSPITAL_CODE_CONFLICT"
    );
  }

  // Remap all IDs cleanly so importing never collides with existing records
  const idMap = new Map<string, string>();
  const mapId = (oldId: string) => {
    let mapped = idMap.get(oldId);
    if (!mapped) {
      mapped = newCuidLike();
      idMap.set(oldId, mapped);
    }
    return mapped;
  };
  const mapOptionalId = (oldId?: string | null) => (oldId ? mapId(oldId) : null);

  // Check mapped usernames for uniqueness
  const mappedUsernames = srcUsers.map((u) => `${prefix}${u.username}`);
  const existingMapped = await prisma.user.findMany({
    where: { username: { in: mappedUsernames } },
    select: { username: true },
  });
  if (existingMapped.length > 0) {
    throw new ApiError(
      409,
      `Username prefix creates collisions with existing usernames: ${existingMapped.map((u) => u.username).join(", ")}`,
      "USERNAME_CONFLICT"
    );
  }

  const newUsersData: Array<{
    id: string;
    hospitalId: string;
    username: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    passwordHash: string;
    role: string;
    isActive: boolean;
    passwordChangedAt: Date | null;
    lastLoginAt: Date | null;
    createdAt: Date;
  }> = [];
  for (const u of srcUsers) {
    const newUsername = `${prefix}${u.username}`;
    let hash = u.passwordHash;
    if (!hash) {
      const tempPw = generateTempPassword(12);
      hash = await hashPassword(tempPw);
      generatedCredentials.push({
        username: newUsername,
        role: u.role,
        temporaryPassword: tempPw,
      });
    }
    newUsersData.push({
      id: mapId(u.id),
      hospitalId: newHospitalId,
      username: newUsername,
      fullName: u.fullName,
      email: u.email ?? null,
      phone: u.phone ?? null,
      passwordHash: hash,
      role: u.role,
      isActive: u.isActive,
      passwordChangedAt: u.passwordChangedAt ?? null,
      lastLoginAt: u.lastLoginAt ?? null,
      createdAt: u.createdAt,
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.hospital.create({
      data: {
        id: newHospitalId,
        code: targetCode,
        name: targetName,
        slug: targetSlug,
        address: sourceHospital.address ?? null,
        phone: sourceHospital.phone ?? null,
        email: sourceHospital.email ?? null,
        logoDataUrl: sourceHospital.logoDataUrl ?? null,
        tagline: sourceHospital.tagline ?? null,
        registrationNo: sourceHospital.registrationNo ?? null,
        defaultConsultationFee: sourceHospital.defaultConsultationFee ?? null,
        dailyOpLimit: sourceHospital.dailyOpLimit ?? null,
        dailyIpLimit: sourceHospital.dailyIpLimit ?? null,
        subscriptionMonthsPaid: sourceHospital.subscriptionMonthsPaid ?? 0,
        subscriptionExpiresAt: sourceHospital.subscriptionExpiresAt ?? null,
        subscriptionTotalPaid: sourceHospital.subscriptionTotalPaid ?? 0,
        pharmacyMode: sourceHospital.pharmacyMode ?? "REFERRALS",
        consultancyEnabled: sourceHospital.consultancyEnabled ?? true,
        uhidPrefix: sourceHospital.uhidPrefix,
        nextUhidSeq: sourceHospital.nextUhidSeq,
        nextOpSeq: sourceHospital.nextOpSeq,
        nextIpSeq: sourceHospital.nextIpSeq,
        nextPharmRefSeq: sourceHospital.nextPharmRefSeq,
        nextPharmSaleSeq: sourceHospital.nextPharmSaleSeq ?? 1,
        nextLabRefSeq: sourceHospital.nextLabRefSeq,
        nextReceiptSeq: sourceHospital.nextReceiptSeq,
        isActive: sourceHospital.isActive,
        deactivatedAt: sourceHospital.deactivatedAt,
      },
    });

    if (newUsersData.length) await tx.user.createMany({ data: newUsersData });
    if (srcDoctors.length) {
      await tx.doctor.createMany({
        data: srcDoctors.map((x) => ({
          id: mapId(x.id),
          hospitalId: newHospitalId,
          userId: x.userId ? mapId(x.userId) : null,
          name: x.name,
          specialty: x.specialty ?? null,
          qualification: x.qualification ?? null,
          phone: x.phone ?? null,
          consultationFee: x.consultationFee ?? null,
          signatureDataUrl: x.signatureDataUrl ?? null,
          isActive: x.isActive,
          createdAt: x.createdAt,
        })),
      });
    }
    if (srcBeds.length) {
      await tx.bed.createMany({
        data: srcBeds.map((x) => ({
          id: mapId(x.id),
          hospitalId: newHospitalId,
          bedNumber: x.bedNumber,
          ward: x.ward,
          category: x.category ?? null,
          status: x.status,
          notes: x.notes ?? null,
          createdAt: x.createdAt,
        })),
      });
    }
    if (srcPatients.length) {
      await createManyChunked(
        (chunk) => tx.patient.createMany({ data: chunk }),
        srcPatients.map((x) => ({
          id: mapId(x.id),
          hospitalId: newHospitalId,
          uhid: x.uhid,
          fullName: x.fullName,
          age: x.age ?? null,
          dateOfBirth: x.dateOfBirth,
          gender: x.gender,
          phone: x.phone,
          address: x.address ?? null,
          bloodGroup: x.bloodGroup ?? null,
          emergencyContact: x.emergencyContact ?? null,
          registeredAt: x.registeredAt,
          createdByUserId: mapOptionalId(x.createdByUserId),
          createdAt: x.createdAt,
        }))
      );
    }
    if (srcOpVisits.length) {
      await createManyChunked(
        (chunk) => tx.opVisit.createMany({ data: chunk }),
        srcOpVisits.map((x) => ({
          id: mapId(x.id),
          hospitalId: newHospitalId,
          visitNumber: x.visitNumber,
          patientId: mapId(x.patientId),
          doctorId: mapOptionalId(x.doctorId),
          doctorNameSnapshot: x.doctorNameSnapshot,
          departmentSnapshot: x.departmentSnapshot ?? null,
          visitDate: x.visitDate,
          reasonForVisit: x.reasonForVisit ?? null,
          notes: x.notes ?? null,
          consultationFee: x.consultationFee ?? null,
          registrationFee: x.registrationFee ?? null,
          totalAmount: x.totalAmount ?? null,
          paymentMode: x.paymentMode ?? null,
          paymentStatus: x.paymentStatus ?? null,
          createdByUserId: mapOptionalId(x.createdByUserId),
          createdAt: x.createdAt,
        }))
      );
    }
    if (srcAdmissions.length) {
      await createManyChunked(
        (chunk) => tx.ipAdmission.createMany({ data: chunk }),
        srcAdmissions.map((x) => ({
          id: mapId(x.id),
          hospitalId: newHospitalId,
          admissionNumber: x.admissionNumber,
          patientId: mapId(x.patientId),
          bedId: mapOptionalId(x.bedId),
          doctorId: mapOptionalId(x.doctorId),
          doctorNameSnapshot: x.doctorNameSnapshot,
          wardSnapshot: x.wardSnapshot,
          bedNumberSnapshot: x.bedNumberSnapshot,
          admittedAt: x.admittedAt,
          dischargedAt: x.dischargedAt,
          status: x.status,
          chargeAmount: x.chargeAmount ?? null,
          admissionNotes: x.admissionNotes ?? null,
          dischargeNotes: x.dischargeNotes ?? null,
          admittedByUserId: mapOptionalId(x.admittedByUserId),
          dischargedByUserId: mapOptionalId(x.dischargedByUserId),
          createdAt: x.createdAt,
        }))
      );
    }
    if (srcTransfers.length) {
      await createManyChunked(
        (chunk) => tx.bedTransfer.createMany({ data: chunk }),
        srcTransfers.map((x) => ({
          id: mapId(x.id),
          hospitalId: newHospitalId,
          ipAdmissionId: mapId(x.ipAdmissionId),
          fromBedId: mapOptionalId(x.fromBedId),
          fromBedLabel: x.fromBedLabel ?? null,
          toBedId: mapId(x.toBedId),
          toBedLabel: x.toBedLabel,
          reason: x.reason ?? null,
          transferredAt: x.transferredAt,
          transferredByUserId: mapOptionalId(x.transferredByUserId),
        }))
      );
    }
    if (srcReceipts.length) {
      await createManyChunked(
        (chunk) => tx.billingReceipt.createMany({ data: chunk }),
        srcReceipts.map((x) => ({
          id: mapId(x.id),
          hospitalId: newHospitalId,
          receiptNumber: x.receiptNumber,
          patientId: mapId(x.patientId),
          opVisitId: mapOptionalId(x.opVisitId),
          ipAdmissionId: mapOptionalId(x.ipAdmissionId),
          hospitalNameSnapshot: x.hospitalNameSnapshot,
          hospitalAddressSnapshot: x.hospitalAddressSnapshot ?? null,
          hospitalPhoneSnapshot: x.hospitalPhoneSnapshot ?? null,
          hospitalEmailSnapshot: x.hospitalEmailSnapshot ?? null,
          hospitalLogoSnapshot: x.hospitalLogoSnapshot ?? null,
          patientUhidSnapshot: x.patientUhidSnapshot,
          patientNameSnapshot: x.patientNameSnapshot,
          visitSummarySnapshot: x.visitSummarySnapshot,
          lineItemsJson: x.lineItemsJson,
          totalAmount: x.totalAmount ?? null,
          paymentMode: x.paymentMode ?? null,
          paymentStatus: x.paymentStatus ?? null,
          issuedAt: x.issuedAt,
          issuedByUserId: mapOptionalId(x.issuedByUserId),
          issuedByNameSnapshot: x.issuedByNameSnapshot,
        }))
      );
    }
    if (srcMeds.length) {
      await createManyChunked(
        (chunk) => tx.medicineCatalog.createMany({ data: chunk }),
        srcMeds.map((x) => ({
          id: mapId(x.id),
          hospitalId: newHospitalId,
          name: x.name,
          description: x.description ?? null,
          price: x.price ?? null,
          isActive: x.isActive,
          createdAt: x.createdAt,
        }))
      );
    }
    if (srcPharmAccounts.length) {
      await createManyChunked(
        (chunk) => tx.pharmacyAccount.createMany({ data: chunk }),
        srcPharmAccounts.map((x) => ({
          id: mapId(x.id),
          hospitalId: newHospitalId,
          userId: mapId(x.userId),
          pharmacyName: x.pharmacyName,
          contactPerson: x.contactPerson,
          phone: x.phone,
          address: x.address ?? null,
          isActive: x.isActive,
          createdAt: x.createdAt,
        }))
      );
    }
    if (srcPharmRefs.length) {
      await createManyChunked(
        (chunk) => tx.pharmacyReferral.createMany({ data: chunk }),
        srcPharmRefs.map((x) => ({
          id: mapId(x.id),
          hospitalId: newHospitalId,
          referralNumber: x.referralNumber,
          patientId: mapId(x.patientId),
          pharmacyAccountId: mapId(x.pharmacyAccountId),
          opVisitId: mapOptionalId(x.opVisitId),
          ipAdmissionId: mapOptionalId(x.ipAdmissionId),
          patientNameSnapshot: x.patientNameSnapshot,
          patientUhidSnapshot: x.patientUhidSnapshot,
          patientPhoneSnapshot: x.patientPhoneSnapshot ?? null,
          pharmacyNameSnapshot: x.pharmacyNameSnapshot,
          notes: x.notes ?? null,
          totalAmount: x.totalAmount ?? null,
          status: x.status,
          referredAt: x.referredAt,
          referredByUserId: mapId(x.referredByUserId),
          completedAt: x.completedAt,
          completedByUserId: mapOptionalId(x.completedByUserId),
          completedByNameSnapshot: x.completedByNameSnapshot ?? null,
          cancelledAt: x.cancelledAt,
          cancelledByUserId: mapOptionalId(x.cancelledByUserId),
          createdAt: x.createdAt,
        }))
      );
    }
    if (srcPharmItems.length) {
      await createManyChunked(
        (chunk) => tx.pharmacyReferralItem.createMany({ data: chunk }),
        srcPharmItems.map((x) => ({
          id: mapId(x.id),
          hospitalId: newHospitalId,
          referralId: mapId(x.referralId),
          medicineCatalogId: mapOptionalId(x.medicineCatalogId),
          medicineNameSnapshot: x.medicineNameSnapshot,
          descriptionSnapshot: x.descriptionSnapshot ?? null,
          quantity: x.quantity,
          unitPriceSnapshot: x.unitPriceSnapshot ?? null,
          lineTotal: x.lineTotal ?? null,
          dosageInstructions: x.dosageInstructions ?? null,
        }))
      );
    }
    if (srcTests.length) {
      await createManyChunked(
        (chunk) => tx.labTestCatalog.createMany({ data: chunk }),
        srcTests.map((x) => ({
          id: mapId(x.id),
          hospitalId: newHospitalId,
          name: x.name,
          description: x.description ?? null,
          price: x.price ?? null,
          isActive: x.isActive,
          createdAt: x.createdAt,
        }))
      );
    }
    if (srcLabAccounts.length) {
      await createManyChunked(
        (chunk) => tx.labAccount.createMany({ data: chunk }),
        srcLabAccounts.map((x) => ({
          id: mapId(x.id),
          hospitalId: newHospitalId,
          userId: mapId(x.userId),
          labName: x.labName,
          contactPerson: x.contactPerson,
          phone: x.phone,
          address: x.address ?? null,
          isActive: x.isActive,
          createdAt: x.createdAt,
        }))
      );
    }
    if (srcLabRefs.length) {
      await createManyChunked(
        (chunk) => tx.labReferral.createMany({ data: chunk }),
        srcLabRefs.map((x) => ({
          id: mapId(x.id),
          hospitalId: newHospitalId,
          referralNumber: x.referralNumber,
          patientId: mapId(x.patientId),
          labAccountId: mapId(x.labAccountId),
          opVisitId: mapOptionalId(x.opVisitId),
          ipAdmissionId: mapOptionalId(x.ipAdmissionId),
          patientNameSnapshot: x.patientNameSnapshot,
          patientUhidSnapshot: x.patientUhidSnapshot,
          patientPhoneSnapshot: x.patientPhoneSnapshot ?? null,
          labNameSnapshot: x.labNameSnapshot,
          notes: x.notes ?? null,
          totalAmount: x.totalAmount ?? null,
          status: x.status,
          referredAt: x.referredAt,
          referredByUserId: mapId(x.referredByUserId),
          completedAt: x.completedAt,
          completedByUserId: mapOptionalId(x.completedByUserId),
          completedByNameSnapshot: x.completedByNameSnapshot ?? null,
          cancelledAt: x.cancelledAt,
          cancelledByUserId: mapOptionalId(x.cancelledByUserId),
          createdAt: x.createdAt,
        }))
      );
    }
    if (srcLabItems.length) {
      await createManyChunked(
        (chunk) => tx.labReferralItem.createMany({ data: chunk }),
        srcLabItems.map((x) => ({
          id: mapId(x.id),
          hospitalId: newHospitalId,
          referralId: mapId(x.referralId),
          labTestCatalogId: mapOptionalId(x.labTestCatalogId),
          testNameSnapshot: x.testNameSnapshot,
          descriptionSnapshot: x.descriptionSnapshot ?? null,
          unitPriceSnapshot: x.unitPriceSnapshot ?? null,
        }))
      );
    }
    if (srcAudits.length) {
      await tx.auditLog.createMany({
        data: srcAudits.map((x) => ({
          id: mapId(x.id),
          eventId: `${x.eventId}-${suffix}`,
          hospitalId: newHospitalId,
          actorUserId: mapOptionalId(x.actorUserId),
          actorUsername: x.actorUsername,
          actorRole: x.actorRole,
          actionType: x.actionType,
          patientId: mapOptionalId(x.patientId),
          patientUhid: x.patientUhid ?? null,
          referenceId: x.referenceId ?? null,
          details: x.details,
          metadataJson: x.metadataJson ?? null,
          createdAt: x.createdAt,
        })),
      });
    }
    if (srcPayments.length) {
      await tx.hospitalPayment.createMany({
        data: srcPayments.map((x) => ({
          id: mapId(x.id),
          hospitalId: newHospitalId,
          durationValue: x.durationValue,
          durationUnit: x.durationUnit,
          monthsAdded: x.monthsAdded,
          amountCollected: x.amountCollected,
          previousExpiresAt: x.previousExpiresAt ?? null,
          newExpiresAt: x.newExpiresAt,
          notes: x.notes ?? null,
          recordedByUserId: x.recordedByUserId ?? null,
          recordedByUsername: x.recordedByUsername,
          paidAt: x.paidAt,
          createdAt: x.createdAt,
        })),
      });
    }
    if (srcPharmMeds.length) {
      await createManyChunked(
        (chunk) => tx.pharmacyMedicine.createMany({ data: chunk }),
        srcPharmMeds.map((x) => ({
          id: mapId(x.id),
          hospitalId: newHospitalId,
          name: x.name,
          packagingType: x.packagingType,
          unitsPerSheet: x.unitsPerSheet,
          minStock: x.minStock,
          unitSellingPrice: x.unitSellingPrice,
          sheetSellingPrice: x.sheetSellingPrice,
          hsnCode: x.hsnCode ?? null,
          gstPercent: x.gstPercent,
          prescriptionRequired: x.prescriptionRequired,
          placement: x.placement ?? null,
          createdAt: x.createdAt,
        }))
      );
    }
    if (srcPharmBatches.length) {
      await createManyChunked(
        (chunk) => tx.pharmacyBatch.createMany({ data: chunk }),
        srcPharmBatches.map((x) => ({
          id: mapId(x.id),
          hospitalId: newHospitalId,
          medicineId: mapId(x.medicineId),
          batchNumber: x.batchNumber,
          expiryMonth: x.expiryMonth,
          expiryYear: x.expiryYear,
          expiryDate: x.expiryDate,
          quantityUnits: x.quantityUnits,
          initialQuantityUnits: x.initialQuantityUnits,
          createdAt: x.createdAt,
        }))
      );
    }
    if (srcPharmSales.length) {
      await createManyChunked(
        (chunk) => tx.pharmacySale.createMany({ data: chunk }),
        srcPharmSales.map((x) => ({
          id: mapId(x.id),
          hospitalId: newHospitalId,
          saleNumber: x.saleNumber,
          patientName: x.patientName,
          patientPhone: x.patientPhone,
          doctorId: mapOptionalId(x.doctorId),
          doctorName: x.doctorName,
          subtotal: x.subtotal,
          gstAmount: x.gstAmount,
          totalAmount: x.totalAmount,
          totalUnitsSold: x.totalUnitsSold,
          paymentMode: x.paymentMode,
          soldByUserId: mapOptionalId(x.soldByUserId),
          soldByNameSnapshot: x.soldByNameSnapshot,
          soldAt: x.soldAt,
          createdAt: x.createdAt,
        }))
      );
    }
    if (srcPharmSaleItems.length) {
      await createManyChunked(
        (chunk) => tx.pharmacySaleItem.createMany({ data: chunk }),
        srcPharmSaleItems.map((x) => ({
          id: mapId(x.id),
          hospitalId: newHospitalId,
          saleId: mapId(x.saleId),
          medicineId: x.medicineId ? (idMap.get(x.medicineId) ?? x.medicineId) : null,
          batchId: x.batchId ? (idMap.get(x.batchId) ?? x.batchId) : null,
          medicineNameSnapshot: x.medicineNameSnapshot,
          batchNumberSnapshot: x.batchNumberSnapshot,
          expiryDateSnapshot: x.expiryDateSnapshot,
          hsnCodeSnapshot: x.hsnCodeSnapshot ?? null,
          placementSnapshot: x.placementSnapshot ?? null,
          prescriptionRequired: x.prescriptionRequired,
          sellMode: x.sellMode,
          enteredQuantity: x.enteredQuantity,
          unitsPerSheetSnapshot: x.unitsPerSheetSnapshot,
          basicUnitsDeducted: x.basicUnitsDeducted,
          unitPriceSnapshot: x.unitPriceSnapshot,
          gstPercentSnapshot: x.gstPercentSnapshot,
          subtotal: x.subtotal,
          gstAmount: x.gstAmount,
          lineTotal: x.lineTotal,
        }))
      );
    }
    if (srcPharmStockLogs.length) {
      await createManyChunked(
        (chunk) => tx.pharmacyStockLog.createMany({ data: chunk }),
        srcPharmStockLogs.map((x) => ({
          id: mapId(x.id),
          hospitalId: newHospitalId,
          medicineId: x.medicineId ? (idMap.get(x.medicineId) ?? x.medicineId) : null,
          medicineNameSnapshot: x.medicineNameSnapshot,
          batchNumberSnapshot: x.batchNumberSnapshot,
          changeType: x.changeType,
          unitsDelta: x.unitsDelta,
          recordedByUserId: mapOptionalId(x.recordedByUserId),
          recordedByNameSnapshot: x.recordedByNameSnapshot,
          createdAt: x.createdAt,
        }))
      );
    }
    if (srcIpStayExtensions.length) {
      await createManyChunked(
        (chunk) => tx.ipStayExtension.createMany({ data: chunk }),
        srcIpStayExtensions.map((x) => ({
          id: mapId(x.id),
          hospitalId: newHospitalId,
          ipAdmissionId: mapId(x.ipAdmissionId),
          additionalDays: x.additionalDays,
          amountCollected: x.amountCollected,
          paymentMode: x.paymentMode,
          reason: x.reason,
          previousCheckoutAt: x.previousCheckoutAt ?? null,
          newCheckoutAt: x.newCheckoutAt,
          extendedByUserId: mapOptionalId(x.extendedByUserId),
          extendedByNameSnapshot: x.extendedByNameSnapshot,
          createdAt: x.createdAt,
        }))
      );
    }

    await tx.backupRecord.create({
      data: {
        hospitalId: newHospitalId,
        operation: "IMPORT_NEW",
        scope: file.scope,
        backupVersion: file.schemaVersion,
        checksum: file.checksum,
        summaryJson: JSON.stringify(validation.summary?.totals ?? {}),
        performedByUserId: params.actor.id,
        performedByUsername: params.actor.username,
      },
    });

    await tx.auditLog.create({
      data: {
        eventId: generateAuditEventId(),
        hospitalId: newHospitalId,
        actorUserId: params.actor.id,
        actorUsername: params.actor.username,
        actorRole: params.actor.role,
        actionType: "BACKUP_RESTORED",
        referenceId: targetCode,
        details: `Imported backup as new isolated hospital tenant "${targetName}" (${targetCode}) with ${srcPatients.length} patients.`,
      },
    });
    await pruneHospitalAuditLogs(newHospitalId, tx);
  }, { timeout: 90_000, maxWait: 15_000 });

  return {
    mode: "IMPORT_NEW" as const,
    hospitalId: newHospitalId,
    hospitalCode: targetCode,
    hospitalName: targetName,
    restoredCounts: {
      users: newUsersData.length,
      patients: srcPatients.length,
      opVisits: srcOpVisits.length,
      ipAdmissions: srcAdmissions.length,
      pharmacyReferrals: srcPharmRefs.length,
      labReferrals: srcLabRefs.length,
    },
    generatedCredentials,
  };
}
