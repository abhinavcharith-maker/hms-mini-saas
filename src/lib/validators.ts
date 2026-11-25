import { z } from "zod";
import { PHARMACY_MODE, ROLES } from "./constants";

export const requiredPhoneSchema = z
  .string()
  .trim()
  .regex(/^\d{10}$/, "Mobile number must be exactly 10 digits");

export const optionalPhoneSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    const trimmed = (v ?? "").trim();
    return trimmed.length > 0 ? trimmed : null;
  })
  .refine((v) => v === null || /^\d{10}$/.test(v), {
    message: "Mobile number must be exactly 10 digits",
  });

const optionalTrimmedString = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null));

const optionalPositiveNumber = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((val) => {
    if (val === null || val === undefined || val === "") return null;
    const num = typeof val === "number" ? val : Number(val);
    return Number.isFinite(num) ? num : NaN;
  })
  .refine((val) => val === null || (!Number.isNaN(val) && val >= 0), {
    message: "Amount must be a non-negative number",
  });

const optionalPositiveInt = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((val) => {
    if (val === null || val === undefined || val === "") return null;
    const num = typeof val === "number" ? val : Number(val);
    return Number.isInteger(num) ? num : NaN;
  })
  .refine((val) => val === null || (!Number.isNaN(val) && val >= 1), {
    message: "Limit must be a whole number of at least 1",
  });

const requiredPaidMonths = z
  .union([z.number(), z.string()])
  .transform((val) => {
    if (val === "" || val === null || val === undefined) return NaN;
    const num = typeof val === "number" ? val : Number(val);
    return Number.isInteger(num) ? num : NaN;
  })
  .refine((val) => !Number.isNaN(val) && val >= 1 && val <= 120, {
    message: "Paid subscription months is required (enter a whole number between 1 and 120)",
  });

export const loginSchema = z.object({
  username: z.string().trim().min(2, "Username is required").max(80),
  password: z.string().min(4, "Password is required").max(128),
  portalRole: z
    .enum([
      ROLES.SUPER_ADMIN,
      ROLES.HOSPITAL_ADMIN,
      ROLES.RECEPTIONIST,
      ROLES.DOCTOR,
      ROLES.PHARMACY_USER,
      ROLES.LAB_USER,
    ])
    .optional(),
});

export const setupSuperAdminSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required").max(100),
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(60)
    .regex(/^[a-zA-Z0-9._-]+$/, "Username may only contain letters, numbers, . _ -"),
  email: optionalTrimmedString(120),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters")
      .max(128),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "New password and confirmation do not match",
    path: ["confirmPassword"],
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: "New password must be different from current password",
    path: ["newPassword"],
  });

export const createHospitalSchema = z.object({
  name: z.string().trim().min(2, "Hospital name is required").max(120),
  code: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[a-zA-Z0-9-]+$/, "Code can only contain letters, numbers, and hyphens")
    .transform((s) => s.toUpperCase())
    .optional(),
  uhidPrefix: z
    .string()
    .trim()
    .max(15)
    .optional()
    .transform((s) => (s && s.length > 0 ? s.toUpperCase() : undefined)),
  address: optionalTrimmedString(300),
  phone: optionalPhoneSchema.optional(),
  email: optionalTrimmedString(120),
  tagline: optionalTrimmedString(160),
  registrationNo: optionalTrimmedString(80),
  dailyOpLimit: optionalPositiveInt.optional(),
  dailyIpLimit: optionalPositiveInt.optional(),
  paidMonths: requiredPaidMonths,
  initialPaymentAmount: optionalPositiveNumber.optional(),
  pharmacyMode: z
    .enum([PHARMACY_MODE.REFERRALS, PHARMACY_MODE.MANAGEMENT])
    .optional()
    .default(PHARMACY_MODE.REFERRALS),
  consultancyEnabled: z.boolean().optional().default(true),
  adminFullName: z.string().trim().min(2, "Admin name is required").max(100),
  adminUsername: z
    .string()
    .trim()
    .min(3, "Admin username must be at least 3 characters")
    .max(60)
    .regex(/^[a-zA-Z0-9._-]+$/, "Username may only contain letters, numbers, . _ -"),
  adminEmail: optionalTrimmedString(120),
  adminPhone: optionalPhoneSchema.optional(),
  adminPassword: z
    .string()
    .min(8, "Admin password must be at least 8 characters")
    .max(128),
});

export const updateHospitalSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  address: optionalTrimmedString(300),
  phone: optionalPhoneSchema.optional(),
  email: optionalTrimmedString(120),
  tagline: optionalTrimmedString(160),
  registrationNo: optionalTrimmedString(80),
  uhidPrefix: z
    .string()
    .trim()
    .min(2)
    .max(15)
    .regex(/^[a-zA-Z0-9-]+$/)
    .transform((s) => s.toUpperCase())
    .optional(),
  defaultConsultationFee: optionalPositiveNumber.optional(),
  dailyOpLimit: optionalPositiveInt.optional(),
  dailyIpLimit: optionalPositiveInt.optional(),
  pharmacyMode: z
    .enum([PHARMACY_MODE.REFERRALS, PHARMACY_MODE.MANAGEMENT])
    .optional(),
  consultancyEnabled: z.boolean().optional(),
  logoDataUrl: z
    .string()
    .max(600000, "Logo image is too large (max ~450KB)")
    .optional()
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
    .refine(
      (v) =>
        v === null ||
        /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v),
      {
        message: "Logo must be a valid PNG, JPEG, WebP, or GIF image",
      }
    ),
});

export const hospitalStatusSchema = z.object({
  isActive: z.boolean(),
  reason: optionalTrimmedString(300),
});

export const resetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),
});

export const purgeHospitalDataSchema = z.object({
  from: z.string().trim().min(1, "Start date & time is required"),
  to: z.string().trim().min(1, "End date & time is required"),
  tzOffsetMinutes: z.number().finite().optional().nullable(),
  confirmPurge: z
    .boolean()
    .refine((v) => v === true, {
      message: "Please confirm permanent deletion for this timeframe",
    }),
});

export const createDoctorSchema = z
  .object({
    name: z.string().trim().min(2, "Doctor name is required").max(100),
    specialty: optionalTrimmedString(100),
    qualification: optionalTrimmedString(100),
    phone: optionalPhoneSchema.optional(),
    consultationFee: optionalPositiveNumber.optional(),
    username: z
      .string()
      .trim()
      .max(60)
      .optional()
      .nullable()
      .transform((v) => (v && v.length > 0 ? v : null))
      .refine(
        (v) => v === null || (v.length >= 3 && /^[a-zA-Z0-9._-]+$/.test(v)),
        {
          message:
            "Username must be at least 3 characters and contain only letters, numbers, . _ -",
        }
      ),
    password: z
      .string()
      .max(128)
      .optional()
      .nullable()
      .transform((v) => (v && v.length > 0 ? v : null))
      .refine((v) => v === null || v.length >= 8, {
        message: "Password must be at least 8 characters",
      }),
  })
  .refine(
    (d) => (d.username === null && d.password === null) || (d.username !== null && d.password !== null),
    {
      message: "Both username and password are required to create a Doctor Portal login",
      path: ["password"],
    }
  );

export const createPatientWithOpSchema = z.object({
  existingPatientId: optionalTrimmedString(64),
  fullName: z.string().trim().min(2, "Patient name is required").max(120),
  age: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      return Number.isInteger(n) ? n : NaN;
    })
    .refine((v) => v === null || (!Number.isNaN(v) && v >= 0 && v <= 130), {
      message: "Age must be between 0 and 130",
    }),
  dateOfBirth: optionalTrimmedString(40),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  phone: requiredPhoneSchema,
  address: optionalTrimmedString(300),
  bloodGroup: optionalTrimmedString(12),
  emergencyContact: optionalTrimmedString(80),
  doctorId: z
    .string()
    .trim()
    .min(1, "Please select a consulting doctor before registering a patient."),
  doctorName: optionalTrimmedString(100),
  department: optionalTrimmedString(100),
  visitDate: optionalTrimmedString(40),
  reasonForVisit: optionalTrimmedString(400),
  notes: optionalTrimmedString(1000),
  registrationFee: optionalPositiveNumber.optional(),
  consultationFee: optionalPositiveNumber.optional(),
  paymentMode: optionalTrimmedString(40),
  paymentStatus: z.enum(["PAID", "PENDING", "NO_CHARGE"]).optional(),
  tzOffsetMinutes: z.number().int().min(-840).max(840).optional(),
});

export const updatePatientSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  age: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      return Number.isInteger(n) ? n : NaN;
    })
    .refine((v) => v === null || (!Number.isNaN(v) && v >= 0 && v <= 130), {
      message: "Age must be between 0 and 130",
    }),
  dateOfBirth: optionalTrimmedString(40),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  phone: requiredPhoneSchema,
  address: optionalTrimmedString(300),
  bloodGroup: optionalTrimmedString(12),
  emergencyContact: optionalTrimmedString(80),
});

export const bedSchema = z.object({
  bedNumber: z.string().trim().min(1, "Bed number is required").max(30),
  ward: z.string().trim().min(1, "Ward or room is required").max(80),
  category: optionalTrimmedString(60),
  notes: optionalTrimmedString(250),
  status: z.enum(["AVAILABLE", "INACTIVE"]).optional(),
});

export const admitPatientSchema = z.object({
  patientId: z.string().trim().min(1, "Patient selection is required"),
  bedId: z.string().trim().min(1, "Available bed selection is required"),
  doctorId: optionalTrimmedString(64),
  doctorName: optionalTrimmedString(100),
  admittedAt: optionalTrimmedString(40),
  chargeAmount: optionalPositiveNumber.optional(),
  paymentMode: z.enum(["CASH", "UPI", "CARD"]).default("CASH"),
  stayDays: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === "" || v === null || v === undefined) return 1;
      return Number(v);
    })
    .refine((v) => Number.isInteger(v) && v >= 1 && v <= 365, {
      message: "Stay duration must be a whole number of days between 1 and 365",
    }),
  admissionNotes: optionalTrimmedString(1000),
});

export const extendIpStaySchema = z.object({
  additionalDays: z
    .union([z.number(), z.string()])
    .transform((v) => Number(v))
    .refine((v) => Number.isInteger(v) && v >= 1 && v <= 365, {
      message: "Extension duration must be between 1 and 365 days",
    }),
  amountCollected: z
    .union([z.number(), z.string()])
    .transform((v) => (v === "" ? NaN : Number(v)))
    .refine((v) => Number.isFinite(v) && v >= 0 && v <= 100_000_000, {
      message: "Amount collected must be a valid non-negative number",
    }),
  paymentMode: z.enum(["CASH", "UPI", "CARD"]).default("CASH"),
  reason: z.string().trim().min(2, "Reason for extension is required").max(400),
});

export const transferBedSchema = z.object({
  toBedId: z.string().trim().min(1, "Target bed is required"),
  reason: optionalTrimmedString(300),
});

export const dischargePatientSchema = z.object({
  dischargeNotes: optionalTrimmedString(1000),
  dischargedAt: optionalTrimmedString(40),
});

export const medicineCatalogSchema = z.object({
  name: z.string().trim().min(1, "Medicine name is required").max(160),
  description: optionalTrimmedString(400),
  price: optionalPositiveNumber.optional(),
});

export const labTestCatalogSchema = z.object({
  name: z.string().trim().min(1, "Test name is required").max(160),
  description: optionalTrimmedString(400),
  price: optionalPositiveNumber.optional(),
});

export const createExternalPartnerSchema = z.object({
  organizationName: z.string().trim().min(2, "Name is required").max(140),
  contactPerson: z.string().trim().min(2, "Contact person is required").max(100),
  phone: requiredPhoneSchema,
  address: optionalTrimmedString(250),
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(60)
    .regex(/^[a-zA-Z0-9._-]+$/, "Username may only contain letters, numbers, . _ -"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export const extendHospitalPaymentSchema = z.object({
  hospitalId: z.string().trim().min(1, "Hospital selection is required"),
  durationValue: z
    .union([z.number(), z.string()])
    .transform((val) => (typeof val === "number" ? val : Number(val)))
    .refine(
      (val) => Number.isInteger(val) && val >= 1 && val <= 120,
      "Duration must be a whole number between 1 and 120"
    ),
  durationUnit: z.enum(["MONTHS", "YEARS"]).default("MONTHS"),
  amountCollected: z
    .union([z.number(), z.string()])
    .transform((val) => {
      if (val === "") return NaN;
      return typeof val === "number" ? val : Number(val);
    })
    .refine(
      (val) => Number.isFinite(val) && val >= 0 && val <= 100_000_000,
      "Amount collected must be a valid non-negative number"
    ),
  notes: optionalTrimmedString(300),
});

export const createStaffSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required").max(100),
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(60)
    .regex(/^[a-zA-Z0-9._-]+$/, "Username may only contain letters, numbers, . _ -"),
  email: optionalTrimmedString(120),
  phone: optionalPhoneSchema.optional(),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  role: z
    .enum([ROLES.RECEPTIONIST, ROLES.HOSPITAL_ADMIN])
    .default(ROLES.RECEPTIONIST),
});

export const createPharmacyReferralSchema = z.object({
  patientId: z.string().trim().min(1, "Patient is required"),
  pharmacyAccountId: z.string().trim().min(1, "Referral pharmacy is required"),
  opVisitId: optionalTrimmedString(64),
  ipAdmissionId: optionalTrimmedString(64),
  notes: optionalTrimmedString(800),
  overrideTotalAmount: optionalPositiveNumber.optional(),
  items: z
    .array(
      z.object({
        medicineCatalogId: z.string().trim().min(1),
        quantity: z.number().int().min(1).max(1000),
        unitPriceOverride: optionalPositiveNumber.optional(),
        dosageInstructions: optionalTrimmedString(200),
      })
    )
    .min(1, "Select at least one medicine"),
});

export const createLabReferralSchema = z.object({
  patientId: z.string().trim().min(1, "Patient is required"),
  labAccountId: z.string().trim().min(1, "Referral laboratory is required"),
  opVisitId: optionalTrimmedString(64),
  ipAdmissionId: optionalTrimmedString(64),
  notes: optionalTrimmedString(800),
  overrideTotalAmount: optionalPositiveNumber.optional(),
  items: z
    .array(
      z.object({
        labTestCatalogId: z.string().trim().min(1),
        unitPriceOverride: optionalPositiveNumber.optional(),
      })
    )
    .min(1, "Select at least one laboratory test"),
});

export const completeReferralSchema = z.object({
  totalAmount: optionalPositiveNumber.optional(),
});

// ---------------------------------------------------------------------------
// Full Pharmacy Management Schemas (Add Medicine, Stock Edit, Sell Medicine)
// ---------------------------------------------------------------------------

const nonNegativeInt = z
  .union([z.number(), z.string()])
  .transform((val) => {
    if (val === "" || val === null || val === undefined) return 0;
    const num = typeof val === "number" ? val : Number(val);
    return Number.isInteger(num) ? num : NaN;
  })
  .refine((val) => !Number.isNaN(val) && val >= 0 && val <= 10_000_000, {
    message: "Must be a non-negative whole number",
  });

const nonNegativeNum = z
  .union([z.number(), z.string()])
  .transform((val) => {
    if (val === "" || val === null || val === undefined) return 0;
    const num = typeof val === "number" ? val : Number(val);
    return Number.isFinite(num) ? num : NaN;
  })
  .refine((val) => !Number.isNaN(val) && val >= 0 && val <= 10_000_000, {
    message: "Must be a valid non-negative number",
  });

export const addPharmacyMedicineSchema = z
  .object({
    medicineId: optionalTrimmedString(64),
    name: z.string().trim().min(1, "Medicine name is required").max(160),
    packagingType: z.enum(["SHEET", "INDIVIDUAL"]).default("SHEET"),
    unitsPerSheet: z
      .union([z.number(), z.string()])
      .transform((v) => {
        if (v === "" || v === null || v === undefined) return 1;
        return Number(v);
      })
      .refine((v) => Number.isInteger(v) && v >= 1 && v <= 1000, {
        message: "Units per sheet must be a whole number between 1 and 1000",
      }),
    minStock: nonNegativeInt.default(0),
    unitSellingPrice: nonNegativeNum,
    sheetSellingPrice: nonNegativeNum,
    hsnCode: optionalTrimmedString(40),
    gstPercent: z
      .union([z.number(), z.string(), z.null(), z.undefined()])
      .transform((v) => {
        if (v === "" || v === null || v === undefined) return 0;
        return Number(v);
      })
      .refine((v) => Number.isFinite(v) && v >= 0 && v <= 100, {
        message: "GST percentage must be between 0 and 100",
      }),
    prescriptionRequired: z.boolean().default(false),
    placement: optionalTrimmedString(120),
    sheetsCount: nonNegativeInt.default(0),
    singleUnitsCount: nonNegativeInt.default(0),
    batchNumber: z.string().trim().min(1, "Batch number is required").max(80),
    expiryMonth: z
      .union([z.number(), z.string()])
      .transform((v) => Number(v))
      .refine((v) => Number.isInteger(v) && v >= 1 && v <= 12, {
        message: "Expiry month must be between 01 and 12",
      }),
    expiryYear: z
      .union([z.number(), z.string()])
      .transform((v) => Number(v))
      .refine((v) => Number.isInteger(v) && v >= 2000 && v <= 2150, {
        message: "Expiry year must be a valid 4-digit year",
      }),
  })
  .refine(
    (d) => {
      const unitsPerSheet = d.packagingType === "INDIVIDUAL" ? 1 : d.unitsPerSheet;
      const sheets = d.packagingType === "INDIVIDUAL" ? 0 : d.sheetsCount;
      const totalUnits = sheets * unitsPerSheet + d.singleUnitsCount;
      return totalUnits >= 0;
    },
    { message: "Quantity must be non-negative" }
  );

export const updatePharmacyMedicineSchema = z.object({
  name: z.string().trim().min(1, "Medicine name is required").max(160),
  packagingType: z.enum(["SHEET", "INDIVIDUAL"]),
  unitsPerSheet: z
    .union([z.number(), z.string()])
    .transform((v) => Number(v))
    .refine((v) => Number.isInteger(v) && v >= 1 && v <= 1000, {
      message: "Units per sheet must be between 1 and 1000",
    }),
  minStock: nonNegativeInt.default(0),
  unitSellingPrice: nonNegativeNum,
  sheetSellingPrice: nonNegativeNum,
  hsnCode: optionalTrimmedString(40),
  gstPercent: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => (v === "" || v === null || v === undefined ? 0 : Number(v)))
    .refine((v) => Number.isFinite(v) && v >= 0 && v <= 100, {
      message: "GST percentage must be between 0 and 100",
    }),
  prescriptionRequired: z.boolean().default(false),
  placement: optionalTrimmedString(120),
  batches: z
    .array(
      z.object({
        id: optionalTrimmedString(64),
        batchNumber: z.string().trim().min(1, "Batch number is required").max(80),
        expiryMonth: z
          .union([z.number(), z.string()])
          .transform((v) => Number(v))
          .refine((v) => Number.isInteger(v) && v >= 1 && v <= 12, {
            message: "Expiry month must be 01-12",
          }),
        expiryYear: z
          .union([z.number(), z.string()])
          .transform((v) => Number(v))
          .refine((v) => Number.isInteger(v) && v >= 2000 && v <= 2150, {
            message: "Expiry year must be valid",
          }),
        quantityUnits: nonNegativeInt,
        delete: z.boolean().optional(),
      })
    )
    .optional(),
});

export const createPharmacySaleSchema = z.object({
  patientName: z.string().trim().min(2, "Patient name is required").max(120),
  patientPhone: requiredPhoneSchema,
  doctorId: optionalTrimmedString(64),
  doctorName: z.string().trim().min(2, "Reference doctor is required").max(120),
  paymentMode: z.enum(["CASH", "UPI", "CARD"]).default("CASH"),
  prescriptionId: optionalTrimmedString(64),
  items: z
    .array(
      z.object({
        medicineId: z.string().trim().min(1),
        batchId: z.string().trim().min(1),
        sellMode: z.enum(["UNIT", "SHEET"]).default("UNIT"),
        quantity: z
          .union([z.number(), z.string()])
          .transform((v) => Number(v))
          .refine((v) => Number.isInteger(v) && v >= 1 && v <= 100_000, {
            message: "Quantity must be a positive whole number",
          }),
      })
    )
    .min(1, "Add at least one medicine to the cart before completing sale"),
});

export const consultancyPrescribeSchema = z.object({
  opVisitId: z.string().trim().min(1, "OP consultation visit is required"),
  pharmacyAccountId: optionalTrimmedString(64),
  notes: optionalTrimmedString(1000),
  items: z
    .array(
      z.object({
        pharmacyMedicineId: optionalTrimmedString(64),
        medicineCatalogId: optionalTrimmedString(64),
        medicineName: z.string().trim().min(1, "Medicine name is required").max(180),
        quantityUnits: z
          .union([z.number(), z.string()])
          .transform((v) => Number(v))
          .refine((v) => Number.isInteger(v) && v >= 1 && v <= 100_000, {
            message: "Quantity must be a whole number of at least 1 unit",
          }),
        dosageInstructions: optionalTrimmedString(300),
      })
    )
    .min(1, "Add at least one medicine to prescribe"),
});

export const consultancyLabReferSchema = z.object({
  opVisitId: z.string().trim().min(1, "OP consultation visit is required"),
  labAccountId: z.string().trim().min(1, "Please select a laboratory partner"),
  notes: optionalTrimmedString(1000),
  items: z
    .array(
      z.object({
        labTestCatalogId: optionalTrimmedString(64),
        testName: z.string().trim().min(1, "Laboratory test name is required").max(180),
      })
    )
    .min(1, "Add at least one laboratory test to refer"),
});
