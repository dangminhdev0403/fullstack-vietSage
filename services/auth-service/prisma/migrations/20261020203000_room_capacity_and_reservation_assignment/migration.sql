-- AlterTable
ALTER TABLE "RoomType" ADD COLUMN "maxOccupancy" INTEGER;

-- AlterTable
ALTER TABLE "Room" ADD COLUMN "zone" TEXT;

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN "guestCount" INTEGER,
ADD COLUMN "notes" TEXT,
ADD COLUMN "roomTypeId" TEXT;

-- CreateIndex
CREATE INDEX "Reservation_hotelId_roomTypeId_idx" ON "Reservation"("hotelId", "roomTypeId");

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
