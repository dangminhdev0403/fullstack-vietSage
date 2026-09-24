ALTER TABLE "HotelStaffAssignment"
ADD COLUMN "hasHotelWideRoomScope" BOOLEAN NOT NULL DEFAULT false;

UPDATE "HotelStaffAssignment" assignment
SET "hasHotelWideRoomScope" = true,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "User" account
WHERE assignment."userId" = account."id"
  AND assignment."status" = 'ACTIVE'
  AND lower(account."email") = 'frontdesk@vietsage.vn';
