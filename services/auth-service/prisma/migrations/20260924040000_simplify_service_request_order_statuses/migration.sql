BEGIN;

-- 1. Create new simplified enum types
CREATE TYPE "GuestRequestStatus_new" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'COMPLETED', 'CANCELLED', 'REJECTED');
CREATE TYPE "MarketplaceOrderStatus_new" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'COMPLETED', 'CANCELLED', 'REJECTED');

-- 2. Drop defaults
ALTER TABLE "GuestRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "MarketplaceOrder" ALTER COLUMN "status" DROP DEFAULT;

-- 3. Convert GuestRequest.status
ALTER TABLE "GuestRequest" ALTER COLUMN "status" TYPE "GuestRequestStatus_new" USING (
  CASE "status"::text
    WHEN 'NEW' THEN 'PENDING'::"GuestRequestStatus_new"
    WHEN 'CREATED' THEN 'PENDING'::"GuestRequestStatus_new"
    WHEN 'PENDING' THEN 'PENDING'::"GuestRequestStatus_new"
    WHEN 'CONFIRMED' THEN 'ACKNOWLEDGED'::"GuestRequestStatus_new"
    WHEN 'ACCEPTED' THEN 'ACKNOWLEDGED'::"GuestRequestStatus_new"
    WHEN 'ACKNOWLEDGED' THEN 'ACKNOWLEDGED'::"GuestRequestStatus_new"
    WHEN 'ON_THE_WAY' THEN 'ACKNOWLEDGED'::"GuestRequestStatus_new"
    WHEN 'IN_PROGRESS' THEN 'ACKNOWLEDGED'::"GuestRequestStatus_new"
    WHEN 'COMPLETED' THEN 'COMPLETED'::"GuestRequestStatus_new"
    WHEN 'REJECTED' THEN 'REJECTED'::"GuestRequestStatus_new"
    WHEN 'CANCELLED' THEN 'CANCELLED'::"GuestRequestStatus_new"
    WHEN 'FAILED' THEN 'REJECTED'::"GuestRequestStatus_new"
    ELSE 'PENDING'::"GuestRequestStatus_new"
  END
);
ALTER TABLE "GuestRequest" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"GuestRequestStatus_new";

-- 4. Convert GuestRequestEvent.fromStatus and toStatus
ALTER TABLE "GuestRequestEvent" ALTER COLUMN "fromStatus" TYPE "GuestRequestStatus_new" USING (
  CASE "fromStatus"::text
    WHEN 'NEW' THEN 'PENDING'::"GuestRequestStatus_new"
    WHEN 'CREATED' THEN 'PENDING'::"GuestRequestStatus_new"
    WHEN 'PENDING' THEN 'PENDING'::"GuestRequestStatus_new"
    WHEN 'CONFIRMED' THEN 'ACKNOWLEDGED'::"GuestRequestStatus_new"
    WHEN 'ACCEPTED' THEN 'ACKNOWLEDGED'::"GuestRequestStatus_new"
    WHEN 'ACKNOWLEDGED' THEN 'ACKNOWLEDGED'::"GuestRequestStatus_new"
    WHEN 'ON_THE_WAY' THEN 'ACKNOWLEDGED'::"GuestRequestStatus_new"
    WHEN 'IN_PROGRESS' THEN 'ACKNOWLEDGED'::"GuestRequestStatus_new"
    WHEN 'COMPLETED' THEN 'COMPLETED'::"GuestRequestStatus_new"
    WHEN 'REJECTED' THEN 'REJECTED'::"GuestRequestStatus_new"
    WHEN 'CANCELLED' THEN 'CANCELLED'::"GuestRequestStatus_new"
    WHEN 'FAILED' THEN 'REJECTED'::"GuestRequestStatus_new"
    ELSE NULL
  END
);

ALTER TABLE "GuestRequestEvent" ALTER COLUMN "toStatus" TYPE "GuestRequestStatus_new" USING (
  CASE "toStatus"::text
    WHEN 'NEW' THEN 'PENDING'::"GuestRequestStatus_new"
    WHEN 'CREATED' THEN 'PENDING'::"GuestRequestStatus_new"
    WHEN 'PENDING' THEN 'PENDING'::"GuestRequestStatus_new"
    WHEN 'CONFIRMED' THEN 'ACKNOWLEDGED'::"GuestRequestStatus_new"
    WHEN 'ACCEPTED' THEN 'ACKNOWLEDGED'::"GuestRequestStatus_new"
    WHEN 'ACKNOWLEDGED' THEN 'ACKNOWLEDGED'::"GuestRequestStatus_new"
    WHEN 'ON_THE_WAY' THEN 'ACKNOWLEDGED'::"GuestRequestStatus_new"
    WHEN 'IN_PROGRESS' THEN 'ACKNOWLEDGED'::"GuestRequestStatus_new"
    WHEN 'COMPLETED' THEN 'COMPLETED'::"GuestRequestStatus_new"
    WHEN 'REJECTED' THEN 'REJECTED'::"GuestRequestStatus_new"
    WHEN 'CANCELLED' THEN 'CANCELLED'::"GuestRequestStatus_new"
    WHEN 'FAILED' THEN 'REJECTED'::"GuestRequestStatus_new"
    ELSE NULL
  END
);

-- 5. Drop old GuestRequestStatus type and rename new type
DROP TYPE "GuestRequestStatus";
ALTER TYPE "GuestRequestStatus_new" RENAME TO "GuestRequestStatus";

-- 6. Convert MarketplaceOrder.status
ALTER TABLE "MarketplaceOrder" ALTER COLUMN "status" TYPE "MarketplaceOrderStatus_new" USING (
  CASE "status"::text
    WHEN 'PENDING' THEN 'PENDING'::"MarketplaceOrderStatus_new"
    WHEN 'CONFIRMED' THEN 'ACKNOWLEDGED'::"MarketplaceOrderStatus_new"
    WHEN 'ACCEPTED' THEN 'ACKNOWLEDGED'::"MarketplaceOrderStatus_new"
    WHEN 'PREPARING' THEN 'ACKNOWLEDGED'::"MarketplaceOrderStatus_new"
    WHEN 'DELIVERING' THEN 'ACKNOWLEDGED'::"MarketplaceOrderStatus_new"
    WHEN 'READY' THEN 'ACKNOWLEDGED'::"MarketplaceOrderStatus_new"
    WHEN 'COMPLETED' THEN 'COMPLETED'::"MarketplaceOrderStatus_new"
    WHEN 'CANCELLED' THEN 'CANCELLED'::"MarketplaceOrderStatus_new"
    WHEN 'REJECTED' THEN 'REJECTED'::"MarketplaceOrderStatus_new"
    ELSE 'PENDING'::"MarketplaceOrderStatus_new"
  END
);
ALTER TABLE "MarketplaceOrder" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"MarketplaceOrderStatus_new";

-- 7. Convert MarketplaceOrderEvent.fromStatus and toStatus
ALTER TABLE "MarketplaceOrderEvent" ALTER COLUMN "fromStatus" TYPE "MarketplaceOrderStatus_new" USING (
  CASE "fromStatus"::text
    WHEN 'PENDING' THEN 'PENDING'::"MarketplaceOrderStatus_new"
    WHEN 'CONFIRMED' THEN 'ACKNOWLEDGED'::"MarketplaceOrderStatus_new"
    WHEN 'ACCEPTED' THEN 'ACKNOWLEDGED'::"MarketplaceOrderStatus_new"
    WHEN 'PREPARING' THEN 'ACKNOWLEDGED'::"MarketplaceOrderStatus_new"
    WHEN 'DELIVERING' THEN 'ACKNOWLEDGED'::"MarketplaceOrderStatus_new"
    WHEN 'READY' THEN 'ACKNOWLEDGED'::"MarketplaceOrderStatus_new"
    WHEN 'COMPLETED' THEN 'COMPLETED'::"MarketplaceOrderStatus_new"
    WHEN 'CANCELLED' THEN 'CANCELLED'::"MarketplaceOrderStatus_new"
    WHEN 'REJECTED' THEN 'REJECTED'::"MarketplaceOrderStatus_new"
    ELSE NULL
  END
);

ALTER TABLE "MarketplaceOrderEvent" ALTER COLUMN "toStatus" TYPE "MarketplaceOrderStatus_new" USING (
  CASE "toStatus"::text
    WHEN 'PENDING' THEN 'PENDING'::"MarketplaceOrderStatus_new"
    WHEN 'CONFIRMED' THEN 'ACKNOWLEDGED'::"MarketplaceOrderStatus_new"
    WHEN 'ACCEPTED' THEN 'ACKNOWLEDGED'::"MarketplaceOrderStatus_new"
    WHEN 'PREPARING' THEN 'ACKNOWLEDGED'::"MarketplaceOrderStatus_new"
    WHEN 'DELIVERING' THEN 'ACKNOWLEDGED'::"MarketplaceOrderStatus_new"
    WHEN 'READY' THEN 'ACKNOWLEDGED'::"MarketplaceOrderStatus_new"
    WHEN 'COMPLETED' THEN 'COMPLETED'::"MarketplaceOrderStatus_new"
    WHEN 'CANCELLED' THEN 'CANCELLED'::"MarketplaceOrderStatus_new"
    WHEN 'REJECTED' THEN 'REJECTED'::"MarketplaceOrderStatus_new"
    ELSE 'PENDING'::"MarketplaceOrderStatus_new"
  END
);

-- 8. Drop old MarketplaceOrderStatus type and rename new type
DROP TYPE "MarketplaceOrderStatus";
ALTER TYPE "MarketplaceOrderStatus_new" RENAME TO "MarketplaceOrderStatus";

COMMIT;
