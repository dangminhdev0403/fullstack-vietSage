-- Remove the redundant PermissionModule table.
-- Runtime grouping uses Permission.moduleKey directly.

DROP INDEX IF EXISTS "Permission_moduleId_idx";

ALTER TABLE "Permission"
  DROP CONSTRAINT IF EXISTS "Permission_moduleId_fkey";

ALTER TABLE "Permission"
  DROP COLUMN IF EXISTS "moduleId";

DROP TABLE IF EXISTS "PermissionModule";

DROP TYPE IF EXISTS "PermissionDomain";
