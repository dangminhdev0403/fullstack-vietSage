-- Ensure neutral MANUAL default for Payment method, aligning with BookingPayment and ReceivableCollection
-- Streamlined hospitality operations: eliminate redundant payment method and partner channel requirements
ALTER TABLE "Payment"
  ALTER COLUMN "method" SET DEFAULT 'MANUAL';
