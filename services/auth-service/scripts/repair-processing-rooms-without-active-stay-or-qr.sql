-- Reset rooms that were left in PROCESSING by a failed check-in submit.
-- Safe scope: only rooms with no RESERVED/ACTIVE/CHECKED_IN stay and no ACTIVE QR.
-- Preview first:
SELECT r."id", r."hotelId", r."roomNumber", r."status"
FROM "Room" r
WHERE r."status" = 'PROCESSING'
  AND NOT EXISTS (
    SELECT 1
    FROM "GuestStay" s
    WHERE s."roomId" = r."id"
      AND s."hotelId" = r."hotelId"
      AND s."status" IN ('RESERVED', 'ACTIVE', 'CHECKED_IN')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "RoomQRCode" q
    WHERE q."roomId" = r."id"
      AND q."hotelId" = r."hotelId"
      AND q."status" = 'ACTIVE'
  );

-- Repair:
UPDATE "Room" r
SET "status" = 'AVAILABLE'
WHERE r."status" = 'PROCESSING'
  AND NOT EXISTS (
    SELECT 1
    FROM "GuestStay" s
    WHERE s."roomId" = r."id"
      AND s."hotelId" = r."hotelId"
      AND s."status" IN ('RESERVED', 'ACTIVE', 'CHECKED_IN')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "RoomQRCode" q
    WHERE q."roomId" = r."id"
      AND q."hotelId" = r."hotelId"
      AND q."status" = 'ACTIVE'
  );
