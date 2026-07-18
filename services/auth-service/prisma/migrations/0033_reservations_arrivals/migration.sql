CREATE TYPE "ReservationStatus" AS ENUM (
    'CONFIRMED',
    'ARRIVAL_READY',
    'CHECKED_IN',
    'CANCELLED',
    'NO_SHOW'
);

CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomId" TEXT,
    "reservationCode" VARCHAR(80) NOT NULL,
    "guestDisplayName" VARCHAR(120) NOT NULL,
    "guestPhone" VARCHAR(40),
    "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "plannedCheckInAt" TIMESTAMP(3) NOT NULL,
    "plannedCheckOutAt" TIMESTAMP(3) NOT NULL,
    "assignedAt" TIMESTAMP(3),
    "assignedByUserId" TEXT,
    "checkedInAt" TIMESTAMP(3),
    "checkedInByUserId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Reservation_valid_dates" CHECK ("plannedCheckOutAt" > "plannedCheckInAt")
);

ALTER TABLE "GuestStay" ADD COLUMN "reservationId" TEXT;

CREATE UNIQUE INDEX "Reservation_hotelId_reservationCode_key"
    ON "Reservation"("hotelId", "reservationCode");
CREATE INDEX "Reservation_hotelId_status_plannedCheckInAt_idx"
    ON "Reservation"("hotelId", "status", "plannedCheckInAt");
CREATE INDEX "Reservation_roomId_status_plannedCheckInAt_plannedCheckOutAt_idx"
    ON "Reservation"("roomId", "status", "plannedCheckInAt", "plannedCheckOutAt");
CREATE UNIQUE INDEX "GuestStay_reservationId_key" ON "GuestStay"("reservationId");

ALTER TABLE "Reservation"
    ADD CONSTRAINT "Reservation_hotelId_fkey"
    FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reservation"
    ADD CONSTRAINT "Reservation_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestStay"
    ADD CONSTRAINT "GuestStay_reservationId_fkey"
    FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rollback (manual, only after confirming no application writes depend on this slice):
-- ALTER TABLE "GuestStay" DROP CONSTRAINT "GuestStay_reservationId_fkey";
-- DROP INDEX "GuestStay_reservationId_key";
-- ALTER TABLE "GuestStay" DROP COLUMN "reservationId";
-- DROP TABLE "Reservation";
-- DROP TYPE "ReservationStatus";
