DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'HotelCoordinationStatus'
  ) THEN
    CREATE TYPE "HotelCoordinationStatus" AS ENUM (
      'RECEIVED',
      'ACKNOWLEDGED',
      'VOUCHER_ISSUED'
    );
  END IF;
END $$;

ALTER TABLE "MarketplaceOrder"
  ADD COLUMN IF NOT EXISTS "hotelCoordinationStatus" "HotelCoordinationStatus" NOT NULL DEFAULT 'RECEIVED';
