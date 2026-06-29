ALTER TYPE "GuestRequestStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "GuestRequestStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED';
ALTER TYPE "GuestRequestStatus" ADD VALUE IF NOT EXISTS 'ON_THE_WAY';
ALTER TYPE "GuestRequestStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TABLE "GuestRequest" ALTER COLUMN "status" SET DEFAULT 'PENDING';

CREATE TYPE "NotificationProvider" AS ENUM ('TELEGRAM');
CREATE TYPE "GuestRequestNotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "NotificationRoute" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "serviceCategoryId" TEXT,
  "telegramChatId" VARCHAR(128) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationRoute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestRequestNotification" (
  "id" TEXT NOT NULL,
  "guestRequestId" TEXT NOT NULL,
  "provider" "NotificationProvider" NOT NULL,
  "routeId" TEXT NOT NULL,
  "telegramChatId" VARCHAR(128) NOT NULL,
  "telegramMessageId" VARCHAR(64),
  "status" "GuestRequestNotificationStatus" NOT NULL DEFAULT 'PENDING',
  "errorMessage" VARCHAR(1000),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuestRequestNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotificationRoute_hotelId_serviceCategoryId_isActive_idx" ON "NotificationRoute"("hotelId", "serviceCategoryId", "isActive");
CREATE UNIQUE INDEX "GuestRequestNotification_guestRequestId_provider_key" ON "GuestRequestNotification"("guestRequestId", "provider");
ALTER TABLE "NotificationRoute" ADD CONSTRAINT "NotificationRoute_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationRoute" ADD CONSTRAINT "NotificationRoute_serviceCategoryId_fkey" FOREIGN KEY ("serviceCategoryId") REFERENCES "HotelServiceCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestRequestNotification" ADD CONSTRAINT "GuestRequestNotification_guestRequestId_fkey" FOREIGN KEY ("guestRequestId") REFERENCES "GuestRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestRequestNotification" ADD CONSTRAINT "GuestRequestNotification_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "NotificationRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
