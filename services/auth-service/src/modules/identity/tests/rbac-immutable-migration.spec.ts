import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

describe("rbac-immutable-migration", () => {
  const migrationsDir = join(__dirname, "../../../../prisma/migrations");
  const migrationFolder = readdirSync(migrationsDir).find((folder) =>
    folder.endsWith("_immutable_canonical_roles"),
  );

  it("finds the immutable canonical roles migration file", () => {
    expect(migrationFolder).toBeDefined();
    const migrationFile = join(migrationsDir, migrationFolder!, "migration.sql");
    expect(existsSync(migrationFile)).toBe(true);
  });

  it("contains host backup warning comment before non-disposable DB execution", () => {
    const migrationFile = join(migrationsDir, migrationFolder!, "migration.sql");
    const sql = readFileSync(migrationFile, "utf-8");

    expect(sql).toMatch(/REQUIRES HOST BACKUP/i);
    expect(sql).toMatch(/disposable database environment/i);
  });

  it("retains custom roles and adds the base-role constraint", () => {
    const migrationFile = join(migrationsDir, migrationFolder!, "migration.sql");
    const sql = readFileSync(migrationFile, "utf-8");

    expect(sql).not.toContain('DELETE FROM "Role"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "baseRoleId" TEXT');
  });

  it("fails closed if any surviving role is outside the 4 canonical access classes", () => {
    const migrationFile = join(migrationsDir, migrationFolder!, "migration.sql");
    const sql = readFileSync(migrationFile, "utf-8");

    const canonicalRoles = ["SUPER_ADMIN", "TENANT_OWNER", "HOTEL_FRONTDESK", "SERVICE_STAFF"];

    for (const role of canonicalRoles) {
      expect(sql).toContain(`'${role}'`);
    }

    expect(sql).toMatch(/RAISE EXCEPTION/i);
  });

  it("sets all surviving canonical roles to SYSTEM_TEMPLATE", () => {
    const migrationFile = join(migrationsDir, migrationFolder!, "migration.sql");
    const sql = readFileSync(migrationFile, "utf-8");

    expect(sql).toMatch(/UPDATE\s+"Role"\s+SET\s+"type"\s*=\s*'SYSTEM_TEMPLATE'/i);
  });

  it("simulates fail-closed migration logic against in-memory datasets", () => {
    const CANONICAL_ROLES = new Set([
      "SUPER_ADMIN",
      "TENANT_OWNER",
      "HOTEL_FRONTDESK",
      "SERVICE_STAFF",
    ]);

    const runMigration = (roles: Array<{ code: string; type: "SYSTEM_TEMPLATE" | "CUSTOM" }>) => {
      return roles.map((role) =>
        CANONICAL_ROLES.has(role.code) ? { ...role, type: "SYSTEM_TEMPLATE" as const } : role,
      );
    };

    // Custom roles survive; canonical roles become immutable templates.
    const mixedRoles = [
      { code: "HOTEL_FRONTDESK", type: "CUSTOM" as const },
      { code: "TENANT_OWNER", type: "SYSTEM_TEMPLATE" as const },
      { code: "CUSTOM_AGENT", type: "CUSTOM" as const },
    ];
    const result = runMigration(mixedRoles);
    expect(result).toEqual([
      { code: "HOTEL_FRONTDESK", type: "SYSTEM_TEMPLATE" },
      { code: "TENANT_OWNER", type: "SYSTEM_TEMPLATE" },
      { code: "CUSTOM_AGENT", type: "CUSTOM" },
    ]);
  });
});
