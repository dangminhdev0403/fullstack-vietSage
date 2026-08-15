CREATE TABLE "MarketplacePricingConfig" (
  "id" VARCHAR(20) NOT NULL DEFAULT 'default',
  "deliveryServiceFeeRate" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  "updatedBy" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplacePricingConfig_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketplacePricingConfig_deliveryServiceFeeRate_check"
    CHECK ("deliveryServiceFeeRate" >= 0 AND "deliveryServiceFeeRate" <= 100)
);

INSERT INTO "MarketplacePricingConfig" ("id", "deliveryServiceFeeRate", "updatedAt")
VALUES ('default', 10.00, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;