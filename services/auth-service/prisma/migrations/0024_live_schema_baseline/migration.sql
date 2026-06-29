-- Baseline schema differences that already exist in the live database.
-- This migration is intentionally idempotent so it is safe for databases
-- that already have the legacy grouping column and removed category default.

ALTER TABLE "PermissionModule"
  ADD COLUMN IF NOT EXISTS "groupId" TEXT;

CREATE INDEX IF NOT EXISTS "PermissionModule_groupId_sortOrder_idx"
  ON "PermissionModule"("groupId", "sortOrder");

ALTER TABLE "HotelServiceCategory"
  ALTER COLUMN "requestType" DROP DEFAULT;
