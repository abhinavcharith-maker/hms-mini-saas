-- AlterTable
ALTER TABLE "PharmacySale" ADD COLUMN "doctorQualificationSnapshot" TEXT;

-- CreateTable
CREATE TABLE "IpStayExtension" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "ipAdmissionId" TEXT NOT NULL,
    "additionalDays" INTEGER NOT NULL,
    "amountCollected" REAL NOT NULL DEFAULT 0,
    "paymentMode" TEXT NOT NULL DEFAULT 'CASH',
    "reason" TEXT NOT NULL,
    "previousCheckoutAt" DATETIME,
    "newCheckoutAt" DATETIME NOT NULL,
    "extendedByUserId" TEXT,
    "extendedByNameSnapshot" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IpStayExtension_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IpStayExtension_ipAdmissionId_fkey" FOREIGN KEY ("ipAdmissionId") REFERENCES "IpAdmission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PharmacyBillScanQuota" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PharmacyBillScanQuota_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PharmacyBillScanSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "fileName" TEXT NOT NULL,
    "itemsJson" TEXT NOT NULL DEFAULT '[]',
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PharmacyBillScanSession_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_IpAdmission" (
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
    "chargeAmount" REAL,
    "paymentMode" TEXT DEFAULT 'CASH',
    "stayDays" INTEGER NOT NULL DEFAULT 1,
    "expectedCheckoutAt" DATETIME,
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
INSERT INTO "new_IpAdmission" ("admissionNotes", "admissionNumber", "admittedAt", "admittedByUserId", "bedId", "bedNumberSnapshot", "chargeAmount", "createdAt", "dischargeNotes", "dischargedAt", "dischargedByUserId", "doctorId", "doctorNameSnapshot", "hospitalId", "id", "patientId", "status", "updatedAt", "wardSnapshot") SELECT "admissionNotes", "admissionNumber", "admittedAt", "admittedByUserId", "bedId", "bedNumberSnapshot", "chargeAmount", "createdAt", "dischargeNotes", "dischargedAt", "dischargedByUserId", "doctorId", "doctorNameSnapshot", "hospitalId", "id", "patientId", "status", "updatedAt", "wardSnapshot" FROM "IpAdmission";
DROP TABLE "IpAdmission";
ALTER TABLE "new_IpAdmission" RENAME TO "IpAdmission";
CREATE INDEX "IpAdmission_hospitalId_status_idx" ON "IpAdmission"("hospitalId", "status");
CREATE INDEX "IpAdmission_patientId_admittedAt_idx" ON "IpAdmission"("patientId", "admittedAt");
CREATE INDEX "IpAdmission_bedId_status_idx" ON "IpAdmission"("bedId", "status");
CREATE UNIQUE INDEX "IpAdmission_hospitalId_admissionNumber_key" ON "IpAdmission"("hospitalId", "admissionNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "IpStayExtension_hospitalId_createdAt_idx" ON "IpStayExtension"("hospitalId", "createdAt");

-- CreateIndex
CREATE INDEX "IpStayExtension_ipAdmissionId_createdAt_idx" ON "IpStayExtension"("ipAdmissionId", "createdAt");

-- CreateIndex
CREATE INDEX "PharmacyBillScanQuota_hospitalId_monthKey_idx" ON "PharmacyBillScanQuota"("hospitalId", "monthKey");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyBillScanQuota_hospitalId_monthKey_key" ON "PharmacyBillScanQuota"("hospitalId", "monthKey");

-- CreateIndex
CREATE INDEX "PharmacyBillScanSession_hospitalId_status_updatedAt_idx" ON "PharmacyBillScanSession"("hospitalId", "status", "updatedAt");
