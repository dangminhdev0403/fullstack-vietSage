-- Ensure all RoomType records have normalizedKey matching lower(trim(name))
UPDATE "RoomType"
SET "normalizedKey" = lower(trim("name")),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "normalizedKey" <> lower(trim("name"));
