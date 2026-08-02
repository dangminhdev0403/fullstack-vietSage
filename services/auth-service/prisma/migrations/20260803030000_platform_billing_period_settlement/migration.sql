ALTER TABLE "PlatformBillingPeriod"
  ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "chargeCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "adjustmentTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
  ADD COLUMN IF NOT EXISTS "finalizedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "finalizedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "snapshotHash" VARCHAR(120);

CREATE INDEX IF NOT EXISTS "PlatformBillingPeriod_dueAt_status_idx" ON "PlatformBillingPeriod"("dueAt", "status");

CREATE TABLE IF NOT EXISTS "PlatformBillingAdjustment" (
  "id" TEXT PRIMARY KEY,
  "contractId" TEXT NOT NULL REFERENCES "PlatformBillingContract"("id") ON DELETE RESTRICT,
  "billableDayId" TEXT REFERENCES "PlatformBillableDay"("id") ON DELETE SET NULL,
  "periodId" TEXT REFERENCES "PlatformBillingPeriod"("id") ON DELETE SET NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
  "reasonCode" VARCHAR(80) NOT NULL,
  "note" VARCHAR(500),
  "actorUserId" TEXT,
  "reversesAdjustmentId" TEXT,
  "idempotencyKey" VARCHAR(120) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlatformBillingAdjustment_contractId_idempotencyKey_key" ON "PlatformBillingAdjustment"("contractId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "PlatformBillingAdjustment_contractId_createdAt_idx" ON "PlatformBillingAdjustment"("contractId", "createdAt");
CREATE INDEX IF NOT EXISTS "PlatformBillingAdjustment_periodId_createdAt_idx" ON "PlatformBillingAdjustment"("periodId", "createdAt");

CREATE TABLE IF NOT EXISTS "PlatformBillingSettlement" (
  "id" TEXT PRIMARY KEY,
  "periodId" TEXT NOT NULL REFERENCES "PlatformBillingPeriod"("id") ON DELETE RESTRICT,
  "amount" DECIMAL(12,2) NOT NULL,
  "method" VARCHAR(40) NOT NULL DEFAULT 'BANK_TRANSFER',
  "reference" VARCHAR(160),
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotencyKey" VARCHAR(120) NOT NULL,
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlatformBillingSettlement_periodId_idempotencyKey_key" ON "PlatformBillingSettlement"("periodId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "PlatformBillingSettlement_periodId_createdAt_idx" ON "PlatformBillingSettlement"("periodId", "createdAt");

CREATE TABLE IF NOT EXISTS "PlatformBillingDailySummary" (
  "id" TEXT PRIMARY KEY,
  "serviceDate" DATE NOT NULL,
  "hotelId" TEXT NOT NULL REFERENCES "Hotel"("id") ON DELETE RESTRICT,
  "contractId" TEXT NOT NULL REFERENCES "PlatformBillingContract"("id") ON DELETE RESTRICT,
  "billableRoomCount" INTEGER NOT NULL DEFAULT 0,
  "grossAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "adjustmentAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "netAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlatformBillingDailySummary_contractId_serviceDate_key" ON "PlatformBillingDailySummary"("contractId", "serviceDate");
CREATE INDEX IF NOT EXISTS "PlatformBillingDailySummary_serviceDate_idx" ON "PlatformBillingDailySummary"("serviceDate");
CREATE INDEX IF NOT EXISTS "PlatformBillingDailySummary_hotelId_serviceDate_idx" ON "PlatformBillingDailySummary"("hotelId", "serviceDate");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'PlatformBillingAdjustment_immutable') THEN
    CREATE TRIGGER "PlatformBillingAdjustment_immutable" BEFORE UPDATE OR DELETE ON "PlatformBillingAdjustment" FOR EACH ROW EXECUTE FUNCTION reject_platform_billing_immutable_mutation();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'PlatformBillingSettlement_immutable') THEN
    CREATE TRIGGER "PlatformBillingSettlement_immutable" BEFORE UPDATE OR DELETE ON "PlatformBillingSettlement" FOR EACH ROW EXECUTE FUNCTION reject_platform_billing_immutable_mutation();
  END IF;
END $$;
