-- Simplify guest request priorities to operational values only.
UPDATE "GuestRequest"
SET "priority" = 'NORMAL'
WHERE "priority" = 'LOW';

UPDATE "GuestRequest"
SET "priority" = 'URGENT'
WHERE "priority" = 'HIGH';

ALTER TYPE "GuestRequestPriority" RENAME TO "GuestRequestPriority_old";
CREATE TYPE "GuestRequestPriority" AS ENUM ('NORMAL', 'URGENT');

ALTER TABLE "GuestRequest"
  ALTER COLUMN "priority" DROP DEFAULT,
  ALTER COLUMN "priority" TYPE "GuestRequestPriority"
  USING "priority"::text::"GuestRequestPriority",
  ALTER COLUMN "priority" SET DEFAULT 'NORMAL';

DROP TYPE "GuestRequestPriority_old";
