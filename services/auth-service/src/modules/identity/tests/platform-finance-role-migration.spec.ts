import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_PATH = resolve(
  __dirname,
  "../../../../prisma/migrations/20260921050000_retire_hotel_finance_keep_platform_finance/migration.sql",
);

const PLATFORM_FINANCE_PERMISSIONS = [
  "platform.billing.view",
  "platform.billing.manage",
  "platform.hotels.view",
] as const;

describe("20260921050000_retire_hotel_finance_keep_platform_finance migration", () => {
  let sql: string;

  beforeAll(() => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
    sql = readFileSync(MIGRATION_PATH, "utf-8");
  });

  it("is atomic and registers PLATFORM_FINANCE as an active SYSTEM_TEMPLATE", () => {
    expect(sql.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).toContain("'PLATFORM_FINANCE'");
    expect(sql).toContain("'SYSTEM_TEMPLATE'::\"RoleType\"");
    expect(sql).toContain('"status" = \'ACTIVE\'::"RoleStatus"');
    expect(sql).toContain('ON CONFLICT ("code") DO UPDATE SET');
  });

  it("grants exactly the canonical Platform Finance capabilities", () => {
    for (const permission of PLATFORM_FINANCE_PERMISSIONS) {
      expect(sql).toContain(`'${permission}'`);
    }
    expect(sql).toContain("('platform.hotels.view', 'platform-hotels'");
    expect(sql).toContain('ON CONFLICT ("roleId", "permissionId") DO NOTHING');
    expect(sql).toContain('DELETE FROM "RolePermission"');
  });

  it("blocks every non-revoked identity reference before hard-delete", () => {
    expect(sql).toContain('AND "status" <> \'REVOKED\'::"UserRoleStatus"');
    expect(sql).toContain(
      "RAISE EXCEPTION 'Cannot retire HOTEL_FINANCE: % live UserRole reference(s) exist'",
    );
    expect(sql).toContain('AND "status" <> \'REVOKED\'::"AuthSessionStatus"');
    expect(sql).toContain(
      "RAISE EXCEPTION 'Cannot retire HOTEL_FINANCE: % live AuthSession reference(s) exist'",
    );
    expect(sql).toContain(
      "RAISE EXCEPTION 'Cannot retire HOTEL_FINANCE: % Role.baseRoleId reference(s) exist'",
    );
  });

  it("deletes only revoked identity history before deleting HOTEL_FINANCE", () => {
    const deleteSession = sql.indexOf('DELETE FROM "AuthSession"');
    const deleteUserRole = sql.indexOf('DELETE FROM "UserRole"');
    const deletePermission = sql.indexOf(
      'DELETE FROM "RolePermission" WHERE "roleId" = v_hotel_finance_id',
    );
    const deleteRole = sql.indexOf('DELETE FROM "Role" WHERE "id" = v_hotel_finance_id');

    expect(sql).toContain('AND "status" = \'REVOKED\'::"AuthSessionStatus"');
    expect(sql).toContain('AND "status" = \'REVOKED\'::"UserRoleStatus"');
    expect(deleteSession).toBeGreaterThan(-1);
    expect(deleteUserRole).toBeGreaterThan(deleteSession);
    expect(deletePermission).toBeGreaterThan(deleteUserRole);
    expect(deleteRole).toBeGreaterThan(deletePermission);
  });

  it("models the approved hard-delete policy", () => {
    type Status = "ACTIVE" | "REVOKED";
    const retire = (userRoles: Status[], sessions: Status[], inheritedRoleCount: number) => {
      if (userRoles.some((status) => status !== "REVOKED")) {
        throw new Error("live UserRole reference(s) exist");
      }
      if (sessions.some((status) => status !== "REVOKED")) {
        throw new Error("live AuthSession reference(s) exist");
      }
      if (inheritedRoleCount > 0) {
        throw new Error("Role.baseRoleId reference(s) exist");
      }
      return { roleDeleted: true, userRoleCount: 0, sessionCount: 0 };
    };

    expect(() => retire(["ACTIVE"], [], 0)).toThrow("live UserRole");
    expect(() => retire([], ["ACTIVE"], 0)).toThrow("live AuthSession");
    expect(() => retire([], [], 1)).toThrow("Role.baseRoleId");
    expect(retire(["REVOKED"], ["REVOKED", "REVOKED"], 0)).toEqual({
      roleDeleted: true,
      userRoleCount: 0,
      sessionCount: 0,
    });
  });
});
