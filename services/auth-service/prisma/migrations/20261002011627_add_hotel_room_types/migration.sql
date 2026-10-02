CREATE TABLE "RoomType" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "normalizedKey" VARCHAR(80) NOT NULL,
    "basePrice" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoomType_hotelId_normalizedKey_key" ON "RoomType"("hotelId", "normalizedKey");

ALTER TABLE "Room" ADD COLUMN "roomTypeId" TEXT;

CREATE INDEX "Room_hotelId_roomTypeId_idx" ON "Room"("hotelId", "roomTypeId");

ALTER TABLE "RoomType" ADD CONSTRAINT "RoomType_hotelId_fkey"
    FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Room" ADD CONSTRAINT "Room_roomTypeId_fkey"
    FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
