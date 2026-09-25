ALTER TABLE "LocalMateProfile"
ADD COLUMN "serviceLatitude" DECIMAL(9, 6),
ADD COLUMN "serviceLongitude" DECIMAL(9, 6);

ALTER TABLE "LocalMateTourKnowledge"
ADD COLUMN "latitude" DECIMAL(9, 6),
ADD COLUMN "longitude" DECIMAL(9, 6);

ALTER TABLE "LocalMateProfile"
ADD CONSTRAINT "LocalMateProfile_service_coordinates_pair_check"
CHECK (
  ("serviceLatitude" IS NULL AND "serviceLongitude" IS NULL)
  OR (
    "serviceLatitude" IS NOT NULL
    AND "serviceLongitude" IS NOT NULL
    AND "serviceLatitude" BETWEEN -90 AND 90
    AND "serviceLongitude" BETWEEN -180 AND 180
  )
);

ALTER TABLE "LocalMateTourKnowledge"
ADD CONSTRAINT "LocalMateTourKnowledge_coordinates_pair_check"
CHECK (
  ("latitude" IS NULL AND "longitude" IS NULL)
  OR (
    "latitude" IS NOT NULL
    AND "longitude" IS NOT NULL
    AND "latitude" BETWEEN -90 AND 90
    AND "longitude" BETWEEN -180 AND 180
  )
);

CREATE INDEX "LocalMateProfile_serviceLatitude_serviceLongitude_idx"
ON "LocalMateProfile"("serviceLatitude", "serviceLongitude");

CREATE INDEX "LocalMateTourKnowledge_latitude_longitude_idx"
ON "LocalMateTourKnowledge"("latitude", "longitude");
