WITH payment_sequence AS (
  SELECT COALESCE(
    MAX(
      CASE
        WHEN "paymentNumber" ~ '^VSH_PAYMENT_[0-9]+$'
          THEN substring("paymentNumber" FROM '[0-9]+$')::integer
      END
    ),
    0
  ) + 1 AS "sequenceNext"
  FROM "Payment"
)
INSERT INTO "Code" ("id", "name", "sequenceNext", "isActive", "createdAt", "updatedAt")
SELECT 'code_payment', 'PAYMENT', "sequenceNext", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM payment_sequence
ON CONFLICT ("name") DO UPDATE
SET "sequenceNext" = GREATEST("Code"."sequenceNext", EXCLUDED."sequenceNext"),
    "isActive" = true,
    "updatedAt" = CURRENT_TIMESTAMP;
