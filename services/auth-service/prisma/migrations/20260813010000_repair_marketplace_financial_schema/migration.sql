ALTER TABLE "MarketplaceService"
  ADD COLUMN IF NOT EXISTS "pricingUnit" VARCHAR(32);

ALTER TABLE "MarketplaceOrder"
  ADD COLUMN IF NOT EXISTS "pricingUnitSnapshot" VARCHAR(32);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'MarketplaceSettlementStatus'
  ) THEN
    CREATE TYPE "MarketplaceSettlementStatus" AS ENUM (
      'UNSETTLED',
      'READY_FOR_SETTLEMENT',
      'SETTLED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "MarketplaceSettlement" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "serviceTenantId" TEXT NOT NULL,
  "grossAmount" DECIMAL(12,2) NOT NULL,
  "commissionAmount" DECIMAL(12,2) NOT NULL,
  "netAmount" DECIMAL(12,2) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'VND',
  "status" "MarketplaceSettlementStatus" NOT NULL DEFAULT 'UNSETTLED',
  "settledAt" TIMESTAMP(3),
  "settledBy" VARCHAR(80),
  "settledAmount" DECIMAL(12,2),
  "settlementReference" VARCHAR(120),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceSettlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceSettlement_orderId_key"
  ON "MarketplaceSettlement"("orderId");
CREATE INDEX IF NOT EXISTS "MarketplaceSettlement_hotelId_status_idx"
  ON "MarketplaceSettlement"("hotelId", "status");
CREATE INDEX IF NOT EXISTS "MarketplaceSettlement_serviceTenantId_status_idx"
  ON "MarketplaceSettlement"("serviceTenantId", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MarketplaceSettlement_orderId_fkey'
  ) THEN
    ALTER TABLE "MarketplaceSettlement"
      ADD CONSTRAINT "MarketplaceSettlement_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "MarketplaceOrder"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
