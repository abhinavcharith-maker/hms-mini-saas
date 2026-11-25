-- CreateTable
CREATE TABLE "Hospital" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "logoDataUrl" TEXT,
    "tagline" TEXT,
    "registrationNo" TEXT,
    "defaultConsultationFee" REAL,
    "uhidPrefix" TEXT NOT NULL DEFAULT 'UHID',
    "nextUhidSeq" INTEGER NOT NULL DEFAULT 1,
    "nextOpSeq" INTEGER NOT NULL DEFAULT 1,
    "nextIpSeq" INTEGER NOT NULL DEFAULT 1,
    "nextPharmRefSeq" INTEGER NOT NULL DEFAULT 1,
    "nextLabRefSeq" INTEGER NOT NULL DEFAULT 1,
    "nextReceiptSeq" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT,
    "username" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "passwordChangedAt" DATETIME,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hospitalId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Session_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Doctor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specialty" TEXT,
    "qualification" TEXT,
    "phone" TEXT,
    "consultationFee" REAL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Doctor_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "uhid" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "age" INTEGER,
    "dateOfBirth" DATETIME,
    "gender" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "bloodGroup" TEXT,
    "emergencyContact" TEXT,
    "registeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Patient_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OpVisit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "visitNumber" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT,
    "doctorNameSnapshot" TEXT NOT NULL,
    "departmentSnapshot" TEXT,
    "visitDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reasonForVisit" TEXT,
    "notes" TEXT,
    "consultationFee" REAL,
    "registrationFee" REAL,
    "totalAmount" REAL,
    "paymentMode" TEXT,
    "paymentStatus" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OpVisit_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OpVisit_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OpVisit_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BillingReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "opVisitId" TEXT,
    "ipAdmissionId" TEXT,
    "hospitalNameSnapshot" TEXT NOT NULL,
    "hospitalAddressSnapshot" TEXT,
    "hospitalPhoneSnapshot" TEXT,
    "hospitalEmailSnapshot" TEXT,
    "hospitalLogoSnapshot" TEXT,
    "patientUhidSnapshot" TEXT NOT NULL,
    "patientNameSnapshot" TEXT NOT NULL,
    "visitSummarySnapshot" TEXT NOT NULL,
    "lineItemsJson" TEXT NOT NULL DEFAULT '[]',
    "totalAmount" REAL,
    "paymentMode" TEXT,
    "paymentStatus" TEXT,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedByUserId" TEXT,
    "issuedByNameSnapshot" TEXT NOT NULL,
    CONSTRAINT "BillingReceipt_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BillingReceipt_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BillingReceipt_opVisitId_fkey" FOREIGN KEY ("opVisitId") REFERENCES "OpVisit" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BillingReceipt_ipAdmissionId_fkey" FOREIGN KEY ("ipAdmissionId") REFERENCES "IpAdmission" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Bed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "bedNumber" TEXT NOT NULL,
    "ward" TEXT NOT NULL,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Bed_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IpAdmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "admissionNumber" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "bedId" TEXT,
    "doctorId" TEXT,
    "doctorNameSnapshot" TEXT NOT NULL,
    "wardSnapshot" TEXT NOT NULL,
    "bedNumberSnapshot" TEXT NOT NULL,
    "admittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dischargedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ADMITTED',
    "admissionNotes" TEXT,
    "dischargeNotes" TEXT,
    "admittedByUserId" TEXT,
    "dischargedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IpAdmission_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IpAdmission_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IpAdmission_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IpAdmission_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BedTransfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "ipAdmissionId" TEXT NOT NULL,
    "fromBedId" TEXT,
    "fromBedLabel" TEXT,
    "toBedId" TEXT NOT NULL,
    "toBedLabel" TEXT NOT NULL,
    "reason" TEXT,
    "transferredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transferredByUserId" TEXT,
    CONSTRAINT "BedTransfer_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BedTransfer_ipAdmissionId_fkey" FOREIGN KEY ("ipAdmissionId") REFERENCES "IpAdmission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MedicineCatalog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" REAL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MedicineCatalog_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PharmacyAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pharmacyName" TEXT NOT NULL,
    "contactPerson" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PharmacyAccount_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PharmacyAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PharmacyReferral" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "referralNumber" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "pharmacyAccountId" TEXT NOT NULL,
    "opVisitId" TEXT,
    "ipAdmissionId" TEXT,
    "patientNameSnapshot" TEXT NOT NULL,
    "patientUhidSnapshot" TEXT NOT NULL,
    "patientPhoneSnapshot" TEXT,
    "pharmacyNameSnapshot" TEXT NOT NULL,
    "notes" TEXT,
    "totalAmount" REAL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "referredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referredByUserId" TEXT NOT NULL,
    "completedAt" DATETIME,
    "completedByUserId" TEXT,
    "completedByNameSnapshot" TEXT,
    "cancelledAt" DATETIME,
    "cancelledByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PharmacyReferral_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PharmacyReferral_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PharmacyReferral_pharmacyAccountId_fkey" FOREIGN KEY ("pharmacyAccountId") REFERENCES "PharmacyAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PharmacyReferral_opVisitId_fkey" FOREIGN KEY ("opVisitId") REFERENCES "OpVisit" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PharmacyReferral_ipAdmissionId_fkey" FOREIGN KEY ("ipAdmissionId") REFERENCES "IpAdmission" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PharmacyReferralItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "medicineCatalogId" TEXT,
    "medicineNameSnapshot" TEXT NOT NULL,
    "descriptionSnapshot" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPriceSnapshot" REAL,
    "lineTotal" REAL,
    "dosageInstructions" TEXT,
    CONSTRAINT "PharmacyReferralItem_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "PharmacyReferral" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PharmacyReferralItem_medicineCatalogId_fkey" FOREIGN KEY ("medicineCatalogId") REFERENCES "MedicineCatalog" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LabTestCatalog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" REAL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LabTestCatalog_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LabAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "labName" TEXT NOT NULL,
    "contactPerson" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LabAccount_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LabAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LabReferral" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "referralNumber" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "labAccountId" TEXT NOT NULL,
    "opVisitId" TEXT,
    "ipAdmissionId" TEXT,
    "patientNameSnapshot" TEXT NOT NULL,
    "patientUhidSnapshot" TEXT NOT NULL,
    "patientPhoneSnapshot" TEXT,
    "labNameSnapshot" TEXT NOT NULL,
    "notes" TEXT,
    "totalAmount" REAL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "referredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referredByUserId" TEXT NOT NULL,
    "completedAt" DATETIME,
    "completedByUserId" TEXT,
    "completedByNameSnapshot" TEXT,
    "cancelledAt" DATETIME,
    "cancelledByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LabReferral_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LabReferral_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LabReferral_labAccountId_fkey" FOREIGN KEY ("labAccountId") REFERENCES "LabAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LabReferral_opVisitId_fkey" FOREIGN KEY ("opVisitId") REFERENCES "OpVisit" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LabReferral_ipAdmissionId_fkey" FOREIGN KEY ("ipAdmissionId") REFERENCES "IpAdmission" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LabReferralItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "labTestCatalogId" TEXT,
    "testNameSnapshot" TEXT NOT NULL,
    "descriptionSnapshot" TEXT,
    "unitPriceSnapshot" REAL,
    CONSTRAINT "LabReferralItem_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "LabReferral" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LabReferralItem_labTestCatalogId_fkey" FOREIGN KEY ("labTestCatalogId") REFERENCES "LabTestCatalog" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "hospitalId" TEXT,
    "actorUserId" TEXT,
    "actorUsername" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "patientId" TEXT,
    "patientUhid" TEXT,
    "referenceId" TEXT,
    "details" TEXT NOT NULL,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "targetRole" TEXT NOT NULL DEFAULT 'HOSPITAL_ADMIN',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'SYSTEM',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BackupRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT,
    "operation" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "backupVersion" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "summaryJson" TEXT NOT NULL,
    "performedByUserId" TEXT NOT NULL,
    "performedByUsername" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BackupRecord_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Hospital_code_key" ON "Hospital"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Hospital_slug_key" ON "Hospital"("slug");

-- CreateIndex
CREATE INDEX "Hospital_isActive_idx" ON "Hospital"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_hospitalId_role_idx" ON "User"("hospitalId", "role");

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_hospitalId_idx" ON "Session"("hospitalId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Doctor_hospitalId_isActive_idx" ON "Doctor"("hospitalId", "isActive");

-- CreateIndex
CREATE INDEX "Patient_hospitalId_fullName_idx" ON "Patient"("hospitalId", "fullName");

-- CreateIndex
CREATE INDEX "Patient_hospitalId_phone_idx" ON "Patient"("hospitalId", "phone");

-- CreateIndex
CREATE INDEX "Patient_hospitalId_registeredAt_idx" ON "Patient"("hospitalId", "registeredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_hospitalId_uhid_key" ON "Patient"("hospitalId", "uhid");

-- CreateIndex
CREATE INDEX "OpVisit_hospitalId_visitDate_idx" ON "OpVisit"("hospitalId", "visitDate");

-- CreateIndex
CREATE INDEX "OpVisit_patientId_visitDate_idx" ON "OpVisit"("patientId", "visitDate");

-- CreateIndex
CREATE UNIQUE INDEX "OpVisit_hospitalId_visitNumber_key" ON "OpVisit"("hospitalId", "visitNumber");

-- CreateIndex
CREATE INDEX "BillingReceipt_hospitalId_issuedAt_idx" ON "BillingReceipt"("hospitalId", "issuedAt");

-- CreateIndex
CREATE INDEX "BillingReceipt_patientId_issuedAt_idx" ON "BillingReceipt"("patientId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingReceipt_hospitalId_receiptNumber_key" ON "BillingReceipt"("hospitalId", "receiptNumber");

-- CreateIndex
CREATE INDEX "Bed_hospitalId_status_idx" ON "Bed"("hospitalId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Bed_hospitalId_bedNumber_key" ON "Bed"("hospitalId", "bedNumber");

-- CreateIndex
CREATE INDEX "IpAdmission_hospitalId_status_idx" ON "IpAdmission"("hospitalId", "status");

-- CreateIndex
CREATE INDEX "IpAdmission_patientId_admittedAt_idx" ON "IpAdmission"("patientId", "admittedAt");

-- CreateIndex
CREATE INDEX "IpAdmission_bedId_status_idx" ON "IpAdmission"("bedId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "IpAdmission_hospitalId_admissionNumber_key" ON "IpAdmission"("hospitalId", "admissionNumber");

-- CreateIndex
CREATE INDEX "BedTransfer_hospitalId_transferredAt_idx" ON "BedTransfer"("hospitalId", "transferredAt");

-- CreateIndex
CREATE INDEX "BedTransfer_ipAdmissionId_transferredAt_idx" ON "BedTransfer"("ipAdmissionId", "transferredAt");

-- CreateIndex
CREATE INDEX "MedicineCatalog_hospitalId_isActive_name_idx" ON "MedicineCatalog"("hospitalId", "isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyAccount_userId_key" ON "PharmacyAccount"("userId");

-- CreateIndex
CREATE INDEX "PharmacyAccount_hospitalId_isActive_idx" ON "PharmacyAccount"("hospitalId", "isActive");

-- CreateIndex
CREATE INDEX "PharmacyReferral_hospitalId_status_referredAt_idx" ON "PharmacyReferral"("hospitalId", "status", "referredAt");

-- CreateIndex
CREATE INDEX "PharmacyReferral_pharmacyAccountId_status_referredAt_idx" ON "PharmacyReferral"("pharmacyAccountId", "status", "referredAt");

-- CreateIndex
CREATE INDEX "PharmacyReferral_patientId_referredAt_idx" ON "PharmacyReferral"("patientId", "referredAt");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyReferral_hospitalId_referralNumber_key" ON "PharmacyReferral"("hospitalId", "referralNumber");

-- CreateIndex
CREATE INDEX "PharmacyReferralItem_referralId_idx" ON "PharmacyReferralItem"("referralId");

-- CreateIndex
CREATE INDEX "PharmacyReferralItem_hospitalId_idx" ON "PharmacyReferralItem"("hospitalId");

-- CreateIndex
CREATE INDEX "LabTestCatalog_hospitalId_isActive_name_idx" ON "LabTestCatalog"("hospitalId", "isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "LabAccount_userId_key" ON "LabAccount"("userId");

-- CreateIndex
CREATE INDEX "LabAccount_hospitalId_isActive_idx" ON "LabAccount"("hospitalId", "isActive");

-- CreateIndex
CREATE INDEX "LabReferral_hospitalId_status_referredAt_idx" ON "LabReferral"("hospitalId", "status", "referredAt");

-- CreateIndex
CREATE INDEX "LabReferral_labAccountId_status_referredAt_idx" ON "LabReferral"("labAccountId", "status", "referredAt");

-- CreateIndex
CREATE INDEX "LabReferral_patientId_referredAt_idx" ON "LabReferral"("patientId", "referredAt");

-- CreateIndex
CREATE UNIQUE INDEX "LabReferral_hospitalId_referralNumber_key" ON "LabReferral"("hospitalId", "referralNumber");

-- CreateIndex
CREATE INDEX "LabReferralItem_referralId_idx" ON "LabReferralItem"("referralId");

-- CreateIndex
CREATE INDEX "LabReferralItem_hospitalId_idx" ON "LabReferralItem"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_eventId_key" ON "AuditLog"("eventId");

-- CreateIndex
CREATE INDEX "AuditLog_hospitalId_createdAt_idx" ON "AuditLog"("hospitalId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_patientId_createdAt_idx" ON "AuditLog"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actionType_idx" ON "AuditLog"("actionType");

-- CreateIndex
CREATE INDEX "Notification_hospitalId_isRead_createdAt_idx" ON "Notification"("hospitalId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "BackupRecord_hospitalId_createdAt_idx" ON "BackupRecord"("hospitalId", "createdAt");
