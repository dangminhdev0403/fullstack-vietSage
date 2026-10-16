-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN "groupCode" VARCHAR(80);

-- CreateIndex
CREATE INDEX "Reservation_hotelId_groupCode_idx" ON "Reservation"("hotelId", "groupCode");
