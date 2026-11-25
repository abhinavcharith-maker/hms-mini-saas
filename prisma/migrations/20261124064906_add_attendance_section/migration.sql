-- CreateTable
CREATE TABLE "EmployeeProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "roleTitle" TEXT NOT NULL,
    "department" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "shift" TEXT,
    "linkedDoctorId" TEXT,
    "linkedUserId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmployeeProfile_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "attendanceDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "checkInTime" TEXT,
    "checkOutTime" TEXT,
    "notes" TEXT,
    "markedByUserId" TEXT,
    "markedByNameSnapshot" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AttendanceRecord_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EmployeeProfile_hospitalId_isActive_fullName_idx" ON "EmployeeProfile"("hospitalId", "isActive", "fullName");

-- CreateIndex
CREATE INDEX "EmployeeProfile_hospitalId_linkedDoctorId_idx" ON "EmployeeProfile"("hospitalId", "linkedDoctorId");

-- CreateIndex
CREATE INDEX "EmployeeProfile_hospitalId_linkedUserId_idx" ON "EmployeeProfile"("hospitalId", "linkedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeProfile_hospitalId_employeeCode_key" ON "EmployeeProfile"("hospitalId", "employeeCode");

-- CreateIndex
CREATE INDEX "AttendanceRecord_hospitalId_attendanceDate_idx" ON "AttendanceRecord"("hospitalId", "attendanceDate");

-- CreateIndex
CREATE INDEX "AttendanceRecord_employeeId_attendanceDate_idx" ON "AttendanceRecord"("employeeId", "attendanceDate");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_hospitalId_employeeId_attendanceDate_key" ON "AttendanceRecord"("hospitalId", "employeeId", "attendanceDate");
