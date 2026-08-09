import fs from "node:fs";
import path from "node:path";

const migrationPath = path.resolve(
  __dirname,
  "../../../../prisma/migrations/20260810020000_add_marketplace_catalog_mapping/migration.sql",
);

describe("marketplace catalog mapping migration contract", () => {
  it("exists and is non-empty", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  describe("migration contents assertions", () => {
    let migration: string;

    beforeAll(() => {
      migration = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, "utf8") : "";
    });

    it("safely creates Marketplace enums", () => {
      expect(migration).toContain(
        'CREATE TYPE "MarketplaceServiceMode" AS ENUM (\'DELIVERY_TO_HOTEL\', \'CUSTOMER_AT_SERVICE\')',
      );
      expect(migration).toContain(
        'CREATE TYPE "MarketplaceRecordStatus" AS ENUM (\'DRAFT\', \'ACTIVE\', \'DISABLED\')',
      );
      expect(migration).toContain(
        'CREATE TYPE "HotelServiceLinkStatus" AS ENUM (\'ACTIVE\', \'DISABLED\')',
      );
    });

    it("creates ServiceTenantProfile, MarketplaceCategory, MarketplaceService, and HotelServiceLink tables", () => {
      expect(migration).toContain('CREATE TABLE "ServiceTenantProfile"');
      expect(migration).toContain('CREATE TABLE "MarketplaceCategory"');
      expect(migration).toContain('CREATE TABLE "MarketplaceService"');
      expect(migration).toContain('CREATE TABLE "HotelServiceLink"');
    });

    it("creates required foreign key relations", () => {
      expect(migration).toContain(
        'ALTER TABLE "ServiceTenantProfile" ADD CONSTRAINT "ServiceTenantProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE',
      );
      expect(migration).toContain(
        'ALTER TABLE "MarketplaceService" ADD CONSTRAINT "MarketplaceService_serviceTenantId_fkey" FOREIGN KEY ("serviceTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE',
      );
      expect(migration).toContain(
        'ALTER TABLE "MarketplaceService" ADD CONSTRAINT "MarketplaceService_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MarketplaceCategory"("id") ON DELETE RESTRICT',
      );
      expect(migration).toContain(
        'ALTER TABLE "HotelServiceLink" ADD CONSTRAINT "HotelServiceLink_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE',
      );
      expect(migration).toContain(
        'ALTER TABLE "HotelServiceLink" ADD CONSTRAINT "HotelServiceLink_serviceTenantId_fkey" FOREIGN KEY ("serviceTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE',
      );
    });

    it("creates unique indexes and lookups", () => {
      expect(migration).toContain(
        'CREATE UNIQUE INDEX "MarketplaceCategory_code_key" ON "MarketplaceCategory"("code")',
      );
      expect(migration).toContain(
        'CREATE UNIQUE INDEX "HotelServiceLink_hotelId_serviceTenantId_key" ON "HotelServiceLink"("hotelId", "serviceTenantId")',
      );
      expect(migration).toContain(
        'CREATE INDEX "MarketplaceCategory_isActive_sortOrder_idx" ON "MarketplaceCategory"("isActive", "sortOrder")',
      );
      expect(migration).toContain(
        'CREATE INDEX "MarketplaceService_serviceTenantId_status_idx" ON "MarketplaceService"("serviceTenantId", "status")',
      );
      expect(migration).toContain(
        'CREATE INDEX "MarketplaceService_categoryId_status_idx" ON "MarketplaceService"("categoryId", "status")',
      );
      expect(migration).toContain(
        'CREATE INDEX "MarketplaceService_status_idx" ON "MarketplaceService"("status")',
      );
      expect(migration).toContain(
        'CREATE INDEX "HotelServiceLink_hotelId_status_sortOrder_idx" ON "HotelServiceLink"("hotelId", "status", "sortOrder")',
      );
      expect(migration).toContain(
        'CREATE INDEX "HotelServiceLink_serviceTenantId_status_idx" ON "HotelServiceLink"("serviceTenantId", "status")',
      );
    });

    it("adds CHECK constraints for ServiceTenantProfile coordinates and MarketplaceService validation", () => {
      expect(migration).toContain('CONSTRAINT "chk_service_tenant_profile_coordinates_completeness"');
      expect(migration).toContain('CONSTRAINT "chk_service_tenant_profile_coordinates_range"');
      expect(migration).toContain('CONSTRAINT "chk_service_tenant_profile_accuracy_non_negative"');
      expect(migration).toContain('CONSTRAINT "chk_marketplace_service_unit_price_non_negative"');
      expect(migration).toContain('CONSTRAINT "chk_marketplace_service_capacity_non_negative"');
      expect(migration).toContain('CONSTRAINT "chk_marketplace_service_waiting_minutes_non_negative"');
      expect(migration).toContain('CONSTRAINT "chk_marketplace_service_version_min"');

      // Completeness & range check details
      expect(migration).toContain('"latitude" IS NULL AND "longitude" IS NULL');
      expect(migration).toContain('"latitude" IS NOT NULL AND "longitude" IS NOT NULL');
      expect(migration).toContain('"latitude" >= -90 AND "latitude" <= 90');
      expect(migration).toContain('"longitude" >= -180 AND "longitude" <= 180');
      expect(migration).toContain('"locationAccuracyMeters" IS NULL OR "locationAccuracyMeters" >= 0');

      // Service checks
      expect(migration).toContain('"unitPrice" >= 0');
      expect(migration).toContain('"capacityAvailable" IS NULL OR "capacityAvailable" >= 0');
      expect(migration).toContain('"waitingMinutes" >= 0');
      expect(migration).toContain('"version" >= 1');
    });

    it("contains no destructive SQL operations (DROP/TRUNCATE)", () => {
      const upperSql = migration.toUpperCase();
      expect(upperSql).not.toContain("DROP TABLE");
      expect(upperSql).not.toContain("DROP COLUMN");
      expect(upperSql).not.toContain("TRUNCATE");
    });
  });
});
