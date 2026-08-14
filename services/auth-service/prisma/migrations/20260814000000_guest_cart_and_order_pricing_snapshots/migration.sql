-- AlterTable MarketplaceOrder: add partnerSubtotal, hotelServiceFeeAmount, customerTotalAmount
ALTER TABLE "MarketplaceOrder"
  ADD COLUMN IF NOT EXISTS "partnerSubtotal" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "hotelServiceFeeAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "customerTotalAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0;

-- Backfill partnerSubtotal and customerTotalAmount for existing orders
UPDATE "MarketplaceOrder"
SET
  "partnerSubtotal" = "totalAmount",
  "customerTotalAmount" = "totalAmount"
WHERE "customerTotalAmount" = 0 AND "totalAmount" > 0;

-- CreateTable MarketplaceOrderItem
CREATE TABLE IF NOT EXISTS "MarketplaceOrderItem" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPriceSnapshot" DECIMAL(12, 2) NOT NULL,
  "pricingUnitSnapshot" VARCHAR(32),
  "serviceNameSnapshot" VARCHAR(160) NOT NULL,
  "serviceModeSnapshot" "MarketplaceServiceMode" NOT NULL,
  "waitingMinutesSnapshot" INTEGER NOT NULL DEFAULT 0,
  "partnerSubtotal" DECIMAL(12, 2) NOT NULL,
  "hotelServiceFeeAmount" DECIMAL(12, 2) NOT NULL,
  "customerTotalAmount" DECIMAL(12, 2) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'VND',
  "guestNote" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable GuestCart
CREATE TABLE IF NOT EXISTS "GuestCart" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "stayId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuestCart_pkey" PRIMARY KEY ("id")
);

-- CreateTable GuestCartItem
CREATE TABLE IF NOT EXISTS "GuestCartItem" (
  "id" TEXT NOT NULL,
  "cartId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "guestNote" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuestCartItem_pkey" PRIMARY KEY ("id")
);

-- Indexes & Constraints
CREATE INDEX IF NOT EXISTS "MarketplaceOrderItem_orderId_idx"
  ON "MarketplaceOrderItem"("orderId");
CREATE INDEX IF NOT EXISTS "MarketplaceOrderItem_serviceId_idx"
  ON "MarketplaceOrderItem"("serviceId");

CREATE UNIQUE INDEX IF NOT EXISTS "GuestCart_sessionId_key"
  ON "GuestCart"("sessionId");
CREATE INDEX IF NOT EXISTS "GuestCart_hotelId_idx"
  ON "GuestCart"("hotelId");
CREATE INDEX IF NOT EXISTS "GuestCart_stayId_idx"
  ON "GuestCart"("stayId");

CREATE UNIQUE INDEX IF NOT EXISTS "GuestCartItem_cartId_serviceId_key"
  ON "GuestCartItem"("cartId", "serviceId");
CREATE INDEX IF NOT EXISTS "GuestCartItem_cartId_idx"
  ON "GuestCartItem"("cartId");
CREATE INDEX IF NOT EXISTS "GuestCartItem_serviceId_idx"
  ON "GuestCartItem"("serviceId");

-- Foreign Keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MarketplaceOrderItem_orderId_fkey'
  ) THEN
    ALTER TABLE "MarketplaceOrderItem"
      ADD CONSTRAINT "MarketplaceOrderItem_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "MarketplaceOrder"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MarketplaceOrderItem_serviceId_fkey'
  ) THEN
    ALTER TABLE "MarketplaceOrderItem"
      ADD CONSTRAINT "MarketplaceOrderItem_serviceId_fkey"
      FOREIGN KEY ("serviceId") REFERENCES "MarketplaceService"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'GuestCart_hotelId_fkey'
  ) THEN
    ALTER TABLE "GuestCart"
      ADD CONSTRAINT "GuestCart_hotelId_fkey"
      FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'GuestCart_stayId_fkey'
  ) THEN
    ALTER TABLE "GuestCart"
      ADD CONSTRAINT "GuestCart_stayId_fkey"
      FOREIGN KEY ("stayId") REFERENCES "GuestStay"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'GuestCart_sessionId_fkey'
  ) THEN
    ALTER TABLE "GuestCart"
      ADD CONSTRAINT "GuestCart_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "GuestSession"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'GuestCartItem_cartId_fkey'
  ) THEN
    ALTER TABLE "GuestCartItem"
      ADD CONSTRAINT "GuestCartItem_cartId_fkey"
      FOREIGN KEY ("cartId") REFERENCES "GuestCart"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'GuestCartItem_serviceId_fkey'
  ) THEN
    ALTER TABLE "GuestCartItem"
      ADD CONSTRAINT "GuestCartItem_serviceId_fkey"
      FOREIGN KEY ("serviceId") REFERENCES "MarketplaceService"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
