CREATE TABLE "GuestStayOccupant" (
  "id" TEXT NOT NULL,
  "stayId" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "fullName" VARCHAR(120) NOT NULL,
  "phone" VARCHAR(40),
  "identityNumber" VARCHAR(32),
  "dateOfBirth" VARCHAR(20),
  "gender" VARCHAR(20),
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuestStayOccupant_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "GuestSession" ADD COLUMN "occupantId" TEXT;

CREATE INDEX "GuestStayOccupant_stayId_idx" ON "GuestStayOccupant"("stayId");
CREATE INDEX "GuestStayOccupant_hotelId_idx" ON "GuestStayOccupant"("hotelId");

ALTER TABLE "GuestStayOccupant"
ADD CONSTRAINT "GuestStayOccupant_stayId_fkey"
FOREIGN KEY ("stayId") REFERENCES "GuestStay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GuestSession"
ADD CONSTRAINT "GuestSession_occupantId_fkey"
FOREIGN KEY ("occupantId") REFERENCES "GuestStayOccupant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
