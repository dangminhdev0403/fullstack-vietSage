CREATE TYPE "MarketplaceOrderStatus" AS ENUM ('PENDING', 'ACCEPTED', 'PREPARING', 'DELIVERING', 'READY', 'COMPLETED', 'CANCELLED');
CREATE TYPE "MarketplaceOrderActorType" AS ENUM ('GUEST', 'SERVICE_STAFF', 'HOTEL_STAFF', 'SYSTEM');
CREATE TYPE "CapacityReservationStatus" AS ENUM ('RESERVED', 'RELEASED', 'CONSUMED', 'NOT_REQUIRED');

CREATE TABLE "MarketplaceOrder" (
  "id" TEXT NOT NULL,
  "orderNumber" VARCHAR(32) NOT NULL,
  "idempotencyKey" VARCHAR(120) NOT NULL,
  "hotelId" TEXT NOT NULL,
  "stayId" TEXT NOT NULL,
  "serviceTenantId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPriceSnapshot" DECIMAL(12,2) NOT NULL,
  "totalAmount" DECIMAL(12,2) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "serviceNameSnapshot" VARCHAR(160) NOT NULL,
  "serviceModeSnapshot" "MarketplaceServiceMode" NOT NULL,
  "waitingMinutesSnapshot" INTEGER NOT NULL,
  "guestNote" VARCHAR(500),
  "status" "MarketplaceOrderStatus" NOT NULL DEFAULT 'PENDING',
  "capacityReservationStatus" "CapacityReservationStatus" NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chk_marketplace_order_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "chk_marketplace_order_amounts_non_negative" CHECK ("unitPriceSnapshot" >= 0 AND "totalAmount" >= 0),
  CONSTRAINT "chk_marketplace_order_waiting_non_negative" CHECK ("waitingMinutesSnapshot" >= 0),
  CONSTRAINT "chk_marketplace_order_version_min" CHECK ("version" >= 1)
);

CREATE TABLE "MarketplaceOrderEvent" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "actorType" "MarketplaceOrderActorType" NOT NULL,
  "actorId" TEXT,
  "fromStatus" "MarketplaceOrderStatus",
  "toStatus" "MarketplaceOrderStatus" NOT NULL,
  "note" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketplaceOrderEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketplaceRevenueEntry" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "serviceTenantId" TEXT NOT NULL,
  "grossAmount" DECIMAL(12,2) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "recognizedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketplaceRevenueEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chk_marketplace_revenue_gross_non_negative" CHECK ("grossAmount" >= 0)
);

CREATE UNIQUE INDEX "MarketplaceOrder_orderNumber_key" ON "MarketplaceOrder"("orderNumber");
CREATE UNIQUE INDEX "MarketplaceOrder_stayId_idempotencyKey_key" ON "MarketplaceOrder"("stayId", "idempotencyKey");
CREATE INDEX "MarketplaceOrder_serviceTenantId_status_createdAt_idx" ON "MarketplaceOrder"("serviceTenantId", "status", "createdAt");
CREATE INDEX "MarketplaceOrder_hotelId_status_createdAt_idx" ON "MarketplaceOrder"("hotelId", "status", "createdAt");
CREATE INDEX "MarketplaceOrder_stayId_createdAt_idx" ON "MarketplaceOrder"("stayId", "createdAt");
CREATE INDEX "MarketplaceOrderEvent_orderId_createdAt_idx" ON "MarketplaceOrderEvent"("orderId", "createdAt");
CREATE UNIQUE INDEX "MarketplaceRevenueEntry_orderId_key" ON "MarketplaceRevenueEntry"("orderId");
CREATE INDEX "MarketplaceRevenueEntry_hotelId_recognizedAt_idx" ON "MarketplaceRevenueEntry"("hotelId", "recognizedAt");
CREATE INDEX "MarketplaceRevenueEntry_serviceTenantId_recognizedAt_idx" ON "MarketplaceRevenueEntry"("serviceTenantId", "recognizedAt");

ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "GuestStay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_serviceTenantId_fkey" FOREIGN KEY ("serviceTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "MarketplaceService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceOrderEvent" ADD CONSTRAINT "MarketplaceOrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MarketplaceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceRevenueEntry" ADD CONSTRAINT "MarketplaceRevenueEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MarketplaceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
