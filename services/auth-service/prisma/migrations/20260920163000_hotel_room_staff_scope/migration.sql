-- CreateEnum
CREATE TYPE "HotelStaffScopeMode" AS ENUM ('HOTEL_WIDE', 'ROOM_EXCLUSIVE');

-- AlterTable
ALTER TABLE "Hotel" ADD COLUMN "staffScopeMode" "HotelStaffScopeMode" NOT NULL DEFAULT 'HOTEL_WIDE';

-- CreateTable
CREATE TABLE "HotelRoomStaffAssignment" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelRoomStaffAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HotelRoomStaffAssignment_roomId_key" ON "HotelRoomStaffAssignment"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "HotelRoomStaffAssignment_userId_key" ON "HotelRoomStaffAssignment"("userId");

-- CreateIndex
CREATE INDEX "HotelRoomStaffAssignment_hotelId_idx" ON "HotelRoomStaffAssignment"("hotelId");

-- AddForeignKey
ALTER TABLE "HotelRoomStaffAssignment" ADD CONSTRAINT "HotelRoomStaffAssignment_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRoomStaffAssignment" ADD CONSTRAINT "HotelRoomStaffAssignment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRoomStaffAssignment" ADD CONSTRAINT "HotelRoomStaffAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRoomStaffAssignment" ADD CONSTRAINT "HotelRoomStaffAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
