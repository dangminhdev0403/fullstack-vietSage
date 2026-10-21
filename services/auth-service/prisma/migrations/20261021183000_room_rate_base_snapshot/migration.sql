-- Preserve the original room rate used to compare an adjusted booking rate at checkout.
ALTER TABLE "Reservation" ADD COLUMN "baseNightlyRateSnapshot" DECIMAL(12,2);
ALTER TABLE "GuestStay" ADD COLUMN "baseNightlyRateSnapshot" DECIMAL(12,2);
