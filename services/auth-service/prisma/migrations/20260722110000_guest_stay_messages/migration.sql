CREATE TABLE "GuestMessageThread" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "stayId" TEXT NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'OPEN',
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clearedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuestMessageThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestMessage" (
  "id" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "stayId" TEXT NOT NULL,
  "senderType" "GuestRequestActorType" NOT NULL,
  "senderUserId" TEXT,
  "sessionId" TEXT,
  "body" VARCHAR(1000) NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuestMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuestMessageThread_stayId_key" ON "GuestMessageThread"("stayId");
CREATE INDEX "GuestMessageThread_hotelId_status_lastMessageAt_idx" ON "GuestMessageThread"("hotelId", "status", "lastMessageAt");
CREATE INDEX "GuestMessageThread_roomId_lastMessageAt_idx" ON "GuestMessageThread"("roomId", "lastMessageAt");
CREATE INDEX "GuestMessageThread_expiresAt_idx" ON "GuestMessageThread"("expiresAt");
CREATE INDEX "GuestMessage_threadId_createdAt_idx" ON "GuestMessage"("threadId", "createdAt");
CREATE INDEX "GuestMessage_hotelId_createdAt_idx" ON "GuestMessage"("hotelId", "createdAt");
CREATE INDEX "GuestMessage_stayId_createdAt_idx" ON "GuestMessage"("stayId", "createdAt");

ALTER TABLE "GuestMessageThread" ADD CONSTRAINT "GuestMessageThread_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestMessageThread" ADD CONSTRAINT "GuestMessageThread_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestMessageThread" ADD CONSTRAINT "GuestMessageThread_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "GuestStay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestMessage" ADD CONSTRAINT "GuestMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "GuestMessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestMessage" ADD CONSTRAINT "GuestMessage_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestMessage" ADD CONSTRAINT "GuestMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestMessage" ADD CONSTRAINT "GuestMessage_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "GuestStay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestMessage" ADD CONSTRAINT "GuestMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestMessage" ADD CONSTRAINT "GuestMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GuestSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
