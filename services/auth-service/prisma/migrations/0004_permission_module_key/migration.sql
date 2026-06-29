-- AlterTable
ALTER TABLE "Permission"
ADD COLUMN "moduleKey" VARCHAR(80);

-- Backfill module key from path with version stripping and alias mapping
WITH roots AS (
  SELECT
    "id",
    CASE
      WHEN regexp_replace("path", '^/+', '') = '' THEN '/'
      WHEN regexp_replace("path", '^/+', '') ~ '^v[0-9]+/[^/]+'
        THEN '/' || split_part(regexp_replace("path", '^/+', ''), '/', 2)
      ELSE '/' || split_part(regexp_replace("path", '^/+', ''), '/', 1)
    END AS root_path
  FROM "Permission"
),
mapped AS (
  SELECT
    "id",
    CASE
      WHEN lower(root_path) = '/hotel-users' THEN 'users'
      WHEN root_path = '/' THEN 'root'
      ELSE NULLIF(regexp_replace(lower(root_path), '^/+', ''), '')
    END AS module_key
  FROM roots
)
UPDATE "Permission" AS permission
SET "moduleKey" = COALESCE(mapped.module_key, 'misc')
FROM mapped
WHERE mapped."id" = permission."id";

-- Enforce required column
ALTER TABLE "Permission"
ALTER COLUMN "moduleKey" SET NOT NULL;

-- Query acceleration for module-based lookups
CREATE INDEX "Permission_moduleKey_method_path_idx"
ON "Permission"("moduleKey", "method", "path");
