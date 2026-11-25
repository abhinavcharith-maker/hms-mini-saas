-- CreateTable
CREATE TABLE "SystemMaintenance" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "activatedByUserId" TEXT,
    "activatedByUsername" TEXT,
    "activatedAt" DATETIME,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
