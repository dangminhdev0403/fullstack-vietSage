-- CreateEnum
CREATE TYPE "LocalPartnerStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "LocalPartnerOfferStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'DISABLED');

-- CreateEnum
CREATE TYPE "LocalPartnerOfferDiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE_GIFT', 'SPECIAL_PRICE');

-- CreateEnum
CREATE TYPE "LocalPartnerBookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LocalPartnerInteractionType" AS ENUM ('VIEW_DETAIL', 'CLICK_MAP', 'CLICK_CALL', 'CLICK_ZALO', 'CLAIM_OFFER', 'BOOKING_REQUEST');

-- CreateTable
CREATE TABLE "LocalPartnerCategory" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "nameVi" VARCHAR(120) NOT NULL,
    "nameEn" VARCHAR(120) NOT NULL,
    "icon" VARCHAR(80) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalPartnerCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalPartner" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(1000),
    "address" VARCHAR(255) NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "distanceMeters" INTEGER,
    "phone" VARCHAR(40),
    "zaloUrl" VARCHAR(255),
    "websiteUrl" VARCHAR(255),
    "googleMapUrl" VARCHAR(500),
    "coverImageUrl" VARCHAR(500),
    "images" TEXT[],
    "operatingHours" VARCHAR(160),
    "status" "LocalPartnerStatus" NOT NULL DEFAULT 'ACTIVE',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalPartnerOffer" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(500),
    "discountCode" VARCHAR(80),
    "discountType" "LocalPartnerOfferDiscountType" NOT NULL DEFAULT 'PERCENTAGE',
    "discountValue" DOUBLE PRECISION,
    "termsCondition" VARCHAR(500),
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "status" "LocalPartnerOfferStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalPartnerOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalPartnerBookingRequest" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "stayId" TEXT,
    "partnerId" TEXT NOT NULL,
    "offerId" TEXT,
    "guestName" VARCHAR(120) NOT NULL,
    "roomNumber" VARCHAR(40) NOT NULL,
    "guestPhone" VARCHAR(40) NOT NULL,
    "serviceType" VARCHAR(120) NOT NULL,
    "bookingTime" TIMESTAMP(3),
    "numberOfGuests" INTEGER,
    "notes" VARCHAR(500),
    "status" "LocalPartnerBookingStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalPartnerBookingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalPartnerInteractionLog" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "stayId" TEXT,
    "partnerId" TEXT NOT NULL,
    "actionType" "LocalPartnerInteractionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalPartnerInteractionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LocalPartnerCategory_code_key" ON "LocalPartnerCategory"("code");

-- CreateIndex
CREATE INDEX "LocalPartnerCategory_sortOrder_isActive_idx" ON "LocalPartnerCategory"("sortOrder", "isActive");

-- CreateIndex
CREATE INDEX "LocalPartner_hotelId_status_sortOrder_idx" ON "LocalPartner"("hotelId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "LocalPartner_categoryId_status_idx" ON "LocalPartner"("categoryId", "status");

-- CreateIndex
CREATE INDEX "LocalPartnerOffer_partnerId_status_idx" ON "LocalPartnerOffer"("partnerId", "status");

-- CreateIndex
CREATE INDEX "LocalPartnerBookingRequest_hotelId_status_createdAt_idx" ON "LocalPartnerBookingRequest"("hotelId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "LocalPartnerBookingRequest_partnerId_status_idx" ON "LocalPartnerBookingRequest"("partnerId", "status");

-- CreateIndex
CREATE INDEX "LocalPartnerBookingRequest_stayId_idx" ON "LocalPartnerBookingRequest"("stayId");

-- CreateIndex
CREATE INDEX "LocalPartnerInteractionLog_hotelId_partnerId_createdAt_idx" ON "LocalPartnerInteractionLog"("hotelId", "partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "LocalPartnerInteractionLog_actionType_createdAt_idx" ON "LocalPartnerInteractionLog"("actionType", "createdAt");

-- AddForeignKey
ALTER TABLE "LocalPartner" ADD CONSTRAINT "LocalPartner_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalPartner" ADD CONSTRAINT "LocalPartner_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "LocalPartnerCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalPartnerOffer" ADD CONSTRAINT "LocalPartnerOffer_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "LocalPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalPartnerBookingRequest" ADD CONSTRAINT "LocalPartnerBookingRequest_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalPartnerBookingRequest" ADD CONSTRAINT "LocalPartnerBookingRequest_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "GuestStay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalPartnerBookingRequest" ADD CONSTRAINT "LocalPartnerBookingRequest_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "LocalPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalPartnerBookingRequest" ADD CONSTRAINT "LocalPartnerBookingRequest_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "LocalPartnerOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalPartnerInteractionLog" ADD CONSTRAINT "LocalPartnerInteractionLog_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalPartnerInteractionLog" ADD CONSTRAINT "LocalPartnerInteractionLog_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "GuestStay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalPartnerInteractionLog" ADD CONSTRAINT "LocalPartnerInteractionLog_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "LocalPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
