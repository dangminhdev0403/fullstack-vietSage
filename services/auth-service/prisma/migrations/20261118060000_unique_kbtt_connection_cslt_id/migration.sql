-- Exclusive BCA facility ownership, durable declaration attempt/generation fencing, and pending-work indexes (BCA-01, BCA-04, BCA-08, BCA-09).
BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE UNIQUE INDEX IF NOT EXISTS "KbttHotelConnection_csltId_key" ON "KbttHotelConnection"("csltId");

ALTER TABLE "KbttGuestDeclaration"
  ADD COLUMN IF NOT EXISTS "submittedConnectionCiphertext" TEXT,
  ADD COLUMN IF NOT EXISTS "claimToken" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "attemptedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "KbttGuestDeclaration_hotelId_occupantId_revision_idx"
  ON "KbttGuestDeclaration"("hotelId", "occupantId", "revision");

CREATE INDEX IF NOT EXISTS "GuestStayOccupant_hotelId_id_idx"
  ON "GuestStayOccupant"("hotelId", "id");

COMMIT;
