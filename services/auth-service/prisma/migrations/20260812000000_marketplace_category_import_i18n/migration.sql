-- Add importKey and translation table for MarketplaceCategory, backfill existing nameEn, drop nameEn and icon.

ALTER TABLE "MarketplaceCategory" ADD COLUMN "importKey" VARCHAR(80);
CREATE UNIQUE INDEX "MarketplaceCategory_importKey_key" ON "MarketplaceCategory"("importKey");

CREATE TABLE "MarketplaceCategoryTranslation" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceCategoryTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketplaceCategoryTranslation_categoryId_locale_key" ON "MarketplaceCategoryTranslation"("categoryId", "locale");
CREATE INDEX "MarketplaceCategoryTranslation_locale_idx" ON "MarketplaceCategoryTranslation"("locale");

ALTER TABLE "MarketplaceCategoryTranslation" ADD CONSTRAINT "MarketplaceCategoryTranslation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MarketplaceCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "MarketplaceCategoryTranslation" ("id", "categoryId", "locale", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", 'en', "nameEn", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "MarketplaceCategory"
WHERE "nameEn" IS NOT NULL AND TRIM("nameEn") != '';

ALTER TABLE "MarketplaceCategory" DROP COLUMN "nameEn";
ALTER TABLE "MarketplaceCategory" DROP COLUMN "icon";
