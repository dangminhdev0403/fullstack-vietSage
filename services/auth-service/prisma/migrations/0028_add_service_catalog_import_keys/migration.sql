-- Add stable import keys for hotel service catalog imports.
ALTER TABLE "HotelServiceCategory" ADD COLUMN "importKey" VARCHAR(120);
ALTER TABLE "HotelServiceItem" ADD COLUMN "importKey" VARCHAR(120);

CREATE UNIQUE INDEX "HotelServiceCategory_hotelId_importKey_key"
  ON "HotelServiceCategory"("hotelId", "importKey");
CREATE UNIQUE INDEX "HotelServiceItem_hotelId_importKey_key"
  ON "HotelServiceItem"("hotelId", "importKey");
