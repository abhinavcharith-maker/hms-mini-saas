-- CreateTable
CREATE TABLE "DoctorPrescription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "opVisitId" TEXT,
    "doctorId" TEXT,
    "doctorNameSnapshot" TEXT NOT NULL,
    "doctorQualificationSnapshot" TEXT,
    "patientNameSnapshot" TEXT NOT NULL,
    "patientUhidSnapshot" TEXT NOT NULL,
    "patientPhoneSnapshot" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "prescribedByUserId" TEXT,
    "prescribedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispensedAt" DATETIME,
    "dispensedSaleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DoctorPrescription_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DoctorPrescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DoctorPrescription_opVisitId_fkey" FOREIGN KEY ("opVisitId") REFERENCES "OpVisit" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DoctorPrescription_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DoctorPrescriptionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "pharmacyMedicineId" TEXT,
    "medicineNameSnapshot" TEXT NOT NULL,
    "quantityUnits" INTEGER NOT NULL,
    "dosageInstructions" TEXT,
    CONSTRAINT "DoctorPrescriptionItem_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DoctorPrescriptionItem_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "DoctorPrescription" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DoctorPrescriptionItem_pharmacyMedicineId_fkey" FOREIGN KEY ("pharmacyMedicineId") REFERENCES "PharmacyMedicine" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Doctor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "specialty" TEXT,
    "qualification" TEXT,
    "phone" TEXT,
    "consultationFee" REAL,
    "signatureDataUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Doctor_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Doctor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Doctor" ("consultationFee", "createdAt", "hospitalId", "id", "isActive", "name", "phone", "qualification", "signatureDataUrl", "specialty", "updatedAt") SELECT "consultationFee", "createdAt", "hospitalId", "id", "isActive", "name", "phone", "qualification", "signatureDataUrl", "specialty", "updatedAt" FROM "Doctor";
DROP TABLE "Doctor";
ALTER TABLE "new_Doctor" RENAME TO "Doctor";
CREATE UNIQUE INDEX "Doctor_userId_key" ON "Doctor"("userId");
CREATE INDEX "Doctor_hospitalId_isActive_idx" ON "Doctor"("hospitalId", "isActive");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "DoctorPrescription_hospitalId_status_prescribedAt_idx" ON "DoctorPrescription"("hospitalId", "status", "prescribedAt");

-- CreateIndex
CREATE INDEX "DoctorPrescription_patientId_prescribedAt_idx" ON "DoctorPrescription"("patientId", "prescribedAt");

-- CreateIndex
CREATE INDEX "DoctorPrescription_doctorId_prescribedAt_idx" ON "DoctorPrescription"("doctorId", "prescribedAt");

-- CreateIndex
CREATE INDEX "DoctorPrescriptionItem_prescriptionId_idx" ON "DoctorPrescriptionItem"("prescriptionId");

-- CreateIndex
CREATE INDEX "DoctorPrescriptionItem_hospitalId_pharmacyMedicineId_idx" ON "DoctorPrescriptionItem"("hospitalId", "pharmacyMedicineId");
