-- Exclusive BCA facility ownership per hotel connection (BCA-08).
-- Application gate: before applying in production, verify no two KbttHotelConnection rows share the same csltId.
BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE UNIQUE INDEX "KbttHotelConnection_csltId_key" ON "KbttHotelConnection"("csltId");

COMMIT;
