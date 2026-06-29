-- CreateEnum
CREATE TYPE "HttpMethod" AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS');

-- AlterTable
ALTER TABLE "Permission"
ADD COLUMN "method" "HttpMethod",
ADD COLUMN "path" VARCHAR(255);

-- Purge legacy non-route-based permissions (and cascading role mappings)
DELETE FROM "Permission"
WHERE "code" !~ '^(GET|POST|PUT|PATCH|DELETE|OPTIONS):/';

-- Backfill method/path/description from legacy route-based code format
UPDATE "Permission"
SET "method" = split_part("code", ':', 1)::"HttpMethod",
    "path" = substring("code" from position(':' in "code") + 1),
    "description" = COALESCE(NULLIF("description", ''), "code")
WHERE "code" ~ '^(GET|POST|PUT|PATCH|DELETE|OPTIONS):/';

-- Enforce required columns
ALTER TABLE "Permission"
ALTER COLUMN "method" SET NOT NULL,
ALTER COLUMN "path" SET NOT NULL,
ALTER COLUMN "description" SET NOT NULL;

-- Drop old unique/index and legacy columns
DROP INDEX "Permission_code_key";

ALTER TABLE "Permission"
DROP COLUMN "name",
DROP COLUMN "code";

-- Add new uniqueness for route-based permission identity
CREATE UNIQUE INDEX "Permission_method_path_key" ON "Permission"("method", "path");
