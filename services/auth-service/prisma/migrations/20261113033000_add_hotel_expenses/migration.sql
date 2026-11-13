-- Add HotelExpense table for hotel operating expense control and P&L reporting.
CREATE TABLE IF NOT EXISTS "HotelExpense" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomId" TEXT,
    "roomNumberSnapshot" VARCHAR(40),
    "expenseDate" DATE NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "vendorName" VARCHAR(160),
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paymentStatus" VARCHAR(20) NOT NULL DEFAULT 'PAID',
    "paymentMethod" VARCHAR(30),
    "paidAt" TIMESTAMP(3),
    "documentNumber" VARCHAR(80),
    "notes" VARCHAR(1000),
    "idempotencyKey" VARCHAR(120) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "voidedAt" TIMESTAMP(3),
    "voidReason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelExpense_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "HotelExpense_id_hotelId_key"
  ON "HotelExpense"("id", "hotelId");

CREATE UNIQUE INDEX IF NOT EXISTS "HotelExpense_hotelId_idempotencyKey_key"
  ON "HotelExpense"("hotelId", "idempotencyKey");

CREATE INDEX IF NOT EXISTS "HotelExpense_hotelId_expenseDate_idx"
  ON "HotelExpense"("hotelId", "expenseDate");

CREATE INDEX IF NOT EXISTS "HotelExpense_hotelId_category_expenseDate_idx"
  ON "HotelExpense"("hotelId", "category", "expenseDate");

CREATE INDEX IF NOT EXISTS "HotelExpense_hotelId_paymentStatus_expenseDate_idx"
  ON "HotelExpense"("hotelId", "paymentStatus", "expenseDate");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HotelExpense_hotelId_fkey'
  ) THEN
    ALTER TABLE "HotelExpense"
      ADD CONSTRAINT "HotelExpense_hotelId_fkey"
      FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HotelExpense_roomId_fkey'
  ) THEN
    ALTER TABLE "HotelExpense"
      ADD CONSTRAINT "HotelExpense_roomId_fkey"
      FOREIGN KEY ("roomId") REFERENCES "Room"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
