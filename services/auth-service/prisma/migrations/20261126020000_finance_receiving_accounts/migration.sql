-- Add destinationAccount/paymentAccount to track specific bank/cash accounts for receivables and expenses
ALTER TABLE "HotelExpense" ADD COLUMN IF NOT EXISTS "paymentAccount" VARCHAR(120);
ALTER TABLE "ReceivableCollection" ADD COLUMN IF NOT EXISTS "destinationAccount" VARCHAR(120);
