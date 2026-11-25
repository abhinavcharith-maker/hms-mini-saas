import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import {
  checkLoginRateLimit,
  clearLoginAttempts,
  computeSha256,
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  needsPasswordRehash,
  recordFailedLoginAttempt,
  verifyPassword,
} from "@/lib/security";
import {
  admitPatientSchema,
  createMedicineOrLabSchemaHelper,
} from "./test-helpers";
import {
  addPharmacyMedicineSchema,
  admitPatientSchema as validatorAdmitSchema,
  createHospitalSchema,
  createPatientWithOpSchema,
  createPharmacySaleSchema,
  extendHospitalPaymentSchema,
  extendIpStaySchema,
  labTestCatalogSchema,
  medicineCatalogSchema,
  updateHospitalSchema,
} from "@/lib/validators";
import { parseSafeTzOffset } from "@/lib/datetime";
import {
  BACKUP_FORMAT,
  BACKUP_SCHEMA_VERSION,
  PHARMACY_MODE,
  PORTAL_LOGIN_OPTIONS,
  ROLES,
} from "@/lib/constants";
import { validateBackupPayload } from "@/lib/backup";
import { formatMaintenanceMessage } from "@/lib/maintenance";
import { sanitizePdfText } from "@/lib/hospital-pdf";
import {
  addCalendarMonths,
  computeNewSubscriptionExpiry,
  evaluateHospitalPaymentState,
  formatInrAmount,
} from "@/lib/payments";
import {
  formatQuantityRatio,
  formatStockBreakdown,
  getBatchExpiryStatus,
  parseMonthYearInput,
  pickDefaultSellBatch,
  sortBatchesByExpiryPriority,
} from "@/lib/pharmacy-utils";
import { smartMatchMedicine } from "@/lib/gemini-bill-scanner";
import {
  DEFAULT_GEMINI_MODEL,
  decryptSecretValue,
  encryptSecretValue,
  maskApiKey,
} from "@/lib/platform-config";

describe("Security & Cryptography Helpers", () => {
  it("hashes and verifies passwords via memory-hard peppered scrypt with legacy bcrypt upgrade support", async () => {
    const plain = "VerdantCare#2026!";
    const hash = await hashPassword(plain);
    expect(hash).not.toBe(plain);
    expect(hash.startsWith("$scrypt$v1$")).toBe(true);
    expect(needsPasswordRehash(hash)).toBe(false);
    expect(await verifyPassword(plain, hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);

    // Legacy bcrypt hash still verifies cleanly and is flagged for transparent upgrade on login
    const legacyBcrypt = await bcrypt.hash(plain, 8);
    expect(needsPasswordRehash(legacyBcrypt)).toBe(true);
    expect(await verifyPassword(plain, legacyBcrypt)).toBe(true);
    expect(await verifyPassword("wrong-password", legacyBcrypt)).toBe(false);
  });

  it("hashes session tokens deterministically via HMAC-SHA256", () => {
    const token = generateSessionToken();
    expect(token).toHaveLength(64);
    const h1 = hashSessionToken(token);
    const h2 = hashSessionToken(token);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(token);
  });

  it("enforces sliding-window login rate limits after 10 failures", () => {
    const key = `127.0.0.1:ratelimit_user_${Date.now()}`;
    expect(checkLoginRateLimit(key).allowed).toBe(true);
    for (let i = 0; i < 10; i++) {
      recordFailedLoginAttempt(key);
    }
    const blocked = checkLoginRateLimit(key);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    clearLoginAttempts(key);
    expect(checkLoginRateLimit(key).allowed).toBe(true);
  });
});

describe("Validation Rules & Optional Referral Pricing", () => {
  it("allows empty/optional prices for medicines and lab tests", () => {
    const med = medicineCatalogSchema.parse({
      name: "Paracetamol 500mg",
      description: "",
      price: null,
    });
    expect(med.price).toBeNull();
    expect(med.description).toBeNull();

    const lab = labTestCatalogSchema.parse({
      name: "Complete Blood Count",
      price: "",
    });
    expect(lab.price).toBeNull();
  });

  it("rejects negative prices", () => {
    expect(() =>
      medicineCatalogSchema.parse({ name: "Test", price: -10 })
    ).toThrow();
  });

  it("validates patient registration without inventing fees, requires consulting doctor, and enforces 10-digit mobile numbers", () => {
    const op = createPatientWithOpSchema.parse({
      fullName: "Meera Devi",
      age: 34,
      gender: "FEMALE",
      phone: "9876543210",
      doctorId: "doc_1",
    });
    expect(op.registrationFee ?? null).toBeNull();
    expect(op.consultationFee ?? null).toBeNull();
    expect(op.phone).toBe("9876543210");
    expect(op.doctorId).toBe("doc_1");

    // Must fail when consulting doctor is not selected
    expect(() =>
      createPatientWithOpSchema.parse({
        fullName: "Meera Devi",
        age: 34,
        gender: "FEMALE",
        phone: "9876543210",
      })
    ).toThrow();
    expect(() =>
      createPatientWithOpSchema.parse({
        fullName: "Meera Devi",
        age: 34,
        gender: "FEMALE",
        phone: "9876543210",
        doctorId: "",
      })
    ).toThrow();

    for (const invalidPhone of ["987654321", "98765432101", "+91 9876543210", "98765abcde"]) {
      expect(() =>
        createPatientWithOpSchema.parse({
          fullName: "Meera Devi",
          gender: "FEMALE",
          phone: invalidPhone,
          doctorId: "doc_1",
        })
      ).toThrow();
    }
  });

  it("validates bed admission required fields", () => {
    expect(() =>
      admitPatientSchema.parse({ patientId: "", bedId: "bed1" })
    ).toThrow();
    expect(() => createMedicineOrLabSchemaHelper()).not.toThrow();
  });
});

describe("Backup Format & Checksum Tamper Detection", () => {
  it("rejects corrupted or tampered backup checksums", async () => {
    const sampleBackup = {
      format: BACKUP_FORMAT,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      scope: "HOSPITAL",
      exportedAt: new Date().toISOString(),
      exportedBy: { username: "superadmin", fullName: "Platform Owner" },
      checksum: computeSha256("tampered-payload"),
      data: {
        hospitals: [
          {
            id: "hosp_1",
            code: "DEMO",
            name: "Demo Hospital",
            slug: "demo",
            uhidPrefix: "DEMO",
            nextUhidSeq: 1,
            nextOpSeq: 1,
            nextIpSeq: 1,
            nextPharmRefSeq: 1,
            nextLabRefSeq: 1,
            nextReceiptSeq: 1,
            isActive: true,
            deactivatedAt: null,
            createdAt: new Date().toISOString(),
          },
        ],
        users: [
          {
            id: "usr_1",
            hospitalId: "hosp_1",
            username: "demo_admin",
            fullName: "Admin",
            role: ROLES.HOSPITAL_ADMIN,
            isActive: true,
            passwordChangedAt: null,
            createdAt: new Date().toISOString(),
          },
        ],
        doctors: [],
        patients: [],
        opVisits: [],
        billingReceipts: [],
        beds: [],
        ipAdmissions: [],
        bedTransfers: [],
        medicineCatalog: [],
        pharmacyAccounts: [],
        pharmacyReferrals: [],
        pharmacyReferralItems: [],
        labTestCatalog: [],
        labAccounts: [],
        labReferrals: [],
        labReferralItems: [],
        auditLogs: [],
        notifications: [],
      },
    };

    const result = await validateBackupPayload(sampleBackup);
    expect(result.valid).toBe(false);
    expect(result.checksumValid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes("checksum"))).toBe(
      true
    );
  });

  it("rejects unsafe logoDataUrl payloads such as SVG/script or external URLs", () => {
    expect(() =>
      updateHospitalSchema.parse({
        logoDataUrl: "data:image/svg+xml;base64,PHN2Zy8+",
      })
    ).toThrow();
    expect(() =>
      updateHospitalSchema.parse({
        logoDataUrl: "javascript:alert(1)",
      })
    ).toThrow();
    expect(() =>
      updateHospitalSchema.parse({
        logoDataUrl: "https://evil.example/logo.png",
      })
    ).toThrow();

    const ok = updateHospitalSchema.parse({
      logoDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    });
    expect(ok.logoDataUrl).toBe("data:image/png;base64,iVBORw0KGgo=");
  });

  it("clamps tzOffset query values to valid UTC offset bounds", () => {
    expect(parseSafeTzOffset("-330")).toBe(-330);
    expect(parseSafeTzOffset("999999999")).toBe(840);
    expect(parseSafeTzOffset("-999999999")).toBe(-840);
    expect(parseSafeTzOffset("not-a-number", 0)).toBe(0);
    expect(parseSafeTzOffset(null, null)).toBeNull();
  });

  it("formats maintenance status message clearly with reason and resume timestamp", () => {
    const msg = formatMaintenanceMessage({
      active: true,
      reason: "Database upgrade in progress",
      startsAt: "2026-11-24T06:00:00.000Z",
      endsAt: "2026-11-24T07:00:00.000Z",
      activatedByUsername: "superadmin",
      activatedAt: "2026-11-24T06:00:00.000Z",
    });
    expect(msg).toContain("Database upgrade in progress");
    expect(msg).toContain("Expected resume:");
  });

  it("sanitizes PDF text cleanly for built-in WinAnsi fonts", () => {
    expect(sanitizePdfText("Fee: ₹500.00 — ‘General’ • Ward")).toBe(
      "Fee: Rs. 500.00 - 'General' | Ward"
    );
    expect(sanitizePdfText(null)).toBe("-");
  });

  it("validates 6-portal configuration with Doctor role (without Manager) and validates hospital payment timelines", () => {
    expect(PORTAL_LOGIN_OPTIONS).toHaveLength(6);
    expect(Object.values(ROLES)).toContain("DOCTOR");
    expect(Object.values(ROLES)).not.toContain("MANAGER");

    const parsedHosp = createHospitalSchema.parse({
      name: "Greenfield Clinic",
      paidMonths: 6,
      initialPaymentAmount: 24000,
      adminFullName: "Dr. Patel",
      adminUsername: "greenfield_admin",
      adminPassword: "StrongPassword!1",
    });
    expect(parsedHosp.paidMonths).toBe(6);
    expect(parsedHosp.initialPaymentAmount).toBe(24000);

    // paidMonths is mandatory (>= 1) when creating a hospital
    expect(() =>
      createHospitalSchema.parse({
        name: "No Months Clinic",
        adminFullName: "Dr. Patel",
        adminUsername: "nomonths_admin",
        adminPassword: "StrongPassword!1",
      })
    ).toThrow();
    expect(() =>
      createHospitalSchema.parse({
        name: "Zero Months Clinic",
        paidMonths: 0,
        adminFullName: "Dr. Patel",
        adminUsername: "zeromonths_admin",
        adminPassword: "StrongPassword!1",
      })
    ).toThrow();

    const ext = extendHospitalPaymentSchema.parse({
      hospitalId: "hosp_123",
      durationValue: 2,
      durationUnit: "YEARS",
      amountCollected: "96000",
      notes: "2-year renewal",
    });
    expect(ext.durationValue).toBe(2);
    expect(ext.durationUnit).toBe("YEARS");
    expect(ext.amountCollected).toBe(96000);

    expect(() =>
      extendHospitalPaymentSchema.parse({
        hospitalId: "hosp_123",
        durationValue: 1,
        durationUnit: "MONTHS",
        amountCollected: -500,
      })
    ).toThrow();

    // Calendar month clamping (Jan 31 + 1 month -> Feb 28 in non-leap year)
    const jan31 = new Date("2026-01-31T10:00:00.000Z");
    const feb = addCalendarMonths(jan31, 1);
    expect(feb.getUTCMonth()).toBe(1);
    expect(feb.getUTCDate()).toBe(28);

    const now = new Date("2026-06-15T12:00:00.000Z");
    const pastExpiry = new Date("2026-06-10T12:00:00.000Z");
    const overdueState = evaluateHospitalPaymentState(pastExpiry, now);
    expect(overdueState.status).toBe("OVERDUE");
    expect(overdueState.isOverdue).toBe(true);
    expect(overdueState.daysOverdue).toBe(5);

    // Extending an expired hospital calculates from `now`
    const extendedFromExpired = computeNewSubscriptionExpiry(pastExpiry, 3, now);
    expect(extendedFromExpired.getUTCMonth()).toBe(8); // September

    expect(formatInrAmount(125000)).toBe("₹1,25,000");
  });

  it("validates Pharmacy Management mode, medicine/sale schemas & FEFO expiry ordering", () => {
    const mgmtHospital = createHospitalSchema.parse({
      name: "Emerald Pharmacy Hub",
      paidMonths: 12,
      pharmacyMode: PHARMACY_MODE.MANAGEMENT,
      adminFullName: "Admin",
      adminUsername: "eph_admin",
      adminPassword: "StrongPassword!1",
    });
    expect(mgmtHospital.pharmacyMode).toBe("MANAGEMENT");

    const defaultHospital = createHospitalSchema.parse({
      name: "Default Referrals Clinic",
      paidMonths: 3,
      adminFullName: "Admin",
      adminUsername: "drc_admin",
      adminPassword: "StrongPassword!1",
    });
    expect(defaultHospital.pharmacyMode).toBe("REFERRALS");

    const parsedMed = addPharmacyMedicineSchema.parse({
      name: "Dolo 650",
      packagingType: "SHEET",
      unitsPerSheet: 15,
      minStock: 30,
      unitSellingPrice: 2,
      sheetSellingPrice: 30,
      hsnCode: "3004",
      gstPercent: 12,
      prescriptionRequired: false,
      placement: "Rack C1",
      sheetsCount: 4,
      singleUnitsCount: 5,
      batchNumber: "DOLO-01",
      expiryMonth: 8,
      expiryYear: 2028,
    });
    expect(parsedMed.unitsPerSheet).toBe(15);
    expect(parsedMed.sheetsCount).toBe(4);

    // Sale requires patientName, 10-digit phone, doctorName & at least 1 item
    const parsedSale = createPharmacySaleSchema.parse({
      patientName: "Ravi Kumar",
      patientPhone: "9876543210",
      doctorId: "doc_1",
      doctorName: "Dr. Rao",
      paymentMode: "UPI",
      items: [{ medicineId: "m1", batchId: "b1", sellMode: "SHEET", quantity: 2 }],
    });
    expect(parsedSale.items).toHaveLength(1);
    expect(() =>
      createPharmacySaleSchema.parse({
        patientName: "Ravi Kumar",
        patientPhone: "9876543210",
        doctorName: "",
        items: [{ medicineId: "m1", batchId: "b1", sellMode: "UNIT", quantity: 1 }],
      })
    ).toThrow();

    // Month/Year parser handles MM/YYYY, YYYY-MM, and MM/YY
    expect(parseMonthYearInput("08/2028")).toEqual({ month: 8, year: 2028 });
    expect(parseMonthYearInput("2028-08")).toEqual({ month: 8, year: 2028 });
    expect(parseMonthYearInput("12/29")).toEqual({ month: 12, year: 2029 });
    expect(parseMonthYearInput("13/2028")).toBeNull();

    // FEFO sorting & default batch picker skips expired batches & picks earliest expiring valid batch with stock
    const now = new Date("2026-11-25T10:00:00.000Z");
    const sorted = sortBatchesByExpiryPriority(
      [
        { id: "late", expiryDate: "2028-10", expiryMonth: 10, expiryYear: 2028, quantityUnits: 50 },
        { id: "expired", expiryDate: "2025-05", expiryMonth: 5, expiryYear: 2025, quantityUnits: 20 },
        { id: "soon", expiryDate: "2027-01", expiryMonth: 1, expiryYear: 2027, quantityUnits: 12 },
      ],
      now
    );
    expect(sorted.map((b) => b.id)).toEqual(["expired", "soon", "late"]);
    expect(pickDefaultSellBatch(sorted)?.id).toBe("soon");
    expect(pickDefaultSellBatch(sorted, "late")?.id).toBe("late");
    expect(formatStockBreakdown(25, "SHEET", 10)).toBe("2 sh + 5 u (25 units)");
    expect(formatStockBreakdown(8, "INDIVIDUAL", 1)).toBe("8 units");

    // Receipt quantity ratio ("sheets : units")
    expect(formatQuantityRatio(20, 10)).toBe("2 : 0");
    expect(formatQuantityRatio(14, 10)).toBe("1 : 4");
    expect(formatQuantityRatio(5, 1)).toBe("0 : 5");

    // Exact 3-month calendar expiry rule: April 2027 expiry starts alerting Feb 1, 2027
    expect(getBatchExpiryStatus(4, 2027, new Date(2027, 0, 31, 12, 0, 0)).isExpiringSoon).toBe(false);
    const feb1 = getBatchExpiryStatus(4, 2027, new Date(2027, 1, 1, 9, 0, 0));
    expect(feb1.isExpiringSoon).toBe(true);
    expect(feb1.expiryBucket).toBe("MONTH_3");
    const mar1 = getBatchExpiryStatus(4, 2027, new Date(2027, 2, 1, 9, 0, 0));
    expect(mar1.isExpiringSoon).toBe(true);
    expect(mar1.expiryBucket).toBe("MONTH_2");
    const apr1 = getBatchExpiryStatus(4, 2027, new Date(2027, 3, 1, 9, 0, 0));
    expect(apr1.isExpiringSoon).toBe(true);
    expect(apr1.expiryBucket).toBe("MONTH_1");
    const may1 = getBatchExpiryStatus(4, 2027, new Date(2027, 4, 1, 0, 1, 0));
    expect(may1.isExpired).toBe(true);
    expect(may1.expiryBucket).toBe("EXPIRED");

    // Smart fuzzy matching for uploaded bills
    const match = smartMatchMedicine("DOLO 650 TAB", [
      { id: "m1", name: "Dolo 650mg" },
      { id: "m2", name: "Amoxicillin 500mg" },
    ]);
    expect(match.medicineId).toBe("m1");

    // IP admission defaults (1 day, CASH) & IP Stay Extension validation
    const parsedAdm = validatorAdmitSchema.parse({
      patientId: "pt_1",
      bedId: "bed_1",
    });
    expect(parsedAdm.stayDays).toBe(1);
    expect(parsedAdm.paymentMode).toBe("CASH");

    const parsedExt = extendIpStaySchema.parse({
      additionalDays: 2,
      amountCollected: 2500,
      paymentMode: "UPI",
      reason: "Post-op observation",
    });
    expect(parsedExt.additionalDays).toBe(2);
    expect(parsedExt.paymentMode).toBe("UPI");
    expect(() =>
      extendIpStaySchema.parse({
        additionalDays: 1,
        amountCollected: 1000,
        paymentMode: "CASH",
        reason: "",
      })
    ).toThrow();

    // Platform Gemini 3.8 Flash encrypted key storage & masking
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-3.8-flash");
    const sampleKey = "AIzaSyTestSecretKeyForGemini38Flash9999";
    const encrypted = encryptSecretValue(sampleKey);
    expect(encrypted).not.toContain(sampleKey);
    expect(decryptSecretValue(encrypted)).toBe(sampleKey);
    expect(maskApiKey(sampleKey)).toBe("AIza••••••••9999");
  });
});
