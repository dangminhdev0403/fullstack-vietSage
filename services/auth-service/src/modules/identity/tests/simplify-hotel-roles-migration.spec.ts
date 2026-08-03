import fs from "node:fs";
import path from "node:path";

const migration = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../../../prisma/migrations/20260802133000_simplify_hotel_roles/migration.sql",
  ),
  "utf8",
);

const LEGACY_ROLE_CODES = [
  "HOTEL_OWNER",
  "HOTEL_MANAGER",
  "HOTEL_HOUSEKEEPING",
  "HOTEL_MAINTENANCE",
  "HOTEL_FNB",
  "HOTEL_FINANCE",
];

describe("simplify hotel roles migration", () => {
  it("touches and disables only active legacy hotel roles", () => {
    expect(migration).toContain('CREATE TEMP TABLE "_RoleSimplificationTouchedUser"');
    expect(migration).toContain("ur.\"status\" = 'ACTIVE'");
    expect(migration).not.toContain(
      "WHERE \"code\" NOT IN ('SUPER_ADMIN', 'TENANT_OWNER', 'HOTEL_FRONTDESK')",
    );

    for (const code of LEGACY_ROLE_CODES) {
      expect(migration).toContain(`'${code}'`);
    }
  });

  it("keeps the touched-user temp table for the full migration session", () => {
    expect(migration).not.toContain("ON COMMIT DROP");
    expect(migration).toContain('DROP TABLE "_RoleSimplificationTouchedUser";');
  });

  it("revokes sessions only for users touched during this run", () => {
    expect(migration).toContain('FROM "_RoleSimplificationTouchedUser" touched');
    expect(migration).toContain('touched."userId" = session."userId"');
    expect(migration).toContain('touched."userId" = token."userId"');
  });

  it("preserves existing canonical assignment timestamps", () => {
    expect(migration).not.toMatch(/ON CONFLICT[\s\S]{0,180}"assignedAt" = CURRENT_TIMESTAMP/);
  });
});
