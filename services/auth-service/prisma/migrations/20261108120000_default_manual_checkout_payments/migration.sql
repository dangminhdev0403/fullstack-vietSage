-- Checkout no longer asks the operator to choose a payment channel.
-- Keep historical values intact; only new omitted values use the neutral manual method.
ALTER TABLE "BookingPayment"
  ALTER COLUMN "paymentMethod" SET DEFAULT 'MANUAL';

ALTER TABLE "ReceivableCollection"
  ALTER COLUMN "paymentMethod" SET DEFAULT 'MANUAL';
