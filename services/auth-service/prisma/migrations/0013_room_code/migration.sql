-- Add generated entity codes to rooms and backfill existing rows.
ALTER TABLE "Room" ADD COLUMN "code" VARCHAR(80);

WITH numbered_rooms AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS sequence_number
  FROM "Room"
)
UPDATE "Room" AS room
SET "code" = 'VSH_ROOM_' || LPAD(numbered_rooms.sequence_number::TEXT, 4, '0')
FROM numbered_rooms
WHERE room."id" = numbered_rooms."id";

INSERT INTO "Code" ("id", "name", "sequenceNext", "isActive", "createdAt", "updatedAt")
VALUES ('code_room', 'ROOM', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

UPDATE "Code"
SET
  "sequenceNext" = GREATEST(
    "sequenceNext",
    (
      SELECT COALESCE(
        MAX((SUBSTRING("code" FROM 'VSH_ROOM_([0-9]+)$'))::INTEGER),
        0
      ) + 1
      FROM "Room"
      WHERE "code" ~ '^VSH_ROOM_[0-9]+$'
    )
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'ROOM';

ALTER TABLE "Room" ALTER COLUMN "code" SET NOT NULL;

CREATE UNIQUE INDEX "Room_code_key" ON "Room"("code");
