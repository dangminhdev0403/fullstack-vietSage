-- CreateEnum
CREATE TYPE "HotelFeatureStatus" AS ENUM ('ENABLED', 'DISABLED');

-- CreateTable
CREATE TABLE "hotel_feature_entitlements" (
    "hotelId" TEXT NOT NULL,
    "featureKey" VARCHAR(120) NOT NULL,
    "status" "HotelFeatureStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_feature_entitlements_pkey" PRIMARY KEY ("hotelId","featureKey"),
    CONSTRAINT "hotel_feature_entitlements_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "hotel_feature_entitlements_featureKey_status_idx" ON "hotel_feature_entitlements"("featureKey", "status");

-- Backfill existing hotels with both canonical features enabled
INSERT INTO "hotel_feature_entitlements" ("hotelId", "featureKey", "status", "createdAt", "updatedAt")
SELECT
    h."id" AS "hotelId",
    f."featureKey",
    'ENABLED'::"HotelFeatureStatus",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Hotel" h
CROSS JOIN (
    VALUES
        ('guest.ai_floating_chat'),
        ('frontdesk.hn2n_cccd_scanner')
) AS f("featureKey")
ON CONFLICT ("hotelId", "featureKey") DO NOTHING;
