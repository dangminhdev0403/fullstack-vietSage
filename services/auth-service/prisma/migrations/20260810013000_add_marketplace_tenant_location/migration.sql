-- CreateEnum
CREATE TYPE "TenantType" AS ENUM ('HOTEL', 'SERVICE');

-- CreateEnum
CREATE TYPE "MarketplaceLocationSource" AS ENUM ('DEVICE_GEOLOCATION', 'GOOGLE_MAPS_URL', 'MANUAL');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "type" "TenantType" NOT NULL DEFAULT 'HOTEL';

-- AlterTable
ALTER TABLE "Hotel" ADD COLUMN "googleMapsUrl" VARCHAR(500),
ADD COLUMN "latitude" DECIMAL(9,6),
ADD COLUMN "longitude" DECIMAL(9,6),
ADD COLUMN "locationAccuracyMeters" DOUBLE PRECISION,
ADD COLUMN "locationSource" "MarketplaceLocationSource",
ADD COLUMN "locationVerifiedAt" TIMESTAMP(3);

-- AddCheckConstraints
ALTER TABLE "Hotel" ADD CONSTRAINT "chk_hotel_coordinates_completeness" CHECK (("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL));
ALTER TABLE "Hotel" ADD CONSTRAINT "chk_hotel_coordinates_range" CHECK (("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" >= -90 AND "latitude" <= 90 AND "longitude" >= -180 AND "longitude" <= 180));
ALTER TABLE "Hotel" ADD CONSTRAINT "chk_hotel_location_accuracy_non_negative" CHECK ("locationAccuracyMeters" IS NULL OR "locationAccuracyMeters" >= 0);
