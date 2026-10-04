-- LocalMate uses a distinct platform-fee policy; existing delivery pricing is unchanged.
ALTER TABLE "MarketplacePricingConfig"
ADD COLUMN "localMatePlatformFeeRate" DECIMAL(5,2) NOT NULL DEFAULT 15.00;

CREATE TYPE "MarketplacePaymentProvider" AS ENUM ('STRIPE');
CREATE TYPE "MarketplaceOrderPaymentStatus" AS ENUM (
    'CREATING',
    'OPEN',
    'NOT_REQUIRED',
    'PAID',
    'EXPIRED',
    'CANCELLED',
    'REFUND_PENDING',
    'REFUNDED',
    'FAILED',
    'DISPUTED'
);
CREATE TYPE "MarketplaceGuideNotificationStatus" AS ENUM (
    'BLOCKED',
    'PENDING',
    'SENDING',
    'SENT',
    'FAILED'
);
CREATE TYPE "MarketplacePaymentEventOutcome" AS ENUM ('PROCESSED', 'IGNORED', 'REJECTED');

CREATE TABLE "MarketplaceOrderPayment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" "MarketplacePaymentProvider" NOT NULL DEFAULT 'STRIPE',
    "status" "MarketplaceOrderPaymentStatus" NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'VND',
    "tourTotalAmount" DECIMAL(12,2) NOT NULL,
    "platformFeeRateSnapshot" DECIMAL(5,2) NOT NULL,
    "platformFeeAmount" DECIMAL(12,2) NOT NULL,
    "guideRemainingAmount" DECIMAL(12,2) NOT NULL,
    "providerCheckoutSessionId" VARCHAR(255),
    "providerPaymentIntentId" VARCHAR(255),
    "checkoutUrl" VARCHAR(2048),
    "expiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refundedAt" TIMESTAMP(3),
    "guideNotificationStatus" "MarketplaceGuideNotificationStatus" NOT NULL DEFAULT 'BLOCKED',
    "notificationAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "notificationNextAttemptAt" TIMESTAMP(3),
    "notificationLeaseUntil" TIMESTAMP(3),
    "notificationSentAt" TIMESTAMP(3),
    "lastProviderErrorCode" VARCHAR(80),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceOrderPayment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MarketplaceOrderPayment_amounts_check" CHECK (
        "tourTotalAmount" >= 0 AND
        "platformFeeRateSnapshot" >= 0 AND
        "platformFeeRateSnapshot" <= 100 AND
        "platformFeeAmount" >= 0 AND
        "guideRemainingAmount" >= 0 AND
        "platformFeeAmount" + "guideRemainingAmount" = "tourTotalAmount" AND
        "refundedAmount" >= 0 AND
        "refundedAmount" <= "platformFeeAmount"
    )
);

CREATE UNIQUE INDEX "MarketplaceOrderPayment_orderId_key" ON "MarketplaceOrderPayment"("orderId");
CREATE UNIQUE INDEX "MarketplaceOrderPayment_providerCheckoutSessionId_key" ON "MarketplaceOrderPayment"("providerCheckoutSessionId");
CREATE UNIQUE INDEX "MarketplaceOrderPayment_providerPaymentIntentId_key" ON "MarketplaceOrderPayment"("providerPaymentIntentId");
CREATE INDEX "MarketplaceOrderPayment_status_expiresAt_idx" ON "MarketplaceOrderPayment"("status", "expiresAt");
CREATE INDEX "MarketplaceOrderPayment_guideNotificationStatus_notificationNextAttemptAt_idx" ON "MarketplaceOrderPayment"("guideNotificationStatus", "notificationNextAttemptAt");
ALTER TABLE "MarketplaceOrderPayment"
ADD CONSTRAINT "MarketplaceOrderPayment_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "MarketplaceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "MarketplacePaymentProviderEvent" (
    "id" TEXT NOT NULL,
    "provider" "MarketplacePaymentProvider" NOT NULL,
    "providerEventId" VARCHAR(255) NOT NULL,
    "eventType" VARCHAR(120) NOT NULL,
    "paymentId" TEXT,
    "outcome" "MarketplacePaymentEventOutcome" NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplacePaymentProviderEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketplacePaymentProviderEvent_providerEventId_key" ON "MarketplacePaymentProviderEvent"("providerEventId");
CREATE INDEX "MarketplacePaymentProviderEvent_paymentId_createdAt_idx" ON "MarketplacePaymentProviderEvent"("paymentId", "createdAt");
CREATE INDEX "MarketplacePaymentProviderEvent_provider_eventType_createdAt_idx" ON "MarketplacePaymentProviderEvent"("provider", "eventType", "createdAt");
ALTER TABLE "MarketplacePaymentProviderEvent"
ADD CONSTRAINT "MarketplacePaymentProviderEvent_paymentId_fkey"
FOREIGN KEY ("paymentId") REFERENCES "MarketplaceOrderPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;