-- CreateEnum
CREATE TYPE "KbttAutoSubmitRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationRoutePurpose" AS ENUM ('SERVICE_REQUEST', 'KBTT_AUTO_SUBMIT');

-- AlterTable
ALTER TABLE "KbttHotelConnection" ADD COLUMN "autoSubmitEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "autoSubmitTime" VARCHAR(8);

-- AlterTable
ALTER TABLE "NotificationRoute" ADD COLUMN "purpose" "NotificationRoutePurpose" NOT NULL DEFAULT 'SERVICE_REQUEST';

-- CreateTable
CREATE TABLE "KbttAutoSubmitRun" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "KbttAutoSubmitRunStatus" NOT NULL DEFAULT 'RUNNING',
    "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "unknownCount" INTEGER NOT NULL DEFAULT 0,
    "telegramSent" BOOLEAN NOT NULL DEFAULT false,
    "telegramMessageId" VARCHAR(64),
    "summaryJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KbttAutoSubmitRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KbttAutoSubmitRun_hotelId_scheduledFor_key" ON "KbttAutoSubmitRun"("hotelId", "scheduledFor");

-- CreateIndex
CREATE INDEX "KbttAutoSubmitRun_hotelId_createdAt_idx" ON "KbttAutoSubmitRun"("hotelId", "createdAt");

-- CreateIndex
CREATE INDEX "KbttAutoSubmitRun_status_leaseExpiresAt_idx" ON "KbttAutoSubmitRun"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "NotificationRoute_hotelId_purpose_isActive_idx" ON "NotificationRoute"("hotelId", "purpose", "isActive");

-- AddForeignKey
ALTER TABLE "KbttAutoSubmitRun" ADD CONSTRAINT "KbttAutoSubmitRun_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
