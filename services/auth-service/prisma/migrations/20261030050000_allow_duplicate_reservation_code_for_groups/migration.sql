-- DropIndex
DROP INDEX IF EXISTS "Reservation_hotelId_reservationCode_key";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Reservation_hotelId_reservationCode_idx" ON "Reservation"("hotelId", "reservationCode");
