DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TourScope') THEN
    CREATE TYPE "TourScope" AS ENUM ('LOCAL', 'REGIONAL_DAYTRIP', 'INTERPROVINCIAL');
  END IF;
END $$;

ALTER TABLE "LocalMateTourKnowledge"
  ADD COLUMN IF NOT EXISTS "provinceCode" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "province" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "tourScope" "TourScope";

-- Preserve legacy destination text before removing the redundant column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'LocalMateTourKnowledge'
      AND column_name = 'destination'
  ) THEN
    UPDATE "LocalMateTourKnowledge"
    SET
      "province" = COALESCE(NULLIF(BTRIM("province"), ''), NULLIF(BTRIM("destination"), '')),
      "content" = CASE
        WHEN NULLIF(BTRIM("destination"), '') IS NOT NULL
          AND POSITION(
            LOWER(BTRIM("destination")) IN LOWER(
              COALESCE("title", '') || ' ' || COALESCE("province", '') || ' ' || COALESCE("content", '')
            )
          ) = 0
        THEN 'Điểm đến: ' || BTRIM("destination") || E'\n\n' || "content"
        ELSE "content"
      END;
  END IF;
END $$;

UPDATE "LocalMateTourKnowledge"
SET
  "provinceCode" = COALESCE(NULLIF(BTRIM("provinceCode"), ''), 'UNCLASSIFIED'),
  "province" = COALESCE(NULLIF(BTRIM("province"), ''), 'Chưa phân loại'),
  "tourScope" = COALESCE("tourScope", 'LOCAL'::"TourScope");

ALTER TABLE "LocalMateTourKnowledge"
  ALTER COLUMN "provinceCode" SET DEFAULT 'UNCLASSIFIED',
  ALTER COLUMN "provinceCode" SET NOT NULL,
  ALTER COLUMN "province" SET DEFAULT 'Chưa phân loại',
  ALTER COLUMN "province" SET NOT NULL,
  ALTER COLUMN "tourScope" SET DEFAULT 'LOCAL'::"TourScope",
  ALTER COLUMN "tourScope" SET NOT NULL;

DROP INDEX IF EXISTS "LocalMateTourKnowledge_destination_idx";
ALTER TABLE "LocalMateTourKnowledge" DROP COLUMN IF EXISTS "destination";

CREATE INDEX IF NOT EXISTS "LocalMateTourKnowledge_title_idx"
  ON "LocalMateTourKnowledge"("title");
CREATE INDEX IF NOT EXISTS "LocalMateTourKnowledge_provinceCode_idx"
  ON "LocalMateTourKnowledge"("provinceCode");
CREATE INDEX IF NOT EXISTS "LocalMateTourKnowledge_tourScope_idx"
  ON "LocalMateTourKnowledge"("tourScope");
