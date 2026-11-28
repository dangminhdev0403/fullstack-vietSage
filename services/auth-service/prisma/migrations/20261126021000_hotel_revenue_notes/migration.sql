-- Additive storage for persistent hotel revenue book notes across shifts and devices.
CREATE TABLE "HotelRevenueNote" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "accountKey" VARCHAR(160) NOT NULL,
    "roomId" TEXT,
    "notes" VARCHAR(1000) NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HotelRevenueNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HotelRevenueNote_hotelId_accountKey_key" ON "HotelRevenueNote"("hotelId", "accountKey");
CREATE INDEX "HotelRevenueNote_hotelId_accountKey_idx" ON "HotelRevenueNote"("hotelId", "accountKey");
CREATE INDEX "HotelRevenueNote_hotelId_roomId_idx" ON "HotelRevenueNote"("hotelId", "roomId");

ALTER TABLE "HotelRevenueNote" ADD CONSTRAINT "HotelRevenueNote_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HotelRevenueNote" ADD CONSTRAINT "HotelRevenueNote_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
