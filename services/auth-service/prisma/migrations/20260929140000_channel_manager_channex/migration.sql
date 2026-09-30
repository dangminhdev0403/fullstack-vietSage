DO $$
BEGIN
  CREATE TYPE "ChannelCode" AS ENUM (
    'AIRBNB_ICAL',
    'BOOKING_ICAL',
    'AGODA_ICAL',
    'DIRECT_BOOKING',
    'CHANNEX'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ChannelConnectionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "ChannelCode" ADD VALUE 'CHANNEX';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "roomTypeSnapshot" VARCHAR(80);

CREATE TABLE IF NOT EXISTS "ChannelConnection" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "channelCode" "ChannelCode" NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "status" "ChannelConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
  "inboundIcalUrl" TEXT,
  "outboundToken" VARCHAR(120) NOT NULL,
  "priceMultiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.0,
  "lastSyncAt" TIMESTAMP(3),
  "lastSyncStatus" VARCHAR(40),
  "syncErrorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChannelConnection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChannelConnection_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChannelConnection_outboundToken_key" ON "ChannelConnection"("outboundToken");
CREATE INDEX IF NOT EXISTS "ChannelConnection_hotelId_idx" ON "ChannelConnection"("hotelId");
CREATE INDEX IF NOT EXISTS "ChannelConnection_channelCode_idx" ON "ChannelConnection"("channelCode");
CREATE INDEX IF NOT EXISTS "ChannelConnection_status_idx" ON "ChannelConnection"("status");

CREATE TABLE IF NOT EXISTS "ChannelRoomMapping" (
  "id" TEXT NOT NULL,
  "channelConnectionId" TEXT NOT NULL,
  "roomId" TEXT,
  "roomType" VARCHAR(80),
  "channelRoomCode" VARCHAR(120) NOT NULL,
  "channelRoomName" VARCHAR(160) NOT NULL,
  CONSTRAINT "ChannelRoomMapping_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChannelRoomMapping_channelConnectionId_fkey" FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChannelRoomMapping_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ChannelRoomMapping_channelConnectionId_idx" ON "ChannelRoomMapping"("channelConnectionId");
CREATE INDEX IF NOT EXISTS "ChannelRoomMapping_roomId_idx" ON "ChannelRoomMapping"("roomId");

CREATE TABLE IF NOT EXISTS "ChannelDailyAvailability" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "roomType" VARCHAR(80) NOT NULL,
  "date" DATE NOT NULL,
  "totalRooms" INTEGER NOT NULL DEFAULT 0,
  "bookedRooms" INTEGER NOT NULL DEFAULT 0,
  "blockedRooms" INTEGER NOT NULL DEFAULT 0,
  "availableRooms" INTEGER NOT NULL DEFAULT 0,
  "overrideAvailable" INTEGER,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChannelDailyAvailability_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChannelDailyAvailability_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChannelDailyAvailability_hotelId_roomType_date_key" ON "ChannelDailyAvailability"("hotelId", "roomType", "date");
CREATE INDEX IF NOT EXISTS "ChannelDailyAvailability_hotelId_date_idx" ON "ChannelDailyAvailability"("hotelId", "date");

CREATE TABLE IF NOT EXISTS "ChannelDailyRestriction" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "roomType" VARCHAR(80) NOT NULL,
  "ratePlanCode" VARCHAR(80) NOT NULL DEFAULT 'STANDARD',
  "date" DATE NOT NULL,
  "rate" DECIMAL(12,2) NOT NULL,
  "minStayArrival" INTEGER NOT NULL DEFAULT 1,
  "minStayThrough" INTEGER NOT NULL DEFAULT 1,
  "maxStay" INTEGER NOT NULL DEFAULT 0,
  "stopSell" BOOLEAN NOT NULL DEFAULT false,
  "closedToArrival" BOOLEAN NOT NULL DEFAULT false,
  "closedToDeparture" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChannelDailyRestriction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChannelDailyRestriction_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChannelDailyRestriction_hotelId_roomType_ratePlanCode_date_key" ON "ChannelDailyRestriction"("hotelId", "roomType", "ratePlanCode", "date");
CREATE INDEX IF NOT EXISTS "ChannelDailyRestriction_hotelId_date_idx" ON "ChannelDailyRestriction"("hotelId", "date");

CREATE TABLE IF NOT EXISTS "ChannelSyncLog" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "channelConnectionId" TEXT,
  "syncType" VARCHAR(40) NOT NULL,
  "status" VARCHAR(40) NOT NULL,
  "details" TEXT,
  "eventsCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChannelSyncLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChannelSyncLog_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChannelSyncLog_channelConnectionId_fkey" FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ChannelSyncLog_hotelId_createdAt_idx" ON "ChannelSyncLog"("hotelId", "createdAt");
CREATE INDEX IF NOT EXISTS "ChannelSyncLog_channelConnectionId_createdAt_idx" ON "ChannelSyncLog"("channelConnectionId", "createdAt");

CREATE TABLE IF NOT EXISTS "ChannexMapping" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "channelConnectionId" TEXT,
  "kind" VARCHAR(40) NOT NULL,
  "localId" VARCHAR(120) NOT NULL,
  "channexId" VARCHAR(120) NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChannexMapping_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChannexMapping_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChannexMapping_channelConnectionId_fkey" FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChannexMapping_kind_check" CHECK ("kind" IN ('property', 'room_type', 'rate_plan', 'booking'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChannexMapping_hotelId_kind_localId_key" ON "ChannexMapping"("hotelId", "kind", "localId");
DROP INDEX IF EXISTS "ChannexMapping_channexId_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "ChannexMapping_kind_channexId_key" ON "ChannexMapping"("kind", "channexId");
CREATE INDEX IF NOT EXISTS "ChannexMapping_hotelId_kind_idx" ON "ChannexMapping"("hotelId", "kind");

ALTER TABLE "ChannelConnection" DROP COLUMN IF EXISTS "credentials";
