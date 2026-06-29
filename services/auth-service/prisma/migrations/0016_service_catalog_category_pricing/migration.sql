-- Move service default pricing to categories and remove item requestType.
ALTER TABLE "HotelServiceCategory"
  ADD COLUMN "defaultPrice" DECIMAL(12, 2),
  ADD COLUMN "currency" VARCHAR(3);

-- Category currency: most frequent item currency, tie-break by earliest item creation.
WITH ranked_currencies AS (
  SELECT
    item."categoryId",
    item."currency",
    COUNT(*) AS currency_count,
    MIN(item."createdAt") AS first_seen_at,
    ROW_NUMBER() OVER (
      PARTITION BY item."categoryId"
      ORDER BY COUNT(*) DESC, MIN(item."createdAt") ASC, item."currency" ASC
    ) AS rank
  FROM "HotelServiceItem" item
  WHERE item."currency" IS NOT NULL
  GROUP BY item."categoryId", item."currency"
)
UPDATE "HotelServiceCategory" category
SET "currency" = ranked_currencies."currency"
FROM ranked_currencies
WHERE category."id" = ranked_currencies."categoryId"
  AND ranked_currencies.rank = 1;

UPDATE "HotelServiceCategory"
SET "currency" = 'VND'
WHERE "currency" IS NULL;

-- Category default price: shared non-null item price when unanimous, otherwise 0.
WITH price_summary AS (
  SELECT
    item."categoryId",
    COUNT(DISTINCT item."price") FILTER (WHERE item."price" IS NOT NULL) AS distinct_price_count,
    MIN(item."price") FILTER (WHERE item."price" IS NOT NULL) AS shared_price
  FROM "HotelServiceItem" item
  GROUP BY item."categoryId"
)
UPDATE "HotelServiceCategory" category
SET "defaultPrice" = CASE
  WHEN price_summary.distinct_price_count = 1 THEN price_summary.shared_price
  ELSE 0
END
FROM price_summary
WHERE category."id" = price_summary."categoryId";

UPDATE "HotelServiceCategory"
SET "defaultPrice" = 0
WHERE "defaultPrice" IS NULL;

ALTER TABLE "HotelServiceItem" RENAME COLUMN "price" TO "priceOverride";

-- Preserve only true item-level overrides.
UPDATE "HotelServiceItem" item
SET "priceOverride" = NULL
FROM "HotelServiceCategory" category
WHERE item."categoryId" = category."id"
  AND (item."priceOverride" IS NULL OR item."priceOverride" = category."defaultPrice");

DROP INDEX IF EXISTS "HotelServiceItem_requestType_status_idx";

ALTER TABLE "HotelServiceCategory"
  ALTER COLUMN "defaultPrice" SET NOT NULL,
  ALTER COLUMN "defaultPrice" SET DEFAULT 0,
  ALTER COLUMN "currency" SET NOT NULL,
  ALTER COLUMN "currency" SET DEFAULT 'VND';

ALTER TABLE "HotelServiceItem"
  DROP COLUMN "requestType",
  DROP COLUMN "currency";
