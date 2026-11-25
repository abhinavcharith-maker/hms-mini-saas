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
    "consultancyEnabled" BOOLEAN NOT NULL DEFAULT true,
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
INSERT INTO "new_Hospital" ("address", "code", "createdAt", "dailyIpLimit", "dailyOpLimit", "deactivatedAt", "defaultConsultationFee", "email", "id", "isActive", "logoDataUrl", "name", "nextIpSeq", "nextLabRefSeq", "nextOpSeq", "nextPharmRefSeq", "nextPharmSaleSeq", "nextReceiptSeq", "nextUhidSeq", "pharmacyMode", "phone", "registrationNo", "slug", "subscriptionExpiresAt", "subscriptionMonthsPaid", "subscriptionTotalPaid", "tagline", "uhidPrefix", "updatedAt") SELECT "address", "code", "createdAt", "dailyIpLimit", "dailyOpLimit", "deactivatedAt", "defaultConsultationFee", "email", "id", "isActive", "logoDataUrl", "name", "nextIpSeq", "nextLabRefSeq", "nextOpSeq", "nextPharmRefSeq", "nextPharmSaleSeq", "nextReceiptSeq", "nextUhidSeq", "pharmacyMode", "phone", "registrationNo", "slug", "subscriptionExpiresAt", "subscriptionMonthsPaid", "subscriptionTotalPaid", "tagline", "uhidPrefix", "updatedAt" FROM "Hospital";
DROP TABLE "Hospital";
ALTER TABLE "new_Hospital" RENAME TO "Hospital";
CREATE UNIQUE INDEX "Hospital_code_key" ON "Hospital"("code");
CREATE UNIQUE INDEX "Hospital_slug_key" ON "Hospital"("slug");
CREATE INDEX "Hospital_isActive_idx" ON "Hospital"("isActive");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
