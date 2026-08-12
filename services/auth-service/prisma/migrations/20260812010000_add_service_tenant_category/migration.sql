ALTER TABLE "ServiceTenantProfile" ADD COLUMN "categoryId" TEXT;

ALTER TABLE "MarketplaceService" ADD COLUMN "importKey" VARCHAR(120);
UPDATE "MarketplaceService" SET "importKey" = "id" WHERE "importKey" IS NULL;

CREATE UNIQUE INDEX "MarketplaceService_serviceTenantId_importKey_key" ON "MarketplaceService"("serviceTenantId", "importKey");
CREATE INDEX "ServiceTenantProfile_categoryId_status_idx" ON "ServiceTenantProfile"("categoryId", "status");

ALTER TABLE "ServiceTenantProfile"
  ADD CONSTRAINT "ServiceTenantProfile_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "MarketplaceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Resolve only unambiguous legacy tenants. Tenants with zero or multiple item categories remain NULL for explicit Admin resolution.
UPDATE "ServiceTenantProfile" p
SET "categoryId" = resolved."categoryId"
FROM (
  SELECT "serviceTenantId", MIN("categoryId") AS "categoryId"
  FROM "MarketplaceService"
  GROUP BY "serviceTenantId"
  HAVING COUNT(DISTINCT "categoryId") = 1
) resolved
WHERE p."tenantId" = resolved."serviceTenantId";

INSERT INTO "Code" ("id", "name", "sequenceNext", "isActive", "createdAt", "updatedAt")
VALUES ('code_marketplace_service', 'MARKETPLACE_SERVICE', 1, true, NOW(), NOW())
ON CONFLICT ("name") DO NOTHING;

CREATE TABLE "MarketplaceServiceTranslation" (
  "id" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "locale" VARCHAR(10) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "description" VARCHAR(1000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceServiceTranslation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketplaceServiceTranslation_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "MarketplaceService"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MarketplaceServiceTranslation_serviceId_locale_key" ON "MarketplaceServiceTranslation"("serviceId", "locale");
CREATE INDEX "MarketplaceServiceTranslation_locale_idx" ON "MarketplaceServiceTranslation"("locale");
