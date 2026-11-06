import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

class HttpError extends Error {
  constructor(data) { super("HTTP request failed"); this.data = data; }
}

function loadRepository(request) {
  const source = stripTypeScriptTypes(readFileSync(new URL("./repositories/role-permissions-repository.ts", import.meta.url), "utf8"))
    .replace(/^import .*;\r?\n/gm, "")
    .replaceAll("export ", "");
  return new Function("HttpError", "requestInternalApi",
    source + "\nreturn { rolePermissionsRepository, parseRolePermissions };",
  )(HttpError, request);
}

test("role permissions rejects malformed responses and normalizes only valid permission records", () => {
  const { parseRolePermissions } = loadRepository(() => {});
  assert.throws(() => parseRolePermissions({ items: [] }), /đúng định dạng/);
  assert.deepEqual(parseRolePermissions([
    null, { id: "bad" },
    { id: "a", method: "GET", path: "/a", description: "  Read  " },
    { id: "b", method: "POST", path: "/b", description: " " },
  ]), [
    { id: "a", method: "GET", path: "/a", description: "Read" },
    { id: "b", method: "POST", path: "/b", description: "Quyền thao tác hệ thống" },
  ]);
});

test("permission lookup encodes its role and forwards cancellation to the central transport", async () => {
  let received;
  const { rolePermissionsRepository } = loadRepository(async (...args) => { received = args; return []; });
  const signal = new AbortController().signal;
  assert.deepEqual(await rolePermissionsRepository.permissions("role/a?", signal), []);
  assert.equal(received[0], "/api/rbac/roles/role%2Fa%3F/capabilities");
  assert.equal(received[1].method, "GET");
  assert.equal(received[1].signal, signal);
});

test("permission lookup preserves the existing friendly error and non-HTTP failures", async () => {
  const { rolePermissionsRepository } = loadRepository(async () => { throw new HttpError({ data: { detail: "Không có quyền" } }); });
  await assert.rejects(rolePermissionsRepository.permissions("a"), /Không có quyền/);
  const failure = new Error("Canceled");
  const other = loadRepository(async () => { throw failure; });
  await assert.rejects(other.rolePermissionsRepository.permissions("a"), (error) => error === failure);
});

test("role commands preserve mutation methods, encoded identity and submitted permission IDs", async () => {
  const calls = [];
  const { rolePermissionsRepository } = loadRepository(async (...args) => { calls.push(args); return {}; });
  const body = { code: "CUSTOM", name: "Custom", baseRoleId: "base", permissionIds: ["p1"] };
  await rolePermissionsRepository.create(body);
  await rolePermissionsRepository.update({ roleId: "a/b", body });
  await rolePermissionsRepository.remove("a/b");
  assert.deepEqual(calls.map(([url, options]) => [url, options.method]), [
    ["/api/rbac/roles", "POST"], ["/api/rbac/roles/a%2Fb", "PATCH"], ["/api/rbac/roles/a%2Fb", "DELETE"],
  ]);
  assert.equal(calls[0][1].body, body);
  assert.equal(calls[1][1].body, body);
});
