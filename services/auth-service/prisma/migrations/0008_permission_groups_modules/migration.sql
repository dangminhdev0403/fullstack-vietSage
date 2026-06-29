-- Add route permission modules for admin RBAC grouping without a separate group table.
CREATE TYPE "PermissionDomain" AS ENUM ('PLATFORM', 'HOTEL', 'USERS', 'GUEST', 'SYSTEM');

CREATE TABLE "PermissionModule" (
    "id" TEXT NOT NULL,
    "domain" "PermissionDomain" NOT NULL DEFAULT 'SYSTEM',
    "moduleKey" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(255),
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionModule_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Permission" ADD COLUMN "moduleId" TEXT;

CREATE UNIQUE INDEX "PermissionModule_moduleKey_key" ON "PermissionModule"("moduleKey");
CREATE INDEX "PermissionModule_domain_sortOrder_idx" ON "PermissionModule"("domain", "sortOrder");
CREATE INDEX "Permission_moduleId_idx" ON "Permission"("moduleId");

ALTER TABLE "Permission" ADD CONSTRAINT "Permission_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "PermissionModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "PermissionModule" ("id", "domain", "moduleKey", "name", "description", "sortOrder", "updatedAt")
SELECT 'perm_module_' || "moduleKey",
  CASE
    WHEN "moduleKey" IN ('hotels', 'bookings') THEN 'HOTEL'::"PermissionDomain"
    WHEN "moduleKey" IN ('users', 'hotel-users') THEN 'USERS'::"PermissionDomain"
    WHEN "moduleKey" = 'guest' THEN 'GUEST'::"PermissionDomain"
    WHEN "moduleKey" IN ('auth', 'roles', 'permissions') THEN 'PLATFORM'::"PermissionDomain"
    ELSE 'SYSTEM'::"PermissionDomain"
  END,
  "moduleKey",
  initcap(replace("moduleKey", '-', ' ')),
  NULL,
  CASE
    WHEN "moduleKey" IN ('auth', 'roles', 'permissions') THEN 10
    WHEN "moduleKey" IN ('hotels', 'bookings') THEN 20
    WHEN "moduleKey" IN ('users', 'hotel-users') THEN 30
    WHEN "moduleKey" = 'guest' THEN 40
    ELSE 90
  END,
  CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "moduleKey" FROM "Permission") AS modules
ON CONFLICT ("moduleKey") DO NOTHING;

UPDATE "Permission" p
SET "moduleId" = pm."id"
FROM "PermissionModule" pm
WHERE p."moduleKey" = pm."moduleKey";
