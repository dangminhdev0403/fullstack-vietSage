-- Public LocalMate uses its own opaque session. Existing GuestOS orders remain unchanged.
CREATE TABLE "PublicLocalMateSession" (
    "id" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "location" VARCHAR(120) NOT NULL,
    "guestDisplayName" VARCHAR(120),
    "guestPhone" VARCHAR(40),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicLocalMateSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublicLocalMateSession_tokenHash_key"
ON "PublicLocalMateSession"("tokenHash");
CREATE INDEX "PublicLocalMateSession_expiresAt_idx"
ON "PublicLocalMateSession"("expiresAt");

ALTER TABLE "MarketplaceOrder"
    ALTER COLUMN "hotelId" DROP NOT NULL,
    ALTER COLUMN "stayId" DROP NOT NULL,
    ADD COLUMN "publicSessionId" TEXT;

ALTER TABLE "MarketplaceOrder"
ADD CONSTRAINT "MarketplaceOrder_customer_scope_check" CHECK (
    (
        "hotelId" IS NOT NULL AND
        "stayId" IS NOT NULL AND
        "publicSessionId" IS NULL
    ) OR (
        "hotelId" IS NULL AND
        "stayId" IS NULL AND
        "publicSessionId" IS NOT NULL
    )
);

CREATE UNIQUE INDEX "MarketplaceOrder_publicSessionId_idempotencyKey_key"
ON "MarketplaceOrder"("publicSessionId", "idempotencyKey");
CREATE INDEX "MarketplaceOrder_publicSessionId_createdAt_idx"
ON "MarketplaceOrder"("publicSessionId", "createdAt");
ALTER TABLE "MarketplaceOrder"
ADD CONSTRAINT "MarketplaceOrder_publicSessionId_fkey"
FOREIGN KEY ("publicSessionId") REFERENCES "PublicLocalMateSession"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MarketplaceConversation"
    ALTER COLUMN "hotelId" DROP NOT NULL,
    ALTER COLUMN "stayId" DROP NOT NULL,
    ADD COLUMN "publicSessionId" TEXT;

ALTER TABLE "MarketplaceConversation"
ADD CONSTRAINT "MarketplaceConversation_customer_scope_check" CHECK (
    (
        "hotelId" IS NOT NULL AND
        "stayId" IS NOT NULL AND
        "publicSessionId" IS NULL
    ) OR (
        "hotelId" IS NULL AND
        "stayId" IS NULL AND
        "publicSessionId" IS NOT NULL
    )
);

CREATE INDEX "MarketplaceConversation_publicSessionId_lastMessageAt_idx"
ON "MarketplaceConversation"("publicSessionId", "lastMessageAt");
ALTER TABLE "MarketplaceConversation"
ADD CONSTRAINT "MarketplaceConversation_publicSessionId_fkey"
FOREIGN KEY ("publicSessionId") REFERENCES "PublicLocalMateSession"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
