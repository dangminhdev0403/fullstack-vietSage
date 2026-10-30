-- Drop redundant indexes
DROP INDEX IF EXISTS "PlatformBillingContractRevision_contractId_effectiveFrom_idx";
DROP INDEX IF EXISTS "GuestSession_sessionTokenHash_idx";
DROP INDEX IF EXISTS "Folio_hotelId_idx";
DROP INDEX IF EXISTS "FolioItem_hotelId_idx";
DROP INDEX IF EXISTS "Invoice_hotelId_idx";
DROP INDEX IF EXISTS "Payment_hotelId_idx";
DROP INDEX IF EXISTS "ServiceVoucher_voucherNumber_idx";
DROP INDEX IF EXISTS "LocalMateProfile_guideCode_idx";
DROP INDEX IF EXISTS "LocalMateProfile_userId_idx";
DROP INDEX IF EXISTS "LocalMateTourKnowledge_tourCode_idx";
DROP INDEX IF EXISTS "LocalMateTelegramPairingToken_tokenHash_idx";

-- Create optimized operational and messaging indexes
CREATE INDEX IF NOT EXISTS "TenantUser_userId_status_idx" ON "TenantUser"("userId", "status");
CREATE INDEX IF NOT EXISTS "Reservation_hotelId_plannedCheckInAt_plannedCheckOutAt_idx" ON "Reservation"("hotelId", "plannedCheckInAt", "plannedCheckOutAt");
CREATE INDEX IF NOT EXISTS "GuestSession_roomId_status_idx" ON "GuestSession"("roomId", "status");
CREATE INDEX IF NOT EXISTS "GuestSession_roomQrCodeId_idx" ON "GuestSession"("roomQrCodeId");
CREATE INDEX IF NOT EXISTS "GuestMessage_hotelId_senderType_readAt_threadId_idx" ON "GuestMessage"("hotelId", "senderType", "readAt", "threadId");
CREATE INDEX IF NOT EXISTS "GuestMessage_stayId_hotelId_senderType_readAt_idx" ON "GuestMessage"("stayId", "hotelId", "senderType", "readAt");
CREATE INDEX IF NOT EXISTS "ChannelSyncLog_hotelId_syncType_status_idx" ON "ChannelSyncLog"("hotelId", "syncType", "status");
