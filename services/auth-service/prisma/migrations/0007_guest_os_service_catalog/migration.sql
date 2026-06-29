-- CreateEnum
CREATE TYPE "ServiceCatalogStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- AlterTable
ALTER TABLE "GuestRequest" ADD COLUMN "serviceItemId" TEXT;

-- CreateTable
CREATE TABLE "HotelServiceCategory" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "ServiceCatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelServiceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelServiceItem" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "requestType" "GuestRequestType" NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(1000),
    "price" DECIMAL(12,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "metadata" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "ServiceCatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelServiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuestRequest_serviceItemId_idx" ON "GuestRequest"("serviceItemId");

-- CreateIndex
CREATE INDEX "HotelServiceCategory_hotelId_status_sortOrder_idx" ON "HotelServiceCategory"("hotelId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "HotelServiceItem_hotelId_status_sortOrder_idx" ON "HotelServiceItem"("hotelId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "HotelServiceItem_categoryId_status_sortOrder_idx" ON "HotelServiceItem"("categoryId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "HotelServiceItem_requestType_status_idx" ON "HotelServiceItem"("requestType", "status");

-- AddForeignKey
ALTER TABLE "HotelServiceCategory" ADD CONSTRAINT "HotelServiceCategory_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelServiceItem" ADD CONSTRAINT "HotelServiceItem_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelServiceItem" ADD CONSTRAINT "HotelServiceItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "HotelServiceCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestRequest" ADD CONSTRAINT "GuestRequest_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "HotelServiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
