import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { BUSINESS_PERMISSIONS } from "./business-permissions.registry";

const ROOT = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const migrationPath = resolve(
  ROOT,
  "prisma/migrations/20260918190422_owner_read_config_boundary/migration.sql",
);

const revokedOwnerPermissions = [
  "platform.hotels.view",
  "platform.hotels.manage",
  "hotel.rooms.status.manage",
  "hotel.stays.manage",
  "hotel.stays.check-in",
  "hotel.stays.check-out",
  "hotel.reservations.manage",
  "hotel.requests.manage",
  "hotel.requests.coordinate",
  "hotel.requests.execute",
  "hotel.billing.manage",
  "hotel.billing.checkout",
  "hotel.kbtt.declarations.manage",
] as const;

describe("owner read/config boundary", () => {
  it("registers hotel profile permissions", () => {
    const keys = new Set(BUSINESS_PERMISSIONS.map(({ key }) => key));
    expect(keys.has("hotel.profile.view")).toBe(true);
    expect(keys.has("hotel.profile.manage")).toBe(true);
  });

  it("protects hotel profile endpoints with hotel-scoped permissions", () => {
    const controller = read("src/modules/property/api/hotels.controller.ts");
    expect(controller).toMatch(
      /@RequirePermission\(\[[^\]]*"hotel\.profile\.view"[^\]]*\]\)[\s\S]*?@Get\(":hotelId"\)/,
    );
    expect(controller).toMatch(
      /@RequirePermission\(\[[^\]]*"hotel\.profile\.manage"[^\]]*\]\)[\s\S]*?@Patch\(":hotelId"\)/,
    );
  });

  it("revokes only operational owner grants and preserves shared domain tables", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8");

    for (const role of ["TENANT_OWNER", "HOTEL_OWNER"]) {
      expect(sql).toContain(`'${role}'`);
    }
    for (const permission of revokedOwnerPermissions) {
      expect(sql).toContain(`'${permission}'`);
    }

    expect(sql).toMatch(/DELETE\s+FROM\s+"RolePermission"/i);
    expect(sql).toContain("hotel.profile.view");
    expect(sql).toContain("hotel.profile.manage");
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(
      /DELETE\s+FROM\s+"(Room|GuestStay|GuestRequest|Folio|KbttGuestDeclaration)"/i,
    );
    expect(sql).not.toContain("'CUSTOM'");
  });

  it("treats partner settlement as a billing mutation, not partner connection management", () => {
    const controller = read("src/modules/marketplace/api/hotel-marketplace.controller.ts");
    expect(controller).toMatch(
      /@RequirePermission\("hotel\.billing\.manage"\)[\s\S]*?@Post\("settlements\/:settlementId\/settle"\)/,
    );
    expect(controller).toMatch(
      /@RequirePermission\("hotel\.billing\.manage"\)[\s\S]*?@Post\("settlements\/settle-batch"\)/,
    );
  });
});
