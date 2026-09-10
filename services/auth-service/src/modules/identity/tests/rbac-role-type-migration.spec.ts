import fs from "node:fs";
import path from "node:path";

const migration = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../../../prisma/migrations/20260910064500_add_role_type/migration.sql",
  ),
  "utf8",
);

const routeGrantBridgeMigration = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../../../prisma/migrations/20260910072500_bridge_route_grants_to_business_permissions/migration.sql",
  ),
  "utf8",
);

const SYSTEM_TEMPLATE_CODES = [
  "SUPER_ADMIN",
  "VIETSAGE_OPERATION",
  "TENANT_OWNER",
  "HOTEL_OWNER",
  "HOTEL_MANAGER",
  "HOTEL_FRONTDESK",
  "HOTEL_HOUSEKEEPING",
  "HOTEL_MAINTENANCE",
  "HOTEL_FNB",
  "HOTEL_FINANCE",
  "SERVICE_STAFF",
];

describe("role type migration", () => {
  it("backfills every built-in role and keeps custom as the default", () => {
    expect(migration).toContain(`DEFAULT 'CUSTOM'`);
    for (const code of SYSTEM_TEMPLATE_CODES) {
      expect(migration).toContain(`'${code}'`);
    }
  });

  it("copies only existing route grants across all migrated handlers", () => {
    const mappings = routeGrantBridgeMigration.match(
      /\('(GET|POST|PATCH)'::"HttpMethod", '[^']+', '[^']+'\)/g,
    );

    expect(mappings).toHaveLength(21);
    expect(routeGrantBridgeMigration).toContain('JOIN "RolePermission" existing_grant');
    expect(routeGrantBridgeMigration).not.toContain('CROSS JOIN "Role"');
  });
});
