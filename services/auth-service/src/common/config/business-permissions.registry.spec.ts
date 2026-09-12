import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BUSINESS_PERMISSIONS,
  BusinessPermissionKey,
  isBusinessPermissionKey,
} from "./business-permissions.registry";

const TARGET_CAPABILITY_KEYS: readonly BusinessPermissionKey[] = [
  "hotel.rooms.status.manage",
  "hotel.stays.check-in",
  "hotel.stays.check-out",
  "hotel.requests.coordinate",
  "hotel.requests.execute",
  "hotel.billing.checkout",
] as const;

const FRONTDESK_EXECUTION_KEYS = [
  "hotel.rooms.status.manage",
  "hotel.stays.check-in",
  "hotel.stays.check-out",
  "hotel.requests.execute",
  "hotel.billing.checkout",
];

const MIGRATION_FILE_PATH = resolve(
  __dirname,
  "../../../prisma/migrations/20260912144505_tenant_owner_frontdesk_execution_capabilities/migration.sql",
);

describe("business-permissions.registry capability contract", () => {
  describe("registry definitions", () => {
    it("exposes all six target capability keys in the registry", () => {
      const keys = new Set(BUSINESS_PERMISSIONS.map(({ key }) => key));
      for (const targetKey of TARGET_CAPABILITY_KEYS) {
        expect(keys.has(targetKey)).toBe(true);
      }
    });

    it("verifies isBusinessPermissionKey returns true for each target key and false for unknown keys", () => {
      for (const targetKey of TARGET_CAPABILITY_KEYS) {
        expect(isBusinessPermissionKey(targetKey)).toBe(true);
      }
      expect(isBusinessPermissionKey("unknown.permission.key")).toBe(false);
      expect(isBusinessPermissionKey("hotel.admin.all")).toBe(false);
    });

    it("maps each target capability to its respective domain and moduleKey", () => {
      const definitionsByKey = new Map(
        BUSINESS_PERMISSIONS.map((entry) => [entry.key, entry]),
      );

      const expectedDomains: Record<string, string> = {
        "hotel.rooms.status.manage": "hotel-rooms",
        "hotel.stays.check-in": "hotel-stays",
        "hotel.stays.check-out": "hotel-stays",
        "hotel.requests.coordinate": "hotel-requests",
        "hotel.requests.execute": "hotel-requests",
        "hotel.billing.checkout": "hotel-billing",
      };

      for (const [key, expectedDomain] of Object.entries(expectedDomains)) {
        const def = definitionsByKey.get(key as BusinessPermissionKey);
        expect(def).toBeDefined();
        expect(def?.domain).toBe(expectedDomain);
        expect(def?.moduleKey).toBe(expectedDomain);
        expect(def?.label.length).toBeGreaterThan(0);
        expect(def?.description.length).toBeGreaterThan(0);
      }
    });

    it("assigns appropriate operational risks to the target capabilities", () => {
      const definitionsByKey = new Map(
        BUSINESS_PERMISSIONS.map((entry) => [entry.key, entry]),
      );

      expect(definitionsByKey.get("hotel.billing.checkout")?.risk).toBe("CRITICAL");
      expect(definitionsByKey.get("hotel.rooms.status.manage")?.risk).toBe("HIGH");
      expect(definitionsByKey.get("hotel.stays.check-in")?.risk).toBe("HIGH");
      expect(definitionsByKey.get("hotel.stays.check-out")?.risk).toBe("HIGH");
      expect(definitionsByKey.get("hotel.requests.coordinate")?.risk).toBe("HIGH");
      expect(definitionsByKey.get("hotel.requests.execute")?.risk).toBe("HIGH");
    });

    it("contains no duplicate keys in BUSINESS_PERMISSIONS", () => {
      const keys = BUSINESS_PERMISSIONS.map(({ key }) => key);
      const uniqueKeys = new Set(keys);
      expect(keys.length).toBe(uniqueKeys.size);
    });
  });

  describe("migration 20260912144505_tenant_owner_frontdesk_execution_capabilities", () => {
    let sql: string;

    beforeAll(() => {
      expect(existsSync(MIGRATION_FILE_PATH)).toBe(true);
      sql = readFileSync(MIGRATION_FILE_PATH, "utf-8");
    });

    it("preserves bridge storage using HttpMethod OPTIONS and permission path", () => {
      expect(sql).toMatch(/'OPTIONS'::"HttpMethod"/);
      expect(sql).toContain('"Permission" ("id", "method", "moduleKey", "path", "description", "createdAt", "updatedAt")');
      expect(sql).toContain('"path" = preset."permissionKey"');
    });

    it("registers all six target permissions in the Permission table with idempotent conflict handling", () => {
      for (const targetKey of TARGET_CAPABILITY_KEYS) {
        expect(sql).toContain(`'${targetKey}'`);
      }
      expect(sql).toContain('ON CONFLICT ("method", "path") DO UPDATE SET');
    });

    it("grants execution capabilities and checkout to HOTEL_FRONTDESK", () => {
      for (const execKey of FRONTDESK_EXECUTION_KEYS) {
        expect(sql).toContain(`('HOTEL_FRONTDESK', '${execKey}')`);
      }
      // HOTEL_FRONTDESK must NOT receive coordinate
      expect(sql).not.toContain("('HOTEL_FRONTDESK', 'hotel.requests.coordinate')");
    });

    it("grants coordinate to owner and never grants execution capabilities to owner", () => {
      expect(sql).toContain("('TENANT_OWNER', 'hotel.requests.coordinate')");
      // Owner must NOT receive execution permissions
      for (const execKey of FRONTDESK_EXECUTION_KEYS) {
        expect(sql).not.toContain(`('TENANT_OWNER', '${execKey}')`);
        expect(sql).not.toContain(`('HOTEL_OWNER', '${execKey}')`);
      }
    });

    it("grants billing checkout to HOTEL_FINANCE as compatible with current billing role", () => {
      expect(sql).toContain("('HOTEL_FINANCE', 'hotel.billing.checkout')");
      // HOTEL_FINANCE must NOT receive stay execution or request execution
      expect(sql).not.toContain("('HOTEL_FINANCE', 'hotel.stays.check-in')");
      expect(sql).not.toContain("('HOTEL_FINANCE', 'hotel.stays.check-out')");
      expect(sql).not.toContain("('HOTEL_FINANCE', 'hotel.requests.execute')");
    });

    it("grants all six capabilities to SUPER_ADMIN", () => {
      for (const targetKey of TARGET_CAPABILITY_KEYS) {
        expect(sql).toContain(`('SUPER_ADMIN', '${targetKey}')`);
      }
    });

    it("is strictly additive: does not delete any old grants or drop tables", () => {
      expect(sql).not.toMatch(/DELETE\s+FROM/i);
      expect(sql).not.toMatch(/DROP\s+TABLE/i);
      expect(sql).not.toMatch(/ALTER\s+TABLE.*DROP/i);
    });

    it("never targets all noncanonical or custom roles", () => {
      expect(sql).not.toMatch(/WHERE\s+"type"\s*=\s*'CUSTOM'/i);
      expect(sql).not.toMatch(/WHERE\s+TRUE/i);
      expect(sql).not.toMatch(/WHERE\s+1\s*=\s*1/i);
    });

    it("uses idempotent role-permission insertion", () => {
      expect(sql).toContain('ON CONFLICT ("roleId", "permissionId") DO NOTHING;');
    });

    it("simulates additive preset conflict behavior idempotently", () => {
      interface MockRole {
        id: string;
        code: string;
      }
      interface MockPermission {
        id: string;
        path: string;
      }
      interface MockRolePermission {
        id: string;
        roleId: string;
        permissionId: string;
      }

      const roles: MockRole[] = [
        { id: "r_super", code: "SUPER_ADMIN" },
        { id: "r_owner", code: "TENANT_OWNER" },
        { id: "r_hotel_owner", code: "HOTEL_OWNER" },
        { id: "r_frontdesk", code: "HOTEL_FRONTDESK" },
        { id: "r_finance", code: "HOTEL_FINANCE" },
        { id: "r_custom", code: "CUSTOM_NIGHT_AUDITOR" },
      ];

      const permissions: MockPermission[] = TARGET_CAPABILITY_KEYS.map((key) => ({
        id: `bp_${key}`,
        path: key,
      }));

      // Simulate existing grants (e.g. hotel.stays.manage, hotel.billing.manage)
      const existingGrants: MockRolePermission[] = [
        { id: "rp_old_1", roleId: "r_frontdesk", permissionId: "bp_hotel.stays.manage" },
        { id: "rp_old_2", roleId: "r_owner", permissionId: "bp_hotel.stays.manage" },
        { id: "rp_old_3", roleId: "r_finance", permissionId: "bp_hotel.billing.manage" },
        { id: "rp_old_4", roleId: "r_custom", permissionId: "bp_hotel.dashboard.view" },
      ];

      const rolePresets = [
        { roleCode: "SUPER_ADMIN", permissionKey: "hotel.rooms.status.manage" },
        { roleCode: "SUPER_ADMIN", permissionKey: "hotel.stays.check-in" },
        { roleCode: "SUPER_ADMIN", permissionKey: "hotel.stays.check-out" },
        { roleCode: "SUPER_ADMIN", permissionKey: "hotel.requests.coordinate" },
        { roleCode: "SUPER_ADMIN", permissionKey: "hotel.requests.execute" },
        { roleCode: "SUPER_ADMIN", permissionKey: "hotel.billing.checkout" },
        { roleCode: "TENANT_OWNER", permissionKey: "hotel.requests.coordinate" },
        { roleCode: "HOTEL_OWNER", permissionKey: "hotel.requests.coordinate" },
        { roleCode: "HOTEL_FRONTDESK", permissionKey: "hotel.rooms.status.manage" },
        { roleCode: "HOTEL_FRONTDESK", permissionKey: "hotel.stays.check-in" },
        { roleCode: "HOTEL_FRONTDESK", permissionKey: "hotel.stays.check-out" },
        { roleCode: "HOTEL_FRONTDESK", permissionKey: "hotel.requests.execute" },
        { roleCode: "HOTEL_FRONTDESK", permissionKey: "hotel.billing.checkout" },
        { roleCode: "HOTEL_FINANCE", permissionKey: "hotel.billing.checkout" },
      ];

      const applyMigration = (grants: MockRolePermission[]) => {
        const result = [...grants];
        const existingKeySet = new Set(grants.map((g) => `${g.roleId}:${g.permissionId}`));

        for (const preset of rolePresets) {
          const role = roles.find((r) => r.code === preset.roleCode);
          const permission = permissions.find((p) => p.path === preset.permissionKey);
          if (!role || !permission) continue;

          const conflictKey = `${role.id}:${permission.id}`;
          if (!existingKeySet.has(conflictKey)) {
            existingKeySet.add(conflictKey);
            result.push({
              id: `rp_${role.id}_${permission.id}`,
              roleId: role.id,
              permissionId: permission.id,
            });
          }
        }
        return result;
      };

      // Run 1: additive application
      const firstRun = applyMigration(existingGrants);
      expect(firstRun.length).toBe(existingGrants.length + rolePresets.length);

      // Verify custom roles received zero new grants
      const customGrants = firstRun.filter((g) => g.roleId === "r_custom");
      expect(customGrants.length).toBe(1);
      expect(customGrants[0].permissionId).toBe("bp_hotel.dashboard.view");

      // Verify old grants are preserved
      expect(firstRun.some((g) => g.id === "rp_old_1")).toBe(true);
      expect(firstRun.some((g) => g.id === "rp_old_2")).toBe(true);

      // Verify frontdesk has execution permissions
      const frontdeskGrants = firstRun.filter((g) => g.roleId === "r_frontdesk");
      for (const execKey of FRONTDESK_EXECUTION_KEYS) {
        expect(frontdeskGrants.some((g) => g.permissionId === `bp_${execKey}`)).toBe(true);
      }
      expect(frontdeskGrants.some((g) => g.permissionId === "bp_hotel.requests.coordinate")).toBe(false);

      // Verify owner has coordinate and NO execution
      const ownerGrants = firstRun.filter((g) => g.roleId === "r_owner");
      expect(ownerGrants.some((g) => g.permissionId === "bp_hotel.requests.coordinate")).toBe(true);
      for (const execKey of FRONTDESK_EXECUTION_KEYS) {
        expect(ownerGrants.some((g) => g.permissionId === `bp_${execKey}`)).toBe(false);
      }

      // Verify finance has checkout and NO stay/request execution
      const financeGrants = firstRun.filter((g) => g.roleId === "r_finance");
      expect(financeGrants.some((g) => g.permissionId === "bp_hotel.billing.checkout")).toBe(true);
      expect(financeGrants.some((g) => g.permissionId === "bp_hotel.stays.check-in")).toBe(false);

      // Run 2: idempotent re-run produces exact same results without errors or duplicate rows
      const secondRun = applyMigration(firstRun);
      expect(secondRun.length).toBe(firstRun.length);
      expect(secondRun).toEqual(firstRun);
    });
  });
});
