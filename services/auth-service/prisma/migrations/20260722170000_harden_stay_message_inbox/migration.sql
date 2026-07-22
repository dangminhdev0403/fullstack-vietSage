CREATE INDEX "GuestMessageThread_hotelId_lastMessageAt_id_idx"
ON "GuestMessageThread"("hotelId", "lastMessageAt", "id");

CREATE INDEX "GuestMessage_threadId_senderType_readAt_idx"
ON "GuestMessage"("threadId", "senderType", "readAt");
