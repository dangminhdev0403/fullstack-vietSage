import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { getPrimaryAppRole, hasAppRole } from "./auth-role.ts";

test("maps hotel operation templates into the staff application surface", () => {
  for (const roleCode of [
    "HOTEL_MANAGER",
    "HOTEL_FRONTDESK",
    "HOTEL_HOUSEKEEPING",
    "HOTEL_MAINTENANCE",
    "HOTEL_FINANCE",
  ]) {
    assert.equal(hasAppRole([roleCode], "staff"), true);
    assert.equal(getPrimaryAppRole([roleCode]), "staff");
  }
});

test("uses only the supplied active role code when resolving the application surface", () => {
  assert.equal(getPrimaryAppRole(["HOTEL_FRONTDESK"]), "staff");
  assert.equal(getPrimaryAppRole(["SUPER_ADMIN"]), "admin");
});

test("correctly maps Principal roles away from platform admin", () => {
  for (const roleCode of [
    "PRINCIPAL",
    "SCHOOL_PRINCIPAL",
    "HIEU_TRUONG",
    "SCHOOL_ADMIN",
    "PRINCIPAL_ADMIN",
    "HIEU_TRUONG_ADMIN",
  ]) {
    assert.equal(hasAppRole([roleCode], "admin"), false, `${roleCode} should not match admin`);
    assert.equal(hasAppRole([roleCode], "tenant_owner"), true, `${roleCode} should match tenant_owner/school owner`);
    assert.notEqual(getPrimaryAppRole([roleCode]), "admin", `${roleCode} primary app role should not be admin`);
  }
});
