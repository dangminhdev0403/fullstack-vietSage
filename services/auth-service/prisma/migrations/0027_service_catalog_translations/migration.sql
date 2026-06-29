-- Add multilingual translations for hotel service catalog content.
CREATE TABLE "HotelServiceCategoryTranslation" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "locale" VARCHAR(10) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HotelServiceCategoryTranslation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HotelServiceItemTranslation" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "locale" VARCHAR(10) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "description" VARCHAR(1000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HotelServiceItemTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HotelServiceCategoryTranslation_categoryId_locale_key"
  ON "HotelServiceCategoryTranslation"("categoryId", "locale");
CREATE INDEX "HotelServiceCategoryTranslation_locale_idx"
  ON "HotelServiceCategoryTranslation"("locale");

CREATE UNIQUE INDEX "HotelServiceItemTranslation_itemId_locale_key"
  ON "HotelServiceItemTranslation"("itemId", "locale");
CREATE INDEX "HotelServiceItemTranslation_locale_idx"
  ON "HotelServiceItemTranslation"("locale");

ALTER TABLE "HotelServiceCategoryTranslation"
  ADD CONSTRAINT "HotelServiceCategoryTranslation_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "HotelServiceCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HotelServiceItemTranslation"
  ADD CONSTRAINT "HotelServiceItemTranslation_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "HotelServiceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
