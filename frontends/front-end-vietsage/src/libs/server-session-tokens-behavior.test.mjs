import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const targetUrl = new URL("./server-session-tokens.ts", import.meta.url).href;
const fixture = { token: null, throwDecode: false, authCalls: 0, cookieName: null };
globalThis[Symbol.for("vietsage.session-reader-test")] = fixture;
const stub = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === targetUrl) {
      if (specifier === "server-only") return { url: stub(""), shortCircuit: true };
      if (specifier === "react") return { url: stub("export const cache = (fn) => fn;"), shortCircuit: true };
      if (specifier === "next/headers") return { url: stub("export const headers = async () => new Headers();"), shortCircuit: true };
      if (specifier === "next/navigation") return { url: stub("export const redirect = (url) => { throw new Error(url); };"), shortCircuit: true };
      if (specifier === "./auth-secret") return { url: stub("export const resolveAuthSecret = () => 'unit-test-secret';"), shortCircuit: true };
      if (specifier === "@auth/core/jwt") return { url: stub(`
        export async function getToken(options) {
          const fixture = globalThis[Symbol.for("vietsage.session-reader-test")];
          fixture.cookieName = options.cookieName;
          if (fixture.throwDecode) throw new Error("expired or malformed cookie");
          return fixture.token;
        }
      `), shortCircuit: true };
      if (specifier === "@/auth") return { url: stub(`
        export async function auth() {
          globalThis[Symbol.for("vietsage.session-reader-test")].authCalls++;
          return {user: {id: "stale-user"}, canRefresh: true};
        }
      `), shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { readServerSessionTokens } = await import(targetUrl);
const request = () => new Request("https://vietsage.localhost/owner/dashboard", {
  headers: { cookie: "__Secure-authjs.session-token=qa-cookie", "x-forwarded-proto": "https" },
});
const empty = { accessToken: null, refreshToken: null, accessTokenExpiresAt: null, authError: null };

test("missing decoded cookie cannot become a synthetic refresh authority", async () => {
  fixture.token = null;
  assert.deepEqual(await readServerSessionTokens(request()), empty);
  assert.equal(fixture.authCalls, 0);
});

test("expired or malformed cookie fails closed without a fallback session", async () => {
  fixture.throwDecode = true;
  try {
    assert.deepEqual(await readServerSessionTokens(request()), empty);
    assert.equal(fixture.authCalls, 0);
  } finally {
    fixture.throwDecode = false;
  }
});

test("partial cookie preserves missing refresh token instead of inventing one", async () => {
  fixture.token = { accessToken: "qa-access", accessTokenExpiresAt: 1234 };
  const tokens = await readServerSessionTokens(request());
  assert.equal(tokens.refreshToken, null);
  assert.equal(tokens.accessToken, "qa-access");
  assert.equal(fixture.authCalls, 0);
});

test("valid decoded cookie remains authoritative for the explicit request", async () => {
  fixture.token = { accessToken: "qa-access", refreshToken: "qa-refresh", accessTokenExpiresAt: 5678 };
  assert.deepEqual(await readServerSessionTokens(request()), { ...empty, ...fixture.token });
  assert.equal(fixture.cookieName, "__Secure-authjs.session-token");
  fixture.token = null;
  assert.deepEqual(await readServerSessionTokens(request()), empty);
});
