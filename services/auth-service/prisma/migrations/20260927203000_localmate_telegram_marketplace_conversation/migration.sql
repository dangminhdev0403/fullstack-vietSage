-- Add nullable LocalMate relation to MarketplaceService
ALTER TABLE "MarketplaceService" ADD COLUMN "localMateProfileId" TEXT;
CREATE INDEX "MarketplaceService_localMateProfileId_idx" ON "MarketplaceService"("localMateProfileId");
ALTER TABLE "MarketplaceService" ADD CONSTRAINT "MarketplaceService_localMateProfileId_fkey" FOREIGN KEY ("localMateProfileId") REFERENCES "LocalMateProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add immutable-per-order LocalMate assignment, requested time, and party size to MarketplaceOrder
ALTER TABLE "MarketplaceOrder" ADD COLUMN "assignedLocalMateProfileId" TEXT;
ALTER TABLE "MarketplaceOrder" ADD COLUMN "requestedStartAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceOrder" ADD COLUMN "partySize" INTEGER;
CREATE INDEX "MarketplaceOrder_assignedLocalMateProfileId_idx" ON "MarketplaceOrder"("assignedLocalMateProfileId");
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_assignedLocalMateProfileId_fkey" FOREIGN KEY ("assignedLocalMateProfileId") REFERENCES "LocalMateProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create enum for message delivery status
CREATE TYPE "MarketplaceMessageDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'RECEIVED');

-- Create table LocalMateTelegramBinding
CREATE TABLE "LocalMateTelegramBinding" (
    "id" TEXT NOT NULL,
    "localMateProfileId" TEXT NOT NULL,
    "telegramUserId" VARCHAR(128) NOT NULL,
    "telegramChatId" VARCHAR(128) NOT NULL,
    "pairedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "blockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalMateTelegramBinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LocalMateTelegramBinding_localMateProfileId_key" ON "LocalMateTelegramBinding"("localMateProfileId");
CREATE INDEX "LocalMateTelegramBinding_telegramUserId_idx" ON "LocalMateTelegramBinding"("telegramUserId");
CREATE INDEX "LocalMateTelegramBinding_telegramChatId_idx" ON "LocalMateTelegramBinding"("telegramChatId");
CREATE INDEX "LocalMateTelegramBinding_localMateProfileId_revokedAt_blockedAt_idx" ON "LocalMateTelegramBinding"("localMateProfileId", "revokedAt", "blockedAt");
ALTER TABLE "LocalMateTelegramBinding" ADD CONSTRAINT "LocalMateTelegramBinding_localMateProfileId_fkey" FOREIGN KEY ("localMateProfileId") REFERENCES "LocalMateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create table LocalMateTelegramPairingToken
CREATE TABLE "LocalMateTelegramPairingToken" (
    "id" TEXT NOT NULL,
    "localMateProfileId" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalMateTelegramPairingToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LocalMateTelegramPairingToken_tokenHash_key" ON "LocalMateTelegramPairingToken"("tokenHash");
CREATE INDEX "LocalMateTelegramPairingToken_localMateProfileId_expiresAt_idx" ON "LocalMateTelegramPairingToken"("localMateProfileId", "expiresAt");
CREATE INDEX "LocalMateTelegramPairingToken_tokenHash_idx" ON "LocalMateTelegramPairingToken"("tokenHash");
ALTER TABLE "LocalMateTelegramPairingToken" ADD CONSTRAINT "LocalMateTelegramPairingToken_localMateProfileId_fkey" FOREIGN KEY ("localMateProfileId") REFERENCES "LocalMateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create table MarketplaceConversation
CREATE TABLE "MarketplaceConversation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "serviceTenantId" TEXT NOT NULL,
    "assignedLocalMateProfileId" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceConversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketplaceConversation_orderId_key" ON "MarketplaceConversation"("orderId");
CREATE INDEX "MarketplaceConversation_stayId_lastMessageAt_idx" ON "MarketplaceConversation"("stayId", "lastMessageAt");
CREATE INDEX "MarketplaceConversation_hotelId_lastMessageAt_idx" ON "MarketplaceConversation"("hotelId", "lastMessageAt");
CREATE INDEX "MarketplaceConversation_serviceTenantId_lastMessageAt_idx" ON "MarketplaceConversation"("serviceTenantId", "lastMessageAt");
ALTER TABLE "MarketplaceConversation" ADD CONSTRAINT "MarketplaceConversation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MarketplaceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create table MarketplaceConversationMessage
CREATE TABLE "MarketplaceConversationMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "senderType" "MarketplaceOrderActorType" NOT NULL,
    "senderUserId" TEXT,
    "body" VARCHAR(1000) NOT NULL,
    "clientMessageId" VARCHAR(80),
    "telegramChatId" VARCHAR(128),
    "telegramMessageId" VARCHAR(64),
    "deliveryStatus" "MarketplaceMessageDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastDeliveryError" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceConversationMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketplaceConversationMessage_conversationId_clientMessageId_key" ON "MarketplaceConversationMessage"("conversationId", "clientMessageId");
CREATE UNIQUE INDEX "MarketplaceConversationMessage_telegramChatId_telegramMessageId_key" ON "MarketplaceConversationMessage"("telegramChatId", "telegramMessageId");
CREATE INDEX "MarketplaceConversationMessage_conversationId_createdAt_idx" ON "MarketplaceConversationMessage"("conversationId", "createdAt");
CREATE INDEX "MarketplaceConversationMessage_orderId_createdAt_idx" ON "MarketplaceConversationMessage"("orderId", "createdAt");
CREATE INDEX "MarketplaceConversationMessage_deliveryStatus_nextAttemptAt_idx" ON "MarketplaceConversationMessage"("deliveryStatus", "nextAttemptAt");
ALTER TABLE "MarketplaceConversationMessage" ADD CONSTRAINT "MarketplaceConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "MarketplaceConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
