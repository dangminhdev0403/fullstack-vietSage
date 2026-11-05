import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript/lib/typescript.js";

const source = await readFile(
  new URL("../src/app/(vietsage)/g/[qrCode]/page.tsx", import.meta.url),
  "utf8",
);
const clientSource = await readFile(
  new URL("../src/app/(vietsage)/g/[qrCode]/guest-qr-entry-client.tsx", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

class HttpError extends Error {
  constructor(status) {
    super("QR request failed");
    this.status = status;
  }
}

function loadPage({ session = null, role = "HOTEL_HOUSEKEEPING", baseRoleCode, failure, tokenFailure } = {}) {
  const calls = { auth: 0, context: 0, api: 0, qr: [] };
  const GuestClient = () => null;
  const redirect = (url) => { throw { kind: "redirect", url }; };
  const notFound = () => { throw { kind: "notFound" }; };
  const modules = {
    "react/jsx-runtime": { jsx: (type) => ({ type }) },
    "next/navigation": { redirect, notFound },
    "@/auth": { auth: async () => { calls.auth++; return session; } },
    "@/core/http/http-error": { HttpError },
    "@/features/hotel-ops/service/hotel-ops-service-instance": {
      hotelOpsService: { getHousekeepingRoomByQr: async (qrCode, options) => {
        calls.qr.push({ qrCode, options });
        if (failure) throw failure;
        return { id: "room-101", hotelId: "hotel-1" };
      } },
    },
    "@/features/hotel-ops/utils/hotel-route-auth": {
      requireHotelOpsServerTokens: async () => {
        if (tokenFailure) throw tokenFailure;
        return { accessToken: "context-token" };
      },
    },
    "@/libs/server-workspace-context": {
      loadServerWorkspaceContext: async (_callback, token) => {
        calls.context++;
        assert.equal(token, "context-token");
        return { activeRole: { code: role, baseRoleCode } };
      },
    },
    "@/libs/server-api-auth": {
      createAuthorizedApiExecutor: ({ callbackUrl }) => async (_operation, call) => {
        calls.api++;
        assert.equal(callbackUrl, "/g/room-qr");
        return call("authorized-token");
      },
    },
    "./guest-qr-entry-client": { default: GuestClient },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: (name) => {
      assert.ok(name in modules, "Unexpected server dependency: " + name);
      return modules[name];
    },
  });
  return { page: module.exports.default, calls, GuestClient };
}

const params = (qrCode = "room-qr") => ({ params: Promise.resolve({ qrCode }) });
const staffSession = { user: { role: "HOTEL_FRONT_DESK" } };

test("anonymous guest keeps the guest client without staff API access", async () => {
  const { page, calls, GuestClient } = loadPage();
  assert.equal((await page(params())).type, GuestClient);
  assert.equal(calls.context, 0);
  assert.equal(calls.api, 0);
});

test("non-housekeeping active role keeps the guest client", async () => {
  const { page, calls, GuestClient } = loadPage({ session: staffSession, role: "HOTEL_FRONT_DESK" });
  assert.equal((await page(params())).type, GuestClient);
  assert.equal(calls.api, 0);
});

test("active housekeeping role resolves QR with staff auth and opens room detail", async () => {
  const { page, calls } = loadPage({ session: staffSession });
  await assert.rejects(page(params(" room-qr ")), (error) => error.kind === "redirect" && error.url === "/hotels/hotel-1/rooms/room-101");
  assert.equal(calls.api, 1);
  assert.equal(calls.qr.length, 1);
  assert.equal(calls.qr[0].qrCode, "room-qr");
  assert.equal(calls.qr[0].options.accessToken, "authorized-token");
});

test("custom role inheriting housekeeping opens staff room detail", async () => {
  const { page, calls } = loadPage({ session: staffSession, role: "CUSTOM_HOUSEKEEPING", baseRoleCode: "HOTEL_HOUSEKEEPING" });
  await assert.rejects(page(params()), (error) => error.kind === "redirect" && error.url === "/hotels/hotel-1/rooms/room-101");
  assert.equal(calls.api, 1);
});

test("canonical housekeeping role remains valid with null base role", async () => {
  const { page, calls } = loadPage({ session: staffSession, baseRoleCode: null });
  await assert.rejects(page(params()), (error) => error.kind === "redirect" && error.url === "/hotels/hotel-1/rooms/room-101");
  assert.equal(calls.api, 1);
});

test("reserved guest paths redirect before staff resolution", async () => {
  for (const route of ["home", "language", "requests", "services"]) {
    const { page, calls } = loadPage({ session: staffSession });
    await assert.rejects(page(params(route.toUpperCase())), (error) => error.kind === "redirect" && error.url === "/g/" + route);
    assert.equal(calls.auth, 0);
    assert.equal(calls.api, 0);
  }
});

test("missing staff QR never falls back to a guest session", async () => {
  const { page, calls } = loadPage({ session: staffSession });
  await assert.rejects(page(params(" ")), (error) => error.kind === "notFound");
  assert.equal(calls.api, 0);
});

test("unknown staff QR becomes notFound", async () => {
  const { page } = loadPage({ session: staffSession, failure: new HttpError(404) });
  await assert.rejects(page(params()), (error) => error.kind === "notFound");
});

test("staff API redirect and errors propagate without guest fallback", async () => {
  for (const failure of [{ kind: "redirect", url: "/dangnhap" }, { kind: "notFound" }, new HttpError(500)]) {
    const { page } = loadPage({ session: staffSession, failure });
    await assert.rejects(page(params()), (error) => error === failure);
  }
});

test("session refresh redirect propagates before QR resolution", async () => {
  const failure = { kind: "redirect", url: "/dangnhap" };
  const { page, calls } = loadPage({ session: staffSession, tokenFailure: failure });
  await assert.rejects(page(params()), (error) => error === failure);
  assert.equal(calls.api, 0);
});

test("guest scanning stays inside the client boundary", () => {
  assert.ok(clientSource.startsWith('"use client";'));
  assert.match(clientSource, /guestOsService[\s\S]*?\.scanQr\(/);
  assert.match(clientSource, /setGuestSession\(session\)/);
  assert.doesNotMatch(source, /guestOsService|scanQr\(|setGuestSession/);
});
