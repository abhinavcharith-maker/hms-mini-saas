-- CreateTable
CREATE TABLE "PharmacyMedicine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "packagingType" TEXT NOT NULL DEFAULT 'SHEET',
    "unitsPerSheet" INTEGER NOT NULL DEFAULT 1,
    "minStock" INTEGER NOT NULL DEFAULT 0,
    "unitSellingPrice" REAL NOT NULL DEFAULT 0,
    "sheetSellingPrice" REAL NOT NULL DEFAULT 0,
    "hsnCode" TEXT,
    "gstPercent" REAL NOT NULL DEFAULT 0,
    "prescriptionRequired" BOOLEAN NOT NULL DEFAULT false,
    "placement" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PharmacyMedicine_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PharmacyBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "expiryMonth" INTEGER NOT NULL,
    "expiryYear" INTEGER NOT NULL,
    "expiryDate" TEXT NOT NULL,
    "quantityUnits" INTEGER NOT NULL DEFAULT 0,
    "initialQuantityUnits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PharmacyBatch_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PharmacyBatch_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "PharmacyMedicine" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PharmacySale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "saleNumber" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "patientPhone" TEXT NOT NULL,
    "doctorId" TEXT,
    "doctorName" TEXT NOT NULL,
    "subtotal" REAL NOT NULL,
    "gstAmount" REAL NOT NULL DEFAULT 0,
    "totalAmount" REAL NOT NULL,
    "totalUnitsSold" INTEGER NOT NULL DEFAULT 0,
    "paymentMode" TEXT NOT NULL DEFAULT 'CASH',
    "soldByUserId" TEXT,
    "soldByNameSnapshot" TEXT NOT NULL,
    "soldAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PharmacySale_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PharmacySaleItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "medicineId" TEXT,
    "batchId" TEXT,
    "medicineNameSnapshot" TEXT NOT NULL,
    "batchNumberSnapshot" TEXT NOT NULL,
    "expiryDateSnapshot" TEXT NOT NULL,
    "hsnCodeSnapshot" TEXT,
    "placementSnapshot" TEXT,
    "prescriptionRequired" BOOLEAN NOT NULL DEFAULT false,
    "sellMode" TEXT NOT NULL DEFAULT 'UNIT',
    "enteredQuantity" INTEGER NOT NULL,
    "unitsPerSheetSnapshot" INTEGER NOT NULL DEFAULT 1,
    "basicUnitsDeducted" INTEGER NOT NULL,
    "unitPriceSnapshot" REAL NOT NULL,
    "gstPercentSnapshot" REAL NOT NULL DEFAULT 0,
    "subtotal" REAL NOT NULL,
    "gstAmount" REAL NOT NULL DEFAULT 0,
    "lineTotal" REAL NOT NULL,
    CONSTRAINT "PharmacySaleItem_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PharmacySaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PharmacySale" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PharmacyStockLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "medicineId" TEXT,
    "medicineNameSnapshot" TEXT NOT NULL,
    "batchNumberSnapshot" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "unitsDelta" INTEGER NOT NULL,
    "recordedByUserId" TEXT,
    "recordedByNameSnapshot" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PharmacyStockLog_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Hospital" (
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
    "dailyOpLimit" INTEGER,
    "dailyIpLimit" INTEGER,
    "subscriptionMonthsPaid" INTEGER NOT NULL DEFAULT 0,
    "subscriptionExpiresAt" DATETIME,
    "subscriptionTotalPaid" REAL NOT NULL DEFAULT 0,
    "pharmacyMode" TEXT NOT NULL DEFAULT 'REFERRALS',
    "uhidPrefix" TEXT NOT NULL DEFAULT 'UHID',
    "nextUhidSeq" INTEGER NOT NULL DEFAULT 1,
    "nextOpSeq" INTEGER NOT NULL DEFAULT 1,
    "nextIpSeq" INTEGER NOT NULL DEFAULT 1,
    "nextPharmRefSeq" INTEGER NOT NULL DEFAULT 1,
    "nextPharmSaleSeq" INTEGER NOT NULL DEFAULT 1,
    "nextLabRefSeq" INTEGER NOT NULL DEFAULT 1,
    "nextReceiptSeq" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Hospital" ("address", "code", "createdAt", "dailyIpLimit", "dailyOpLimit", "deactivatedAt", "defaultConsultationFee", "email", "id", "isActive", "logoDataUrl", "name", "nextIpSeq", "nextLabRefSeq", "nextOpSeq", "nextPharmRefSeq", "nextReceiptSeq", "nextUhidSeq", "phone", "registrationNo", "slug", "subscriptionExpiresAt", "subscriptionMonthsPaid", "subscriptionTotalPaid", "tagline", "uhidPrefix", "updatedAt") SELECT "address", "code", "createdAt", "dailyIpLimit", "dailyOpLimit", "deactivatedAt", "defaultConsultationFee", "email", "id", "isActive", "logoDataUrl", "name", "nextIpSeq", "nextLabRefSeq", "nextOpSeq", "nextPharmRefSeq", "nextReceiptSeq", "nextUhidSeq", "phone", "registrationNo", "slug", "subscriptionExpiresAt", "subscriptionMonthsPaid", "subscriptionTotalPaid", "tagline", "uhidPrefix", "updatedAt" FROM "Hospital";
DROP TABLE "Hospital";
ALTER TABLE "new_Hospital" RENAME TO "Hospital";
CREATE UNIQUE INDEX "Hospital_code_key" ON "Hospital"("code");
CREATE UNIQUE INDEX "Hospital_slug_key" ON "Hospital"("slug");
CREATE INDEX "Hospital_isActive_idx" ON "Hospital"("isActive");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PharmacyMedicine_hospitalId_name_idx" ON "PharmacyMedicine"("hospitalId", "name");

-- CreateIndex
CREATE INDEX "PharmacyBatch_hospitalId_batchNumber_idx" ON "PharmacyBatch"("hospitalId", "batchNumber");

-- CreateIndex
CREATE INDEX "PharmacyBatch_hospitalId_expiryDate_idx" ON "PharmacyBatch"("hospitalId", "expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyBatch_hospitalId_medicineId_batchNumber_key" ON "PharmacyBatch"("hospitalId", "medicineId", "batchNumber");

-- CreateIndex
CREATE INDEX "PharmacySale_hospitalId_soldAt_idx" ON "PharmacySale"("hospitalId", "soldAt");

-- CreateIndex
CREATE INDEX "PharmacySale_hospitalId_patientPhone_idx" ON "PharmacySale"("hospitalId", "patientPhone");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacySale_hospitalId_saleNumber_key" ON "PharmacySale"("hospitalId", "saleNumber");

-- CreateIndex
CREATE INDEX "PharmacySaleItem_saleId_idx" ON "PharmacySaleItem"("saleId");

-- CreateIndex
CREATE INDEX "PharmacySaleItem_hospitalId_medicineId_idx" ON "PharmacySaleItem"("hospitalId", "medicineId");

-- CreateIndex
CREATE INDEX "PharmacyStockLog_hospitalId_createdAt_idx" ON "PharmacyStockLog"("hospitalId", "createdAt");

-- CreateIndex
CREATE INDEX "PharmacyStockLog_hospitalId_changeType_createdAt_idx" ON "PharmacyStockLog"("hospitalId", "changeType", "createdAt");
