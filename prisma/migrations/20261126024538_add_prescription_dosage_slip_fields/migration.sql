-- AlterTable
ALTER TABLE "DoctorPrescriptionItem" ADD COLUMN "dosageSchedule" TEXT;
ALTER TABLE "DoctorPrescriptionItem" ADD COLUMN "mealTiming" TEXT;

-- AlterTable
ALTER TABLE "PharmacySale" ADD COLUMN "prescriptionId" TEXT;

-- AlterTable
ALTER TABLE "PharmacySaleItem" ADD COLUMN "dosageInstructionsSnapshot" TEXT;
ALTER TABLE "PharmacySaleItem" ADD COLUMN "dosageScheduleSnapshot" TEXT;
ALTER TABLE "PharmacySaleItem" ADD COLUMN "mealTimingSnapshot" TEXT;
