DROP INDEX IF EXISTS "RoomQRCode_qrTokenHash_idx";
DROP INDEX IF EXISTS "RoomQRCode_qrTokenHash_key";

ALTER TABLE "RoomQRCode" DROP COLUMN IF EXISTS "qrTokenHash";
