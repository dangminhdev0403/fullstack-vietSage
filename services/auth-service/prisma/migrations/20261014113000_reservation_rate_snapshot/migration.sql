-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN "nightlyRateSnapshot" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "GuestStay" ADD COLUMN "nightlyRateSnapshot" DECIMAL(12,2);
