UPDATE "Code"
SET "sequenceNext" = (
    SELECT COALESCE(
        MAX(
            CAST(regexp_replace("code", '^VSH_HOTEL_', '') AS INTEGER)
        ) + 1,
        1
    )
    FROM "Hotel"
    WHERE "code" ~ '^VSH_HOTEL_[0-9]+$'
)
WHERE "name" = 'HOTEL';

UPDATE "Code"
SET "sequenceNext" = (
    SELECT COALESCE(
        MAX(
            CAST(regexp_replace("code", '^VSH_ROOM_', '') AS INTEGER)
        ) + 1,
        1
    )
    FROM "Room"
    WHERE "code" ~ '^VSH_ROOM_[0-9]+$'
)
WHERE "name" = 'ROOM';