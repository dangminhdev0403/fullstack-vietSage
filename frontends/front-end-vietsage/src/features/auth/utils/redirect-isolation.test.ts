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
  if (pathname === "/hotels" || pathname === "/hotels/") return false;
  if (pathname === "/") return true;

  const role = roles[0];
  if (role === "staff" || role === "hotel_frontdesk") {
    if (pathname.startsWith("/owner") || pathname.startsWith("/admin")) return false;
  }
  if (role === "tenant_owner") {
    if (pathname.startsWith("/staff") || pathname.startsWith("/admin") || pathname.startsWith("/hotels")) return false;
  }

  const policy = policies.find(
    (p) => pathname === p.prefix || pathname.startsWith(`${p.prefix}/`),
  );
  if (!policy) return false; // unknown routes fallback to homePath
  return policy.roles.some((r) => roles.includes(r) || (r === "staff" && roles.includes("hotel_frontdesk")));
}

function fakeGetDefaultPath(roles: readonly string[]): string {
  const role = roles[0];
  if (!role) return "/";
  if (role === "hotel_frontdesk") return "/staff";
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

test("Tenant logout → Frontdesk login with /owner/dashboard callback → staff homePath", () => {
  assert.equal(resolve("hotel_frontdesk", "/owner/dashboard"), "/staff");
});

test("Tenant logout → Frontdesk login with /owner/hotels/123/rooms callback → staff homePath", () => {
  assert.equal(resolve("hotel_frontdesk", "/owner/hotels/123/rooms"), "/staff");
});

test("Tenant login with /staff callback → owner homePath", () => {
  assert.equal(resolve("tenant_owner", "/staff"), "/owner/dashboard");
});

test("Staff login with bare /hotels callback → falls back to staff homePath (/staff)", () => {
  assert.equal(resolve("staff", "/hotels"), "/staff");
  assert.equal(resolve("staff", "/hotels/"), "/staff");
});

test("Owner login with bare /hotels callback → falls back to owner homePath", () => {
  assert.equal(resolve("tenant_owner", "/hotels"), "/owner/dashboard");
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

test("production redirect keeps HTTPS when forwarded protocol is missing or HTTP", () => {
  for (const forwardedProto of [null, "http"]) {
    assert.equal(
      resolvePostLoginRedirectUrl({
        path: "/dangnhap?callbackUrl=%2Fadmin",
        requestUrl: "http://0.0.0.0:3000/admin",
        configuredUrl: "https://vietsage.com",
        forwardedHost: "vietsage.com",
        forwardedProto,
      }),
      "https://vietsage.com/dangnhap?callbackUrl=%2Fadmin",
    );
  }
});

test("VietSage public host remains HTTPS even with local container config", () => {
  assert.equal(
    resolvePostLoginRedirectUrl({
      path: "/dangnhap",
      requestUrl: "http://0.0.0.0:3000/admin",
      configuredUrl: "http://localhost:3000",
      forwardedHost: "vietsage.com",
      forwardedProto: "http",
    }),
    "https://vietsage.com/dangnhap",
  );
});

test("forged request URL cannot supply an unconfigured external redirect host", () => {
  assert.equal(
    resolvePostLoginRedirectUrl({
      path: "/dangnhap",
      requestUrl: "http://audit.invalid/admin",
      configuredUrl: "http://localhost:3000",
      forwardedHost: "audit.invalid",
      forwardedProto: "http",
    }),
    "http://127.0.0.1:3000/dangnhap",
  );
});

test("configured production origin rejects unrelated forwarded hosts behind the proxy", () => {
  assert.equal(
    resolvePostLoginRedirectUrl({
      path: "/dangnhap?callbackUrl=%2Fadmin",
      requestUrl: "http://0.0.0.0:3000/admin",
      configuredUrl: "https://vietsage.com",
      forwardedHost: "audit.invalid",
      forwardedProto: "https",
    }),
    "https://vietsage.com/dangnhap?callbackUrl=%2Fadmin",
  );
});

test("untrusted forwarded host cannot redirect away from the request host", () => {
  const redirectUrl = createRequestRedirectUrl("/dangnhap?callbackUrl=%2Fadmin", {
    url: "https://vietsage.com/admin",
    headers: {
      get: (key: string) => new Map([
        ["host", "vietsage.com"],
        ["x-forwarded-host", "audit.invalid"],
        ["x-forwarded-proto", "https"],
      ]).get(key) ?? null,
    },
  });
  assert.equal(redirectUrl.toString(), "https://vietsage.com/dangnhap?callbackUrl=%2Fadmin");
});

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

test("explicitly configured IP origin remains available for development", () => {
  assert.equal(
    resolvePostLoginRedirectUrl({
      path: "/staff",
      requestUrl: "http://0.0.0.0:3000/staff",
      configuredUrl: "http://72.62.69.172",
      forwardedHost: "72.62.69.172",
      forwardedProto: "http",
    }),
    "http://72.62.69.172/staff",
  );
});

test("unconfigured forwarded IP does not create an external redirect", () => {
  assert.equal(
    resolvePostLoginRedirectUrl({
      path: "/staff",
      requestUrl: "http://0.0.0.0:3000/staff",
      configuredUrl: "http://localhost:3000",
      forwardedHost: "203.0.113.10",
      forwardedProto: "http",
    }),
    "http://127.0.0.1:3000/staff",
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

test("unconfigured forwarded IP cannot redirect away from container origin", () => {
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

  assert.equal(redirectUrl.toString(), "http://127.0.0.1:3000/login?reauth=1&callbackUrl=%2Fstaff");
});

test("public request origin stays HTTPS if forwarded headers are hostile or absent", () => {
  for (const forwardedHost of ["audit.invalid", null]) {
    assert.equal(
      resolvePostLoginRedirectUrl({
        path: "/dangnhap?callbackUrl=%2Fadmin",
        requestUrl: "http://vietsage.com/admin",
        configuredUrl: "http://localhost:3000",
        forwardedHost,
        forwardedProto: null,
      }),
      "https://vietsage.com/dangnhap?callbackUrl=%2Fadmin",
    );
  }
});

test("public request host cannot switch to a sibling app through forwarded headers", () => {
  assert.equal(
    resolvePostLoginRedirectUrl({
      path: "/dangnhap?callbackUrl=%2Fadmin",
      requestUrl: "https://vietsage.com/admin",
      configuredUrl: null,
      forwardedHost: "stay.vietsage.com",
      forwardedProto: "https",
    }),
    "https://vietsage.com/dangnhap?callbackUrl=%2Fadmin",
  );
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


