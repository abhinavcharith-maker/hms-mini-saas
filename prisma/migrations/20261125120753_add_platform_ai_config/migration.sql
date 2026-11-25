-- CreateTable
CREATE TABLE "PlatformConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "geminiApiKeyEncrypted" TEXT,
    "geminiApiKeyMasked" TEXT,
    "geminiModel" TEXT NOT NULL DEFAULT 'gemini-3.8-flash',
    "updatedByUserId" TEXT,
    "updatedByUsername" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
