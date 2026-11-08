-- Reconcile indexes that exist in prisma/schema.prisma with the deployed database.
-- IF NOT EXISTS / IF EXISTS keep this repair safe for databases with partial index drift.
CREATE INDEX IF NOT EXISTS "AuthSession_roleId_idx"
  ON "AuthSession"("roleId");

CREATE INDEX IF NOT EXISTS "BookingPayment_hotelId_createdAt_idx"
  ON "BookingPayment"("hotelId", "createdAt");

CREATE INDEX IF NOT EXISTS "BookingPaymentAllocation_reservationId_idx"
  ON "BookingPaymentAllocation"("reservationId");

CREATE INDEX IF NOT EXISTS "BookingPaymentAllocation_groupId_idx"
  ON "BookingPaymentAllocation"("groupId");

DROP INDEX IF EXISTS "Code_name_idx";

CREATE INDEX IF NOT EXISTS "EmergencyCallEvent_hotelServiceItemId_idx"
  ON "EmergencyCallEvent"("hotelServiceItemId");

CREATE INDEX IF NOT EXISTS "GuestRequest_sessionId_idx"
  ON "GuestRequest"("sessionId");

CREATE INDEX IF NOT EXISTS "GuestRequest_assignedToUserId_idx"
  ON "GuestRequest"("assignedToUserId");

CREATE INDEX IF NOT EXISTS "GuestRequestNotification_routeId_idx"
  ON "GuestRequestNotification"("routeId");

CREATE INDEX IF NOT EXISTS "GuestRequestNotification_status_idx"
  ON "GuestRequestNotification"("status");

CREATE INDEX IF NOT EXISTS "MarketplaceOrder_serviceId_idx"
  ON "MarketplaceOrder"("serviceId");

CREATE INDEX IF NOT EXISTS "ServiceVoucher_serviceId_idx"
  ON "ServiceVoucher"("serviceId");

CREATE INDEX IF NOT EXISTS "ServiceVoucher_verificationCode_idx"
  ON "ServiceVoucher"("verificationCode");

CREATE INDEX IF NOT EXISTS "ServiceVoucher_qrTokenHash_idx"
  ON "ServiceVoucher"("qrTokenHash");
