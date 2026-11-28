-- Add destinationAccount to track specific bank/cash accounts for booking deposits and manual revenue receipts
ALTER TABLE "BookingPayment" ADD COLUMN IF NOT EXISTS "destinationAccount" VARCHAR(120);
ALTER TABLE "HotelRevenueCollection" ADD COLUMN IF NOT EXISTS "destinationAccount" VARCHAR(120);
