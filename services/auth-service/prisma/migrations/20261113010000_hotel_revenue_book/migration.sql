-- Additive storage for hotel revenue entered outside the service catalog.
-- Existing folio, payment, deposit and receivable records remain authoritative.
CREATE TABLE "HotelRevenueEntry" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomId" TEXT,
    "roomNumberSnapshot" VARCHAR(40),
    "date" DATE NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "category" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "documentNumber" VARCHAR(80),
    "notes" VARCHAR(1000),
    "idempotencyKey" VARCHAR(120) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "voidedAt" TIMESTAMP(3),
    "voidReason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HotelRevenueEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HotelRevenueEntry_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "HotelRevenueEntry_category_check" CHECK ("category" IN ('ROOM', 'MINIBAR', 'LAUNDRY', 'OTHER')),
    CONSTRAINT "HotelRevenueEntry_version_check" CHECK ("version" >= 0)
);

CREATE TABLE "HotelRevenueCollection" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" VARCHAR(30) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "reference" VARCHAR(120),
    "idempotencyKey" VARCHAR(120) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HotelRevenueCollection_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HotelRevenueCollection_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "HotelRevenueCollection_method_check" CHECK ("method" IN ('CASH', 'BANK_TRANSFER', 'CARD', 'OTHER'))
);

CREATE UNIQUE INDEX "HotelRevenueEntry_id_hotelId_key" ON "HotelRevenueEntry"("id", "hotelId");
CREATE UNIQUE INDEX "HotelRevenueEntry_hotelId_idempotencyKey_key" ON "HotelRevenueEntry"("hotelId", "idempotencyKey");
CREATE INDEX "HotelRevenueEntry_hotelId_date_idx" ON "HotelRevenueEntry"("hotelId", "date");
CREATE INDEX "HotelRevenueEntry_hotelId_roomId_date_idx" ON "HotelRevenueEntry"("hotelId", "roomId", "date");
CREATE UNIQUE INDEX "HotelRevenueCollection_hotelId_idempotencyKey_key" ON "HotelRevenueCollection"("hotelId", "idempotencyKey");
CREATE INDEX "HotelRevenueCollection_hotelId_receivedAt_idx" ON "HotelRevenueCollection"("hotelId", "receivedAt");
CREATE INDEX "HotelRevenueCollection_entryId_receivedAt_idx" ON "HotelRevenueCollection"("entryId", "receivedAt");

ALTER TABLE "HotelRevenueEntry" ADD CONSTRAINT "HotelRevenueEntry_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HotelRevenueEntry" ADD CONSTRAINT "HotelRevenueEntry_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HotelRevenueCollection" ADD CONSTRAINT "HotelRevenueCollection_entryId_hotelId_fkey" FOREIGN KEY ("entryId", "hotelId") REFERENCES "HotelRevenueEntry"("id", "hotelId") ON DELETE CASCADE ON UPDATE CASCADE;
