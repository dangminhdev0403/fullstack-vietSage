-- Backfill missing RoomType records from legacy Room records
INSERT INTO "RoomType" ("id", "hotelId", "name", "normalizedKey", "basePrice", "createdAt", "updatedAt")
SELECT 
  'rt_' || md5(r."hotelId" || ':' || lower(trim(r."type"))),
  r."hotelId",
  trim(r."type"),
  lower(trim(r."type")),
  MAX(r."price"),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Room" r
WHERE r."type" IS NOT NULL 
  AND trim(r."type") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "RoomType" rt 
    WHERE rt."hotelId" = r."hotelId" 
      AND rt."normalizedKey" = lower(trim(r."type"))
  )
GROUP BY r."hotelId", lower(trim(r."type")), trim(r."type")
ON CONFLICT ("hotelId", "normalizedKey") DO NOTHING;

-- Link unlinked rooms to their matching RoomType
UPDATE "Room" r
SET "roomTypeId" = rt."id"
FROM "RoomType" rt
WHERE r."hotelId" = rt."hotelId"
  AND r."roomTypeId" IS NULL
  AND r."type" IS NOT NULL
  AND lower(trim(r."type")) = rt."normalizedKey";

-- Populate basePrice for any RoomType that still has null/zero basePrice from linked rooms
UPDATE "RoomType" rt
SET "basePrice" = sub.max_price
FROM (
  SELECT "roomTypeId", MAX("price") AS max_price
  FROM "Room"
  WHERE "price" IS NOT NULL AND "price" > 0
  GROUP BY "roomTypeId"
) sub
WHERE rt."id" = sub."roomTypeId"
  AND (rt."basePrice" IS NULL OR rt."basePrice" <= 0);
