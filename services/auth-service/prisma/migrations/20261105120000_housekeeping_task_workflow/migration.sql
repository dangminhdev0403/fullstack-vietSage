-- CreateEnum
CREATE TYPE "HousekeepingTaskStatus" AS ENUM ('QUEUED', 'CLAIMED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HousekeepingTaskPriority" AS ENUM ('NORMAL', 'URGENT');

-- CreateEnum
CREATE TYPE "HousekeepingNotificationStatus" AS ENUM ('UNREAD', 'READ', 'DISMISSED');

-- CreateTable
CREATE TABLE "HousekeepingTask" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "stayId" TEXT,
    "status" "HousekeepingTaskStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" "HousekeepingTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "assignedToUserId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "blockedAt" TIMESTAMP(3),
    "blockReason" VARCHAR(500),
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HousekeepingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HousekeepingTaskHistory" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fromStatus" "HousekeepingTaskStatus",
    "toStatus" "HousekeepingTaskStatus" NOT NULL,
    "actorUserId" TEXT,
    "reason" VARCHAR(500),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HousekeepingTaskHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HousekeepingNotification" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "title" VARCHAR(200) NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "status" "HousekeepingNotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HousekeepingNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HousekeepingTask_hotelId_status_idx" ON "HousekeepingTask"("hotelId", "status");

-- CreateIndex
CREATE INDEX "HousekeepingTask_roomId_status_idx" ON "HousekeepingTask"("roomId", "status");

-- CreateIndex
CREATE INDEX "HousekeepingTask_assignedToUserId_status_idx" ON "HousekeepingTask"("assignedToUserId", "status");

-- CreateIndex
CREATE INDEX "HousekeepingTask_hotelId_priority_status_idx" ON "HousekeepingTask"("hotelId", "priority", "status");

-- A room may have only one active housekeeping task. The partial index closes
-- the race between concurrent manual task creation requests.
CREATE UNIQUE INDEX "HousekeepingTask_active_hotel_room_unique_idx"
ON "HousekeepingTask"("hotelId", "roomId")
WHERE "status" IN (
    'QUEUED'::"HousekeepingTaskStatus",
    'CLAIMED'::"HousekeepingTaskStatus",
    'IN_PROGRESS'::"HousekeepingTaskStatus",
    'BLOCKED'::"HousekeepingTaskStatus"
);

-- CreateIndex
CREATE INDEX "HousekeepingTaskHistory_taskId_createdAt_idx" ON "HousekeepingTaskHistory"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "HousekeepingNotification_hotelId_recipientUserId_status_idx" ON "HousekeepingNotification"("hotelId", "recipientUserId", "status");

-- CreateIndex
CREATE INDEX "HousekeepingNotification_taskId_idx" ON "HousekeepingNotification"("taskId");

-- AddForeignKey
ALTER TABLE "HousekeepingTask" ADD CONSTRAINT "HousekeepingTask_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingTask" ADD CONSTRAINT "HousekeepingTask_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingTask" ADD CONSTRAINT "HousekeepingTask_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "GuestStay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingTask" ADD CONSTRAINT "HousekeepingTask_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingTaskHistory" ADD CONSTRAINT "HousekeepingTaskHistory_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "HousekeepingTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingTaskHistory" ADD CONSTRAINT "HousekeepingTaskHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingNotification" ADD CONSTRAINT "HousekeepingNotification_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingNotification" ADD CONSTRAINT "HousekeepingNotification_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "HousekeepingTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingNotification" ADD CONSTRAINT "HousekeepingNotification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
