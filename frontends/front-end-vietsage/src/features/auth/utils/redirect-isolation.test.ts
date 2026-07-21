import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { resolvePostLoginRedirect } from "./redirect-isolation-core.ts";

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Minimal route-policy simulation matching the real rbac routePolicies:
 *   /admin  → admin only
 *   /owner  → tenant_owner only
 *   /staff  → staff, admin
 *   /hotels → staff, admin
 *   /g      → guest, staff, admin
 *   (other) → public (anyone)
 */
const policies: Array<{ prefix: string; roles: string[] }> = [
  { prefix: "/admin", roles: ["admin"] },
  { prefix: "/owner", roles: ["tenant_owner"] },
  { prefix: "/staff", roles: ["staff", "admin"] },
  { prefix: "/hotels", roles: ["staff", "admin"] },
  { prefix: "/g", roles: ["guest", "staff", "admin"] },
];

const rolePaths: Record<string, string> = {
  admin: "/admin/dashboard",
  staff: "/staff",
  tenant_owner: "/owner/dashboard",
  guest: "/",
};

function fakeCanAccess(roles: readonly string[], path: string): boolean {
  const pathname = path.split("?")[0] ?? path;
  const policy = policies.find(
    (p) => pathname === p.prefix || pathname.startsWith(`${p.prefix}/`),
  );
  if (!policy) return true; // public
  return policy.roles.some((r) => roles.includes(r));
}

function fakeGetDefaultPath(roles: readonly string[]): string {
  const role = roles[0];
  if (!role) return "/";
  return rolePaths[role] ?? "/";
}

function resolve(activeRoleCode: string | null, callbackUrl: string | null): string {
  return resolvePostLoginRedirect({
    activeRoleCode,
    callbackUrl,
    canAccess: fakeCanAccess,
    getDefaultPath: fakeGetDefaultPath,
  });
}

// ── Cross-workspace isolation ────────────────────────────────────

test("Admin logout → Staff login with /admin/users callback → staff homePath", () => {
  assert.equal(resolve("staff", "/admin/users"), "/staff");
});

test("Staff logout → Owner login with /hotels/123 callback → owner homePath", () => {
  assert.equal(resolve("tenant_owner", "/hotels/123"), "/owner/dashboard");
});

test("Guest login with /admin/dashboard callback → guest homePath", () => {
  assert.equal(resolve("guest", "/admin/dashboard"), "/");
});

// ── Same-role re-login ───────────────────────────────────────────

test("Admin re-login with valid /admin/dashboard callback → callback preserved", () => {
  assert.equal(resolve("admin", "/admin/dashboard"), "/admin/dashboard");
});

test("Admin re-login with valid /admin/users callback → callback preserved", () => {
  assert.equal(resolve("admin", "/admin/users"), "/admin/users");
});

test("Staff re-login with valid /staff callback → callback preserved", () => {
  assert.equal(resolve("staff", "/staff"), "/staff");
});

// ── Null / empty callback ────────────────────────────────────────

test("Null callback → homePath", () => {
  assert.equal(resolve("admin", null), "/admin/dashboard");
});

test("Empty string callback → homePath", () => {
  assert.equal(resolve("staff", ""), "/staff");
});

test("Whitespace-only callback → homePath", () => {
  assert.equal(resolve("tenant_owner", "   "), "/owner/dashboard");
});

// ── No activeRoleCode ────────────────────────────────────────────

test("No activeRoleCode → guest default path", () => {
  assert.equal(resolve(null, "/admin/dashboard"), "/");
});
