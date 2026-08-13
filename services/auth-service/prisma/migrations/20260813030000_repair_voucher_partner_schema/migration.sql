ALTER TABLE "HotelServiceLink"
  ADD COLUMN IF NOT EXISTS "commissionRate" DECIMAL(5,2) NOT NULL DEFAULT 10.00;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'ServiceVoucherStatus'
  ) THEN
    CREATE TYPE "ServiceVoucherStatus" AS ENUM (
      'ISSUED',
      'REDEEMED',
      'EXPIRED',
      'CANCELLED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ServiceVoucher" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "serviceTenantId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "voucherNumber" VARCHAR(32) NOT NULL,
  "verificationCode" VARCHAR(64) NOT NULL,
  "qrTokenHash" VARCHAR(128) NOT NULL,
  "status" "ServiceVoucherStatus" NOT NULL DEFAULT 'ISSUED',
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "redeemedAt" TIMESTAMP(3),
  "redeemedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceVoucher_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ServiceVoucher_orderId_key"
  ON "ServiceVoucher"("orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceVoucher_voucherNumber_key"
  ON "ServiceVoucher"("voucherNumber");
CREATE INDEX IF NOT EXISTS "ServiceVoucher_voucherNumber_idx"
  ON "ServiceVoucher"("voucherNumber");
CREATE INDEX IF NOT EXISTS "ServiceVoucher_serviceTenantId_status_idx"
  ON "ServiceVoucher"("serviceTenantId", "status");
CREATE INDEX IF NOT EXISTS "ServiceVoucher_hotelId_status_idx"
  ON "ServiceVoucher"("hotelId", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ServiceVoucher_orderId_fkey'
  ) THEN
    ALTER TABLE "ServiceVoucher"
      ADD CONSTRAINT "ServiceVoucher_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "MarketplaceOrder"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HotelServiceLink_commissionRate_check'
  ) THEN
    ALTER TABLE "HotelServiceLink"
      ADD CONSTRAINT "HotelServiceLink_commissionRate_check"
      CHECK ("commissionRate" >= 0 AND "commissionRate" <= 100);
  END IF;
END $$;
