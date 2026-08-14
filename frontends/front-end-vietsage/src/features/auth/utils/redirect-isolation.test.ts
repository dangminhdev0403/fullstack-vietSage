import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { createRequestRedirectUrl, resolvePostLoginRedirect, resolvePostLoginRedirectUrl } from "./redirect-isolation-core.ts";

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
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  const pathname = path.split("?")[0] ?? path;
  if (pathname === "/") return true;
  const policy = policies.find(
    (p) => pathname === p.prefix || pathname.startsWith(`${p.prefix}/`),
  );
  if (!policy) return false; // unknown routes fallback to homePath
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

// ── Hostile and Unknown Callback Sanitization ─────────────────────

test("Hostile external callbackUrl → falls back to role homePath without open redirect", () => {
  assert.equal(resolve("tenant_owner", "https://evil-phishing-site.com/steal"), "/owner/dashboard");
  assert.equal(resolve("tenant_owner", "//evil-phishing-site.com"), "/owner/dashboard");
  assert.equal(resolve("admin", "javascript:alert(1)"), "/admin/dashboard");
});

test("Unknown/unmapped callbackUrl → falls back to role homePath", () => {
  assert.equal(resolve("tenant_owner", "/some/nonexistent/404/page"), "/owner/dashboard");
  assert.equal(resolve("staff", "/random-unknown-route"), "/staff");
});

// ── No activeRoleCode ────────────────────────────────────────────

test("No activeRoleCode → guest default path", () => {
  assert.equal(resolve(null, "/admin/dashboard"), "/");
});

// ── Public redirect origin behind reverse proxies ─────────────────

test("forwarded app origin wins over a different configured production origin", () => {
  assert.equal(
    resolvePostLoginRedirectUrl({
      path: "/owner/dashboard",
      requestUrl: "http://0.0.0.0:3000/api/auth/post-login",
      configuredUrl: "https://vietsage.com",
      forwardedHost: "stay.vietsage.com",
      forwardedProto: "https",
    }),
    "https://stay.vietsage.com/owner/dashboard",
  );
});

test("forwarded public origin replaces 0.0.0.0 when no URL is configured", () => {
  assert.equal(
    resolvePostLoginRedirectUrl({
      path: "/admin/dashboard",
      requestUrl: "http://0.0.0.0:3000/api/auth/post-login",
      configuredUrl: null,
      forwardedHost: "stay.vietsage.com",
      forwardedProto: "https",
    }),
    "https://stay.vietsage.com/admin/dashboard",
  );
});

test("forwarded header lists use the first proxy value", () => {
  assert.equal(
    resolvePostLoginRedirectUrl({
      path: "/staff",
      requestUrl: "http://0.0.0.0:3000/api/auth/post-login",
      configuredUrl: null,
      forwardedHost: "stay.vietsage.com, internal-proxy",
      forwardedProto: "https, http",
    }),
    "https://stay.vietsage.com/staff",
  );
});

test("invalid forwarded host falls back without creating a protocol-relative redirect", () => {
  assert.equal(
    resolvePostLoginRedirectUrl({
      path: "/admin/dashboard",
      requestUrl: "http://localhost:3000/api/auth/post-login",
      configuredUrl: null,
      forwardedHost: "evil.example/path",
      forwardedProto: "https",
    }),
    "http://localhost:3000/admin/dashboard",
  );
});

test("forwarded host wins over local/0.0.0.0 configured URL when running in container", () => {
  assert.equal(
    resolvePostLoginRedirectUrl({
      path: "/staff",
      requestUrl: "http://0.0.0.0:3000/staff",
      configuredUrl: "http://localhost:3000",
      forwardedHost: "72.62.69.172",
      forwardedProto: "http",
    }),
    "http://72.62.69.172/staff",
  );
});

test("createRequestRedirectUrl resolves host header when request URL has 0.0.0.0 origin", () => {
  const req = {
    url: "http://0.0.0.0:3000/staff",
    headers: new Map([
      ["host", "stay.vietsage.com"],
      ["x-forwarded-proto", "https"],
    ]),
  };
  const redirectUrl = createRequestRedirectUrl("/login?reauth=1&callbackUrl=%2Fstaff", {
    url: req.url,
    headers: {
      get: (key: string) => req.headers.get(key) ?? null,
    },
  });

  assert.equal(redirectUrl.toString(), "https://stay.vietsage.com/login?reauth=1&callbackUrl=%2Fstaff");
});

test("forwarded host works even if x-forwarded-proto is missing", () => {
  const req = {
    url: "http://0.0.0.0:3000/staff",
    headers: new Map([["host", "72.62.69.172"]]),
  };
  const redirectUrl = createRequestRedirectUrl("/login?reauth=1&callbackUrl=%2Fstaff", {
    url: req.url,
    headers: {
      get: (key: string) => req.headers.get(key) ?? null,
    },
  });

  assert.equal(redirectUrl.toString(), "http://72.62.69.172/login?reauth=1&callbackUrl=%2Fstaff");
});

test("never returns 0.0.0.0 in redirect origin under any circumstance", () => {
  const redirectUrl = createRequestRedirectUrl("/login?reauth=1&callbackUrl=%2Fstaff", {
    url: "http://0.0.0.0:3000/staff",
    headers: {
      get: () => null,
    },
  });

  assert.equal(redirectUrl.toString(), "http://127.0.0.1:3000/login?reauth=1&callbackUrl=%2Fstaff");
});


