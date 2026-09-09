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

test("real routes relay validated QR fields and volatile passport images", async (t) => {
  const deskId = "00000000-0000-4000-8000-000000000001";
  const token = `test.${Buffer.from(JSON.stringify({ sid: "parent", sub: "staff" })).toString("base64url")}.test`;
  const timers = [];
  let phoneCookie = "";
  let authorizedOcrHotel = "";
  const environment = { NODE_ENV: "test" };
  // Only external auth/cookies/network are simulated; execute current routes, store and HTTP clients.
  const mocks = {
    "server-only": {},
    "next/headers": { cookies: async () => ({ get: () => ({ value: phoneCookie }) }) },
    "@/auth": { auth: async () => ({ user: { id: "staff" } }) },
    "@/features/local-biometric/workstation/authorize-hotel-workstation": {
      authorizeHotelWorkstation: async (_session, hotelId) => { authorizedOcrHotel = hotelId; return null; },
    },
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
  const context = createContext({ console, Buffer, URL, URLSearchParams, Request, Response, Headers, AbortSignal, Blob, File, FormData,
    TextDecoder, Uint8Array, structuredClone, process: { env: environment },
    setInterval: (...args) => { const timer = setInterval(...args); timers.push(timer); return timer; },
    fetch: async (url, init = {}) => {
      if (String(url).startsWith("http://open-mrz:8787/")) {
        assert.equal((await new Request(url, init).formData()).getAll("files").length, 1);
        return Response.json({ results: [{ success: true, documentKind: "passport", identityNumber: "PASS123", fullName: "PASSPORT HOLDER" }] });
      }
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
  const ocr = load("@/app/api/cccd-mobile/hotels/[hotelId]/ocr/route");
  const { mobileShiftRepository: repo, MobileApiError } = load("@/features/local-biometric/repositories/mobile-shift-repository");
  const ocrForm = new FormData();
  ocrForm.append("files", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "passport.jpg", { type: "image/jpeg" }));
  const ocrResponse = await ocr.POST(new Request("https://desk.test/api/cccd-mobile/hotels/hotel/ocr", {
    method: "POST", headers: { Origin: "https://desk.test" }, body: ocrForm,
  }), { params: Promise.resolve({ hotelId: "hotel" }) });
  assert.equal(ocrResponse.status, 200);
  assert.equal(authorizedOcrHotel, "hotel");
  assert.equal((await ocrResponse.json()).results[0].identityNumber, "PASS123");
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
  const passportTarget = (await command("target", { targetKey: "guest-2", targetLabel: "Room 102" })).target;
  const passportTransferId = "00000000-0000-4000-8000-000000000003";
  await assert.rejects(
    repo.sendDocument(passportTarget.requestId, passportTransferId, new File(["not-an-image"], "fake.jpg", { type: "image/jpeg" })),
    (error) => error instanceof MobileApiError && error.status === 422,
  );
  const passport = new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0xff, 0xd9])], "passport.jpg", { type: "image/jpeg" });
  const passportSent = await repo.sendDocument(passportTarget.requestId, passportTransferId, passport);
  assert.equal(passportSent.target.status, "document");
  assert.equal((await repo.sendDocument(passportTarget.requestId, passportTransferId, passport)).target.status, "document");
  assert.equal("payload" in passportSent, false);
  assert.equal(JSON.stringify(passportSent).includes("bytes"), false);
  const downloaded = await repo.document("hotel", deskId, created.sessionId, passportTarget.requestId);
  assert.equal(downloaded.transferId, passportTransferId);
  assert.deepEqual([...new Uint8Array(await downloaded.file.arrayBuffer())], [0xff, 0xd8, 0xff, 0x00, 0xff, 0xd9]);
  assert.equal((await command("ack", { requestId: passportTarget.requestId, transferId: passportTransferId })).target.status, "acknowledged");
  assert.equal((await repo.sendDocument(passportTarget.requestId, passportTransferId, passport)).receipt.status, "acknowledged");
  await assert.rejects(repo.document("hotel", deskId, created.sessionId, passportTarget.requestId), (error) => error instanceof MobileApiError && error.status === 404);
  const next = (await command("target", { targetKey: "guest-3", targetLabel: "Room 103" })).target;
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
