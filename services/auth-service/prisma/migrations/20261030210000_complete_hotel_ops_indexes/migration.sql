-- Complete indexes declared in schema.prisma without rewriting an existing migration.
CREATE INDEX IF NOT EXISTS "GuestStay_hotelId_status_plannedCheckInAt_plannedCheckOutAt_idx"
ON "GuestStay"("hotelId", "status", "plannedCheckInAt", "plannedCheckOutAt");

CREATE INDEX IF NOT EXISTS "GuestStay_hotelId_status_checkedInAt_checkedOutAt_idx"
ON "GuestStay"("hotelId", "status", "checkedInAt", "checkedOutAt");

CREATE INDEX IF NOT EXISTS "FolioItem_hotelId_voidedAt_postedAt_idx"
ON "FolioItem"("hotelId", "voidedAt", "postedAt");

CREATE INDEX IF NOT EXISTS "Payment_hotelId_status_confirmedAt_idx"
ON "Payment"("hotelId", "status", "confirmedAt");
