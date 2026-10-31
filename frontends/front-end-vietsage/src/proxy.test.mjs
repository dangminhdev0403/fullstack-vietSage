import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { NextRequest, NextResponse } from "next/server.js";

const proxyUrl = new URL("./proxy.ts", import.meta.url).href;
const fixtureKey = Symbol.for("vietsage.proxy.cookie-test");
const fixture = { session: null, rollingCookie: "__Secure-authjs.session-token" };
globalThis[fixtureKey] = fixture;

const stub = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const authStub = stub(`
  export const auth = (handler) => async (request) => {
    const fixture = globalThis[Symbol.for("vietsage.proxy.cookie-test")];
    request.auth = fixture.session;
    const response = await handler(request);
    const final = new Response(response.body, response);
    if (fixture.session) {
      final.headers.append("set-cookie", fixture.rollingCookie + "=rolled-old-session; Path=/; HttpOnly; Secure; SameSite=Lax");
    }
    return final;
  };
`);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === proxyUrl) {
      if (specifier === "./auth") return { url: authStub, shortCircuit: true };
      if (specifier === "next/server") return nextResolve("next/server.js", context);
      if (specifier.endsWith("/api-mutation-origin")) {
        return { url: stub("export const isAllowedApiMutationRequest = () => true;"), shortCircuit: true };
      }
      if (specifier.endsWith("/runtime-console")) {
        return { url: stub("export const runtimeConsole = {info() {}};"), shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});
const { proxy } = await import(proxyUrl);

const session = (patch = {}) => ({
  user: { id: "qa-user", roles: ["TENANT_OWNER"] },
  activeRoleCode: "TENANT_OWNER",
  canRefresh: true,
  accessTokenExpiresAt: Date.now() + 60_000,
  ...patch,
});

async function request(path, authSession, cookieNames = [fixture.rollingCookie]) {
  fixture.session = authSession;
  const req = new NextRequest(`https://vietsage.localhost${path}`, {
    headers: {
      cookie: cookieNames.map((name) => `${name}=old-session`).join("; "),
      "x-forwarded-proto": "https",
      "x-forwarded-host": "vietsage.localhost",
    },
  });
  return proxy(req, {});
}

function assertExpiredCookies(response, names) {
  const cookies = new NextResponse(null, response).cookies;
  for (const name of names) {
    const cookie = cookies.get(name);
    assert.ok(cookie, `missing reset cookie: ${name}`);
    assert.equal(cookie.value ?? "", "", `session was renewed after clearing ${name}`);
    const wire = response.headers.getSetCookie().filter((entry) => entry.startsWith(`${name}=`)).at(-1);
    assert.match(wire, /;\s*Max-Age=0(?:;|$)/i);
    assert.equal(cookie.expires?.getTime(), 0);
    assert.equal(cookie.path, "/");
    if (name.startsWith("__Secure-") || name.startsWith("__Host-")) {
      assert.equal(cookie.secure, true);
    }
  }
}

test("expired/unrefreshable session cannot be resurrected by Auth.js rolling cookies", async () => {
  const response = await request("/owner/dashboard?callbackUrl=%2Fowner%2Fdashboard", session({ canRefresh: false }));
  const target = new URL(response.headers.get("location"));
  assert.equal(target.pathname, "/dangnhap");
  assert.equal(target.searchParams.get("reauth"), "1");
  assert.equal(target.searchParams.get("callbackUrl"), "/owner/dashboard");
  assertExpiredCookies(response, [fixture.rollingCookie]);
});

test("forced reauth renders login and clears cookies after the Auth.js wrapper", async () => {
  const response = await request("/dangnhap?reauth=1&callbackUrl=%2Fowner%2Fdashboard", session());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assertExpiredCookies(response, [fixture.rollingCookie]);
});

test("reauth clears secure/plain legacy and chunked auth cookies while preserving unrelated cookies", async () => {
  const names = ["authjs.session-token.0", "authjs.session-token.1", "__Secure-authjs.session-token.0", "next-auth.session-token", "__Host-authjs.csrf-token"];
  const response = await request("/dangnhap?reauth=1", session(), [...names, "hotel-preference"]);
  assertExpiredCookies(response, [...names, fixture.rollingCookie]);
  assert.equal(new NextResponse(null, response).cookies.has("hotel-preference"), false);
});

test("valid session keeps its rolling cookie and accesses its workspace", async () => {
  const response = await request("/owner/dashboard", session());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.equal(new NextResponse(null, response).cookies.get(fixture.rollingCookie)?.value, "rolled-old-session");
});

test("expired access token with refresh authority still uses the refresh gate", async () => {
  const response = await request("/owner/dashboard", session({ accessTokenExpiresAt: Date.now() - 1 }));
  assert.equal(new URL(response.headers.get("location")).pathname, "/api/auth/refresh-session");
  assert.equal(new NextResponse(null, response).cookies.get(fixture.rollingCookie)?.value, "rolled-old-session");
});
