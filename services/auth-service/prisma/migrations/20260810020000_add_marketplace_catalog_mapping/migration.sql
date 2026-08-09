-- CreateEnum
CREATE TYPE "MarketplaceServiceMode" AS ENUM ('DELIVERY_TO_HOTEL', 'CUSTOMER_AT_SERVICE');

-- CreateEnum
CREATE TYPE "MarketplaceRecordStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "HotelServiceLinkStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "ServiceTenantProfile" (
    "tenantId" TEXT NOT NULL,
    "displayName" VARCHAR(160) NOT NULL,
    "description" VARCHAR(1000),
    "phone" VARCHAR(40),
    "address" VARCHAR(255),
    "googleMapsUrl" VARCHAR(500),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "locationAccuracyMeters" DOUBLE PRECISION,
    "locationSource" "MarketplaceLocationSource",
    "locationVerifiedAt" TIMESTAMP(3),
    "coverImageUrl" VARCHAR(500),
    "status" "MarketplaceRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceTenantProfile_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "MarketplaceCategory" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "nameVi" VARCHAR(120) NOT NULL,
    "nameEn" VARCHAR(120) NOT NULL,
    "icon" VARCHAR(80),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceService" (
    "id" TEXT NOT NULL,
    "serviceTenantId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(1000),
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'VND',
    "imageUrls" TEXT[],
    "mode" "MarketplaceServiceMode" NOT NULL,
    "capacityAvailable" INTEGER,
    "waitingMinutes" INTEGER NOT NULL DEFAULT 0,
    "status" "MarketplaceRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelServiceLink" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "serviceTenantId" TEXT NOT NULL,
    "status" "HotelServiceLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelServiceLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceCategory_code_key" ON "MarketplaceCategory"("code");

-- CreateIndex
CREATE INDEX "MarketplaceCategory_isActive_sortOrder_idx" ON "MarketplaceCategory"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "MarketplaceService_serviceTenantId_status_idx" ON "MarketplaceService"("serviceTenantId", "status");

-- CreateIndex
CREATE INDEX "MarketplaceService_categoryId_status_idx" ON "MarketplaceService"("categoryId", "status");

-- CreateIndex
CREATE INDEX "MarketplaceService_status_idx" ON "MarketplaceService"("status");

-- CreateIndex
CREATE UNIQUE INDEX "HotelServiceLink_hotelId_serviceTenantId_key" ON "HotelServiceLink"("hotelId", "serviceTenantId");

-- CreateIndex
CREATE INDEX "HotelServiceLink_hotelId_status_sortOrder_idx" ON "HotelServiceLink"("hotelId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "HotelServiceLink_serviceTenantId_status_idx" ON "HotelServiceLink"("serviceTenantId", "status");

-- AddForeignKey
ALTER TABLE "ServiceTenantProfile" ADD CONSTRAINT "ServiceTenantProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceService" ADD CONSTRAINT "MarketplaceService_serviceTenantId_fkey" FOREIGN KEY ("serviceTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceService" ADD CONSTRAINT "MarketplaceService_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MarketplaceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelServiceLink" ADD CONSTRAINT "HotelServiceLink_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelServiceLink" ADD CONSTRAINT "HotelServiceLink_serviceTenantId_fkey" FOREIGN KEY ("serviceTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraints
ALTER TABLE "ServiceTenantProfile" ADD CONSTRAINT "chk_service_tenant_profile_coordinates_completeness" CHECK (("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL));

ALTER TABLE "ServiceTenantProfile" ADD CONSTRAINT "chk_service_tenant_profile_coordinates_range" CHECK ("latitude" >= -90 AND "latitude" <= 90 AND "longitude" >= -180 AND "longitude" <= 180);

ALTER TABLE "ServiceTenantProfile" ADD CONSTRAINT "chk_service_tenant_profile_accuracy_non_negative" CHECK ("locationAccuracyMeters" IS NULL OR "locationAccuracyMeters" >= 0);

ALTER TABLE "MarketplaceService" ADD CONSTRAINT "chk_marketplace_service_unit_price_non_negative" CHECK ("unitPrice" >= 0);

ALTER TABLE "MarketplaceService" ADD CONSTRAINT "chk_marketplace_service_capacity_non_negative" CHECK ("capacityAvailable" IS NULL OR "capacityAvailable" >= 0);

ALTER TABLE "MarketplaceService" ADD CONSTRAINT "chk_marketplace_service_waiting_minutes_non_negative" CHECK ("waitingMinutes" >= 0);

ALTER TABLE "MarketplaceService" ADD CONSTRAINT "chk_marketplace_service_version_min" CHECK ("version" >= 1);
