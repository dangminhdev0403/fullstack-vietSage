import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../../../", import.meta.url));

test("real desktop route and repository agree; phone stays raw and scan-only", async (t) => {
  const deskId = "00000000-0000-4000-8000-000000000001";
  const token = `test.${Buffer.from(JSON.stringify({ sid: "parent", sub: "staff" })).toString("base64url")}.test`;
  const timers = [];
  let phoneCookie = "";
  const environment = { NODE_ENV: "test" };
  // Only external auth/cookies/network are simulated; execute current routes, store and HTTP clients.
  const mocks = {
    "server-only": {},
    "next/headers": { cookies: async () => ({ get: () => ({ value: phoneCookie }) }) },
    "@/auth": { auth: async () => ({ user: { id: "staff" } }) },
    "@/libs/server-session-tokens": { readServerSessionTokens: async () => ({ accessToken: token }) },
    "@/libs/auth-session-refresh": { refreshAndSaveSessionTokens: () => assert.fail("unexpected auth refresh") },
    "@/core/http/internal-session-refresh": {
      refreshInternalSession: () => assert.fail("unexpected browser refresh"),
      dispatchAuthLogoutRequired: () => assert.fail("unexpected logout"),
    },
    "@/core/http/http-server": { httpServer: { get: async (url) => {
      assert.equal(url, "/auth/me");
      return { status: 200, message: "OK", error: null, data: {
        id: "staff", status: "ACTIVE", fullName: "Test staff", activeRole: { code: "RECEPTIONIST" },
        permissions: ["hotel.stays.manage"], accessibleHotels: [{ id: "hotel", name: "Test hotel" }],
      } };
    } } },
  };
  const context = createContext({ console, Buffer, URL, Request, Response, Headers, AbortSignal,
    TextDecoder, Uint8Array, structuredClone, process: { env: environment },
    setInterval: (...args) => { const timer = setInterval(...args); timers.push(timer); return timer; },
    fetch: async (url, init = {}) => {
      const headers = new Headers(init.headers);
      headers.set("Origin", "https://desk.test");
      const request = new Request(new URL(url, "https://desk.test"), { ...init, headers });
      const route = url.startsWith("/api/cccd-mobile/hotels/") ? desktop : phone;
      const response = await route[request.method](request, { params: Promise.resolve({ hotelId: "hotel" }) });
      const cookie = response.headers.get("set-cookie");
      if (cookie) phoneCookie = cookie.split(";")[0].split("=")[1];
      assert.match(response.headers.get("cache-control"), /no-store/);
      return response;
    },
  });
  t.after(() => timers.forEach(clearInterval));
  const cache = new Map();
  function load(specifier, parent = path.join(root, "index.ts")) {
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    if (!specifier.startsWith("@/") && !specifier.startsWith(".")) return require(specifier);
    let file = specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : path.resolve(path.dirname(parent), specifier);
    if (!path.extname(file)) file += ".ts";
    if (cache.has(file)) return cache.get(file).exports;
    const loaded = { exports: {} };
    cache.set(file, loaded);
    const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    });
    runInContext(`(function(require,module,exports){${outputText}\n})`, context, { filename: file })(
      (name) => load(name, file), loaded, loaded.exports);
    return loaded.exports;
  }
  const desktop = load("@/app/api/cccd-mobile/hotels/[hotelId]/sessions/route");
  const phone = load("@/app/api/cccd-mobile/sessions/route");
  const { mobileShiftRepository: repo, MobileApiError } = load("@/features/local-biometric/repositories/mobile-shift-repository");
  assert.equal((await repo.desk("hotel", deskId)).session, null);
  const created = await repo.command("hotel", { action: "create", deskId });
  assert.equal(created.phase, "pairing");
  assert.match(created.code, /^[a-f0-9]{64}$/);
  const claimed = await repo.phone({ action: "claim", code: created.code });
  assert.equal(claimed.phase, "pending");
  const command = (action, fields = {}) => repo.command("hotel", { action, deskId, sessionId: created.sessionId, ...fields });
  assert.equal((await command("approve", { comparisonCode: claimed.comparisonCode })).phase, "active");
  const target = (await command("target", { targetKey: "guest-1", targetLabel: "Room 101" })).target;
  const transferId = "00000000-0000-4000-8000-000000000002";
  const sent = await repo.phone({ action: "submit", requestId: target.requestId, transferId,
    raw: "000000000001||KHACH THU|01011990|Nam|Ha Noi|01012020" });
  assert.equal(sent.target.status, "received");
  assert.equal("payload" in sent, false);
  assert.equal("payload" in await repo.desk("hotel", deskId), false);
  assert.equal((await command("read")).payload.guest.displayName, "KHACH THU");
  assert.equal((await command("ack", { requestId: target.requestId, transferId })).payload, null);
  assert.equal((await repo.phone()).receipt.status, "acknowledged");
  const next = (await command("target", { targetKey: "guest-2", targetLabel: "Room 102" })).target;
  assert.equal((await command("discard", { requestId: next.requestId })).target, null);
  assert.equal((await command("revoke")).revoked, true);
  assert.equal((await repo.desk("hotel", deskId)).session, null);
  await assert.rejects(repo.phone(), (error) => error instanceof MobileApiError && error.status === 404);
  environment.NODE_ENV = "production";
  const prodAllowed = await desktop.GET(new Request(`https://desk.test/api/cccd-mobile/hotels/hotel/sessions?deskId=${deskId}`), { params: Promise.resolve({ hotelId: "hotel" }) });
  assert.equal(prodAllowed.status, 200);
  environment.DISABLE_MOBILE_CCCD_SCAN = "true";
  const blocked = await desktop.GET(new Request(`https://desk.test/api/cccd-mobile/hotels/hotel/sessions?deskId=${deskId}`), { params: Promise.resolve({ hotelId: "hotel" }) });
  assert.equal(blocked.status, 503);
  assert.equal((await blocked.json()).code, "SHARED_STORE_REQUIRED");
});
