-- Align reviewed historical drift with the current Prisma contract; retain all rows.
BEGIN;
SET LOCAL lock_timeout = '10s';
-- DropForeignKey
ALTER TABLE "PlatformBillableDay" DROP CONSTRAINT IF EXISTS "PlatformBillableDay_contractId_fkey";

-- DropForeignKey
ALTER TABLE "PlatformBillableDay" DROP CONSTRAINT IF EXISTS "PlatformBillableDay_contractRevisionId_fkey";

-- DropForeignKey
ALTER TABLE "PlatformBillableDay" DROP CONSTRAINT IF EXISTS "PlatformBillableDay_hotelId_fkey";

-- DropForeignKey
ALTER TABLE "PlatformBillingAdjustment" DROP CONSTRAINT IF EXISTS "PlatformBillingAdjustment_billableDayId_fkey";

-- DropForeignKey
ALTER TABLE "PlatformBillingAdjustment" DROP CONSTRAINT IF EXISTS "PlatformBillingAdjustment_contractId_fkey";

-- DropForeignKey
ALTER TABLE "PlatformBillingAdjustment" DROP CONSTRAINT IF EXISTS "PlatformBillingAdjustment_periodId_fkey";

-- DropForeignKey
ALTER TABLE "PlatformBillingContract" DROP CONSTRAINT IF EXISTS "PlatformBillingContract_hotelId_fkey";

-- DropForeignKey
ALTER TABLE "PlatformBillingContractRevision" DROP CONSTRAINT IF EXISTS "PlatformBillingContractRevision_contractId_fkey";

-- DropForeignKey
ALTER TABLE "PlatformBillingDailySummary" DROP CONSTRAINT IF EXISTS "PlatformBillingDailySummary_contractId_fkey";

-- DropForeignKey
ALTER TABLE "PlatformBillingDailySummary" DROP CONSTRAINT IF EXISTS "PlatformBillingDailySummary_hotelId_fkey";

-- DropForeignKey
ALTER TABLE "PlatformBillingPeriod" DROP CONSTRAINT IF EXISTS "PlatformBillingPeriod_contractId_fkey";

-- DropForeignKey
ALTER TABLE "PlatformBillingSettlement" DROP CONSTRAINT IF EXISTS "PlatformBillingSettlement_periodId_fkey";

-- DropForeignKey
ALTER TABLE "PlatformUsage" DROP CONSTRAINT IF EXISTS "PlatformUsage_hotelId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "MarketplaceService_serviceTenantId_status_idx";

-- AlterTable
ALTER TABLE "Hotel" ALTER COLUMN "timezone" SET DEFAULT 'Asia/Ho_Chi_Minh';

-- AlterTable
ALTER TABLE "LocalMateProfile" ALTER COLUMN "languages" DROP DEFAULT,
ALTER COLUMN "operatingRegions" DROP DEFAULT,
ALTER COLUMN "specialties" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LocalMateTourKnowledge" ALTER COLUMN "highlights" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PlatformBillingDailySummary" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MarketplaceService_serviceTenantId_status_updatedAt_idx" ON "MarketplaceService"("serviceTenantId", "status", "updatedAt");

-- AddForeignKey
ALTER TABLE "PlatformBillingContract" ADD CONSTRAINT "PlatformBillingContract_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformBillingContractRevision" ADD CONSTRAINT "PlatformBillingContractRevision_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "PlatformBillingContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformUsage" ADD CONSTRAINT "PlatformUsage_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformBillableDay" ADD CONSTRAINT "PlatformBillableDay_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "PlatformBillingContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformBillableDay" ADD CONSTRAINT "PlatformBillableDay_contractRevisionId_fkey" FOREIGN KEY ("contractRevisionId") REFERENCES "PlatformBillingContractRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformBillableDay" ADD CONSTRAINT "PlatformBillableDay_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformBillingPeriod" ADD CONSTRAINT "PlatformBillingPeriod_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "PlatformBillingContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformBillingAdjustment" ADD CONSTRAINT "PlatformBillingAdjustment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "PlatformBillingContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformBillingAdjustment" ADD CONSTRAINT "PlatformBillingAdjustment_billableDayId_fkey" FOREIGN KEY ("billableDayId") REFERENCES "PlatformBillableDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformBillingAdjustment" ADD CONSTRAINT "PlatformBillingAdjustment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PlatformBillingPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformBillingSettlement" ADD CONSTRAINT "PlatformBillingSettlement_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PlatformBillingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformBillingDailySummary" ADD CONSTRAINT "PlatformBillingDailySummary_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "PlatformBillingContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformBillingDailySummary" ADD CONSTRAINT "PlatformBillingDailySummary_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
DO $$ BEGIN IF to_regclass('"LocalMateTelegramBinding_localMateProfileId_revokedAt_block_idx"') IS NULL AND to_regclass('"LocalMateTelegramBinding_localMateProfileId_revokedAt_blockedAt"') IS NOT NULL THEN ALTER INDEX "LocalMateTelegramBinding_localMateProfileId_revokedAt_blockedAt" RENAME TO "LocalMateTelegramBinding_localMateProfileId_revokedAt_block_idx"; END IF; END $$;

-- RenameIndex
DO $$ BEGIN IF to_regclass('"MarketplaceConversationMessage_conversationId_clientMessage_key"') IS NULL AND to_regclass('"MarketplaceConversationMessage_conversationId_clientMessageId_k"') IS NOT NULL THEN ALTER INDEX "MarketplaceConversationMessage_conversationId_clientMessageId_k" RENAME TO "MarketplaceConversationMessage_conversationId_clientMessage_key"; END IF; END $$;

-- RenameIndex
DO $$ BEGIN IF to_regclass('"MarketplaceConversationMessage_telegramChatId_telegramMessa_key"') IS NULL AND to_regclass('"MarketplaceConversationMessage_telegramChatId_telegramMessageId"') IS NOT NULL THEN ALTER INDEX "MarketplaceConversationMessage_telegramChatId_telegramMessageId" RENAME TO "MarketplaceConversationMessage_telegramChatId_telegramMessa_key"; END IF; END $$;

-- RenameIndex
DO $$ BEGIN IF to_regclass('"PlatformBillableDay_contractId_subjectType_subjectId_servic_key"') IS NULL AND to_regclass('"PlatformBillableDay_contract_subject_date_key"') IS NOT NULL THEN ALTER INDEX "PlatformBillableDay_contract_subject_date_key" RENAME TO "PlatformBillableDay_contractId_subjectType_subjectId_servic_key"; END IF; END $$;

-- RenameIndex
DO $$ BEGIN IF to_regclass('"PlatformBillingPeriod_contractId_status_periodStart_periodE_idx"') IS NULL AND to_regclass('"PlatformBillingPeriod_contractId_status_periodStart_periodEnd_i"') IS NOT NULL THEN ALTER INDEX "PlatformBillingPeriod_contractId_status_periodStart_periodEnd_i" RENAME TO "PlatformBillingPeriod_contractId_status_periodStart_periodE_idx"; END IF; END $$;

-- RenameIndex
DO $$ BEGIN IF to_regclass('"Reservation_roomId_status_plannedCheckInAt_plannedCheckOutA_idx"') IS NULL AND to_regclass('"Reservation_roomId_status_plannedCheckInAt_plannedCheckOutAt_id"') IS NOT NULL THEN ALTER INDEX "Reservation_roomId_status_plannedCheckInAt_plannedCheckOutAt_id" RENAME TO "Reservation_roomId_status_plannedCheckInAt_plannedCheckOutA_idx"; END IF; END $$;


COMMIT;
