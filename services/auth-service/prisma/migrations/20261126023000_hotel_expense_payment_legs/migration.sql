-- CreateTable: HotelExpensePayment
CREATE TABLE IF NOT EXISTS "HotelExpensePayment" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" VARCHAR(30),
    "paymentAccount" VARCHAR(120),
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" VARCHAR(500),
    "idempotencyKey" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelExpensePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HotelExpensePayment_hotelId_paidAt_idx" ON "HotelExpensePayment"("hotelId", "paidAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HotelExpensePayment_expenseId_idx" ON "HotelExpensePayment"("expenseId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'HotelExpensePayment_expenseId_fkey'
    ) THEN
        ALTER TABLE "HotelExpensePayment" ADD CONSTRAINT "HotelExpensePayment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "HotelExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'HotelExpensePayment_hotelId_fkey'
    ) THEN
        ALTER TABLE "HotelExpensePayment" ADD CONSTRAINT "HotelExpensePayment_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
