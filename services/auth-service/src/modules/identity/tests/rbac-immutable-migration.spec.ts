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

  it("deletes all CUSTOM roles and preserves cascades", () => {
    const migrationFile = join(migrationsDir, migrationFolder!, "migration.sql");
    const sql = readFileSync(migrationFile, "utf-8");

    expect(sql).toContain('DELETE FROM "Role"\nWHERE "type" = \'CUSTOM\';');
  });

  it("fails closed if any surviving role is outside the 4 canonical access classes", () => {
    const migrationFile = join(migrationsDir, migrationFolder!, "migration.sql");
    const sql = readFileSync(migrationFile, "utf-8");

    const canonicalRoles = [
      "SUPER_ADMIN",
      "TENANT_OWNER",
      "HOTEL_FRONTDESK",
      "SERVICE_STAFF",
    ];

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

    const runMigration = (
      roles: Array<{ code: string; type: "SYSTEM_TEMPLATE" | "CUSTOM" }>,
    ) => {
      // 1. Delete CUSTOM roles
      const surviving = roles.filter((r) => r.type !== "CUSTOM");

      // 2. Fail closed if any surviving role is outside canonical access classes
      const invalid = surviving.filter((r) => !CANONICAL_ROLES.has(r.code));
      if (invalid.length > 0) {
        throw new Error(
          `Surviving role codes outside canonical access classes: ${invalid.map((r) => r.code).join(", ")}`,
        );
      }

      // 3. Set retained roles to SYSTEM_TEMPLATE
      return surviving.map((r) => ({ ...r, type: "SYSTEM_TEMPLATE" as const }));
    };

    // Case 1: Custom roles get deleted, canonical roles survive and are updated to SYSTEM_TEMPLATE
    const mixedRoles = [
      { code: "HOTEL_FRONTDESK", type: "CUSTOM" as const },
      { code: "TENANT_OWNER", type: "SYSTEM_TEMPLATE" as const },
      { code: "CUSTOM_AGENT", type: "CUSTOM" as const },
    ];
    const result = runMigration(mixedRoles);
    expect(result).toEqual([
      { code: "TENANT_OWNER", type: "SYSTEM_TEMPLATE" },
    ]);

    // Case 2: Surviving non-canonical role triggers fail-closed exception
    const staleTemplateRoles = [
      { code: "HOTEL_MANAGER", type: "SYSTEM_TEMPLATE" as const },
      { code: "HOTEL_FRONTDESK", type: "SYSTEM_TEMPLATE" as const },
    ];
    expect(() => runMigration(staleTemplateRoles)).toThrow(
      "Surviving role codes outside canonical access classes: HOTEL_MANAGER",
    );
  });
});
