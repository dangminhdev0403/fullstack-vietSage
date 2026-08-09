import fs from "node:fs";
import path from "node:path";

const migrationPath = path.resolve(
  __dirname,
  "../../../../prisma/migrations/20260810013000_add_marketplace_tenant_location/migration.sql",
);

describe("marketplace tenant location migration contract", () => {
  it("exists and is non-empty", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  describe("migration contents assertions", () => {
    let migration: string;

    beforeAll(() => {
      migration = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, "utf8") : "";
    });

    it("safely creates TenantType and MarketplaceLocationSource enums", () => {
      expect(migration).toContain('CREATE TYPE "TenantType" AS ENUM (\'HOTEL\', \'SERVICE\')');
      expect(migration).toContain(
        'CREATE TYPE "MarketplaceLocationSource" AS ENUM (\'DEVICE_GEOLOCATION\', \'GOOGLE_MAPS_URL\', \'MANUAL\')',
      );
    });

    it("adds Tenant.type with NOT NULL DEFAULT HOTEL", () => {
      expect(migration).toContain(
        'ALTER TABLE "Tenant" ADD COLUMN "type" "TenantType" NOT NULL DEFAULT \'HOTEL\'',
      );
    });

    it("adds physical location fields to Hotel", () => {
      expect(migration).toContain('"googleMapsUrl" VARCHAR(500)');
      expect(migration).toContain('"latitude" DECIMAL(9,6)');
      expect(migration).toContain('"longitude" DECIMAL(9,6)');
      expect(migration).toContain('"locationAccuracyMeters" DOUBLE PRECISION');
      expect(migration).toContain('"locationSource" "MarketplaceLocationSource"');
      expect(migration).toContain('"locationVerifiedAt" TIMESTAMP(3)');
    });

    it("adds deterministic CHECK constraints for coordinates completeness, ranges, and non-negative accuracy", () => {
      expect(migration).toContain('CONSTRAINT "chk_hotel_coordinates_completeness"');
      expect(migration).toContain('CONSTRAINT "chk_hotel_coordinates_range"');
      expect(migration).toContain('CONSTRAINT "chk_hotel_location_accuracy_non_negative"');

      // Completeness check
      expect(migration).toContain('"latitude" IS NULL AND "longitude" IS NULL');
      expect(migration).toContain('"latitude" IS NOT NULL AND "longitude" IS NOT NULL');

      // Range check (-90 to 90 lat, -180 to 180 long)
      expect(migration).toContain('"latitude" >= -90 AND "latitude" <= 90');
      expect(migration).toContain('"longitude" >= -180 AND "longitude" <= 180');

      // Accuracy check (>= 0)
      expect(migration).toContain('"locationAccuracyMeters" >= 0');
    });

    it("contains no destructive SQL operations (DROP/TRUNCATE)", () => {
      const upperSql = migration.toUpperCase();
      expect(upperSql).not.toContain("DROP TABLE");
      expect(upperSql).not.toContain("DROP COLUMN");
      expect(upperSql).not.toContain("TRUNCATE");
    });
  });
});
