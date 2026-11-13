import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test, { after } from "node:test";

const sourceRoot = new URL("../../../", import.meta.url);
const fixtureKey = Symbol.for("vietsage.request-realtime-ticket.test");
const fixture = { request: null, refresh: null };
globalThis[fixtureKey] = fixture;
const fixtureExpression = `globalThis[Symbol.for("vietsage.request-realtime-ticket.test")]`;
const stubs = {
  "@/auth": "export const auth = async () => ({ user: { id: 'test-user' }, activeRoleCode: 'HOTEL_FRONTDESK' });",
  "@/libs/server-session-tokens": "export const readServerSessionTokens = async () => ({ accessToken: 'test-old-access', refreshToken: 'test-refresh', accessTokenExpiresAt: Date.now() + 60000 });",
  "@/libs/auth-session-refresh": `export const refreshAndSaveSessionTokens = (...args) => ${fixtureExpression}.refresh(...args);`,
  "@/core/logging/runtime-console": "export const runtimeConsole = { info() {} };",
  "@/features/workspace/config/workspace-registry": "export const resolveWorkspacePersona = () => 'staff';",
  "@/features/hotel-ops/service/hotel-ops-service-instance": `export const hotelOpsService = { issueRequestRealtimeTicket: (...args) => ${fixtureExpression}.request(...args) };`,
};
const hook = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier in stubs) {
      return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
    }
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier.startsWith("@/")) {
      return { url: new URL(`${specifier.slice(2)}.ts`, sourceRoot).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { HttpError } = await import(new URL("core/http/http-error.ts", sourceRoot));
const { AuthServiceError } = await import(new URL("features/auth/service/auth-service.ts", sourceRoot));
const { POST } = await import("./hotels/[hotelId]/request-realtime-ticket/route.ts");

after(() => {
  hook.deregister();
  delete globalThis[fixtureKey];
});

function backendError(status, headers) {
  return new HttpError({
    status,
    requestUrl: "http://backend/hotels/test-hotel/request-realtime-ticket",
    message: "Backend request rejected",
    data: { status, message: status === 401 ? "UNAUTHORIZED" : "UPSTREAM_ERROR" },
    headers,
  });
}

function issueTicket() {
  return POST(new Request("http://localhost/api/hotel-ops/hotels/test-hotel/request-realtime-ticket", { method: "POST" }), {
    params: Promise.resolve({ hotelId: "test-hotel" }),
  });
}

test("a rejected refresh preserves the backend 401 instead of producing a ticket 500", async (t) => {
  t.mock.method(console, "warn", () => {});
  t.mock.method(console, "error", () => {});
  let attempts = 0;
  fixture.request = async () => { attempts += 1; throw backendError(401); };
  fixture.refresh = async () => { throw new AuthServiceError("INVALID_CREDENTIALS", "Invalid credentials"); };

  const response = await issueTicket();
  assert.equal(response.status, 401);
  assert.equal((await response.json()).message, "UNAUTHORIZED");
  assert.equal(attempts, 1);
});

test("a successful refresh retries once with the new access token and returns the scoped ticket", async () => {
  const tokens = [];
  fixture.request = async (hotelId, token) => {
    assert.equal(hotelId, "test-hotel");
    tokens.push(token);
    if (tokens.length === 1) throw backendError(401);
    return { ticket: "test-scoped-ticket", expiresAt: "2026-11-13T12:00:00.000Z" };
  };
  fixture.refresh = async () => ({ accessToken: "test-new-access" });

  const response = await issueTicket();
  assert.equal(response.status, 200);
  assert.deepEqual(tokens, ["test-old-access", "test-new-access"]);
  assert.equal((await response.json()).data.ticket, "test-scoped-ticket");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("an explicit refresh upstream failure retains its status and retry header", async (t) => {
  t.mock.method(console, "error", () => {});
  fixture.request = async () => { throw backendError(401); };
  fixture.refresh = async () => { throw backendError(503, new Headers({ "Retry-After": "10" })); };

  const response = await issueTicket();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Retry-After"), "10");
});

test("a retried ticket network failure is preserved rather than converted to unauthorized", async (t) => {
  t.mock.method(console, "error", () => {});
  let attempts = 0;
  fixture.request = async () => { attempts += 1; throw backendError(attempts === 1 ? 401 : 0); };
  fixture.refresh = async () => ({ accessToken: "test-new-access" });

  const response = await issueTicket();
  assert.equal(response.status, 502);
  assert.equal(attempts, 2);
});

test("a denied ticket request remains forbidden without rotating the session", async (t) => {
  t.mock.method(console, "error", () => {});
  fixture.request = async () => { throw backendError(403); };
  fixture.refresh = async () => { assert.fail("forbidden requests must not refresh"); };

  const response = await issueTicket();
  assert.equal(response.status, 403);
  assert.equal((await response.json()).message, "FORBIDDEN");
});
