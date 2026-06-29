-- CreateEnum
CREATE TYPE "HotelStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'OCCUPIED', 'MAINTENANCE', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "RoomQRCodeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "GuestStayStatus" AS ENUM ('RESERVED', 'CHECKED_IN', 'ACTIVE', 'CHECKED_OUT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GuestSessionStatus" AS ENUM ('CREATED', 'ACTIVE', 'IDLE', 'EXPIRED', 'CLOSED');

-- CreateEnum
CREATE TYPE "GuestRequestType" AS ENUM ('HOUSEKEEPING', 'EXTRA_TOWELS', 'LAUNDRY', 'MAINTENANCE', 'FOOD_ORDERING', 'AIRPORT_TRANSFER', 'TOUR_BOOKING', 'ESIM_PURCHASE', 'AI_CONCIERGE');

-- CreateEnum
CREATE TYPE "GuestRequestStatus" AS ENUM ('CREATED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "GuestRequestPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "GuestRequestActorType" AS ENUM ('GUEST', 'STAFF', 'SYSTEM');

-- CreateEnum
CREATE TYPE "DomainEventStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "Hotel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "brandSettings" JSONB,
    "timezone" VARCHAR(80) NOT NULL DEFAULT 'Asia/Saigon',
    "status" "HotelStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomNumber" VARCHAR(40) NOT NULL,
    "floor" VARCHAR(40),
    "type" VARCHAR(80),
    "status" "RoomStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomQRCode" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "qrTokenHash" VARCHAR(64) NOT NULL,
    "publicCode" VARCHAR(120) NOT NULL,
    "status" "RoomQRCodeStatus" NOT NULL DEFAULT 'INACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "activatedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomQRCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestStay" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "reservationCode" VARCHAR(80) NOT NULL,
    "guestDisplayName" VARCHAR(120) NOT NULL,
    "guestPhoneMasked" VARCHAR(40),
    "status" "GuestStayStatus" NOT NULL DEFAULT 'RESERVED',
    "plannedCheckInAt" TIMESTAMP(3) NOT NULL,
    "plannedCheckOutAt" TIMESTAMP(3) NOT NULL,
    "checkedInAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),
    "accessCodeHash" VARCHAR(64),
    "accessCodeExpiresAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "closedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestStay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestSession" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "roomQrCodeId" TEXT NOT NULL,
    "sessionTokenHash" VARCHAR(64) NOT NULL,
    "status" "GuestSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "deviceFingerprintHash" VARCHAR(64),
    "ipHash" VARCHAR(64),
    "userAgent" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "idleAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "GuestSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestRequest" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "sessionId" TEXT,
    "type" "GuestRequestType" NOT NULL,
    "status" "GuestRequestStatus" NOT NULL DEFAULT 'CREATED',
    "priority" "GuestRequestPriority" NOT NULL DEFAULT 'NORMAL',
    "title" VARCHAR(160),
    "details" VARCHAR(1000),
    "metadata" JSONB,
    "assignedToUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "GuestRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestRequestEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "actorType" "GuestRequestActorType" NOT NULL,
    "actorUserId" TEXT,
    "sessionId" TEXT,
    "eventType" VARCHAR(80) NOT NULL,
    "fromStatus" "GuestRequestStatus",
    "toStatus" "GuestRequestStatus",
    "note" VARCHAR(1000),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestRequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainEvent" (
    "id" TEXT NOT NULL,
    "eventType" VARCHAR(80) NOT NULL,
    "aggregateType" VARCHAR(80) NOT NULL,
    "aggregateId" VARCHAR(120) NOT NULL,
    "hotelId" TEXT,
    "tenantId" TEXT,
    "payload" JSONB NOT NULL,
    "status" "DomainEventStatus" NOT NULL DEFAULT 'PENDING',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DomainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Hotel_tenantId_code_key" ON "Hotel"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Hotel_tenantId_status_idx" ON "Hotel"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Room_hotelId_roomNumber_key" ON "Room"("hotelId", "roomNumber");

-- CreateIndex
CREATE INDEX "Room_hotelId_status_idx" ON "Room"("hotelId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RoomQRCode_qrTokenHash_key" ON "RoomQRCode"("qrTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "RoomQRCode_publicCode_key" ON "RoomQRCode"("publicCode");

-- CreateIndex
CREATE INDEX "RoomQRCode_roomId_status_idx" ON "RoomQRCode"("roomId", "status");

-- CreateIndex
CREATE INDEX "RoomQRCode_hotelId_status_idx" ON "RoomQRCode"("hotelId", "status");

-- CreateIndex
CREATE INDEX "RoomQRCode_qrTokenHash_idx" ON "RoomQRCode"("qrTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "RoomQRCode_roomId_active_key" ON "RoomQRCode"("roomId") WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE INDEX "GuestStay_hotelId_status_idx" ON "GuestStay"("hotelId", "status");

-- CreateIndex
CREATE INDEX "GuestStay_roomId_status_idx" ON "GuestStay"("roomId", "status");

-- CreateIndex
CREATE INDEX "GuestStay_reservationCode_idx" ON "GuestStay"("reservationCode");

-- CreateIndex
CREATE INDEX "GuestStay_plannedCheckOutAt_idx" ON "GuestStay"("plannedCheckOutAt");

-- CreateIndex
CREATE UNIQUE INDEX "GuestStay_roomId_open_key" ON "GuestStay"("roomId") WHERE "status" IN ('CHECKED_IN', 'ACTIVE');

-- CreateIndex
CREATE UNIQUE INDEX "GuestSession_sessionTokenHash_key" ON "GuestSession"("sessionTokenHash");

-- CreateIndex
CREATE INDEX "GuestSession_stayId_status_idx" ON "GuestSession"("stayId", "status");

-- CreateIndex
CREATE INDEX "GuestSession_sessionTokenHash_idx" ON "GuestSession"("sessionTokenHash");

-- CreateIndex
CREATE INDEX "GuestSession_hotelId_status_lastSeenAt_idx" ON "GuestSession"("hotelId", "status", "lastSeenAt");

-- CreateIndex
CREATE INDEX "GuestRequest_hotelId_status_createdAt_idx" ON "GuestRequest"("hotelId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "GuestRequest_roomId_status_idx" ON "GuestRequest"("roomId", "status");

-- CreateIndex
CREATE INDEX "GuestRequest_stayId_createdAt_idx" ON "GuestRequest"("stayId", "createdAt");

-- CreateIndex
CREATE INDEX "GuestRequest_type_status_idx" ON "GuestRequest"("type", "status");

-- CreateIndex
CREATE INDEX "GuestRequestEvent_requestId_createdAt_idx" ON "GuestRequestEvent"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "GuestRequestEvent_hotelId_createdAt_idx" ON "GuestRequestEvent"("hotelId", "createdAt");

-- CreateIndex
CREATE INDEX "DomainEvent_eventType_occurredAt_idx" ON "DomainEvent"("eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "DomainEvent_hotelId_occurredAt_idx" ON "DomainEvent"("hotelId", "occurredAt");

-- CreateIndex
CREATE INDEX "DomainEvent_status_occurredAt_idx" ON "DomainEvent"("status", "occurredAt");

-- AddForeignKey
ALTER TABLE "Hotel" ADD CONSTRAINT "Hotel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomQRCode" ADD CONSTRAINT "RoomQRCode_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomQRCode" ADD CONSTRAINT "RoomQRCode_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestStay" ADD CONSTRAINT "GuestStay_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestStay" ADD CONSTRAINT "GuestStay_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestStay" ADD CONSTRAINT "GuestStay_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestStay" ADD CONSTRAINT "GuestStay_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "GuestStay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_roomQrCodeId_fkey" FOREIGN KEY ("roomQrCodeId") REFERENCES "RoomQRCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestRequest" ADD CONSTRAINT "GuestRequest_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestRequest" ADD CONSTRAINT "GuestRequest_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestRequest" ADD CONSTRAINT "GuestRequest_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "GuestStay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestRequest" ADD CONSTRAINT "GuestRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GuestSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestRequest" ADD CONSTRAINT "GuestRequest_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestRequestEvent" ADD CONSTRAINT "GuestRequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "GuestRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestRequestEvent" ADD CONSTRAINT "GuestRequestEvent_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestRequestEvent" ADD CONSTRAINT "GuestRequestEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestRequestEvent" ADD CONSTRAINT "GuestRequestEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GuestSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainEvent" ADD CONSTRAINT "DomainEvent_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
