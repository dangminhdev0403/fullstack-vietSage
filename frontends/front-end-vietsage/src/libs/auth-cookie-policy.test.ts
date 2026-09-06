import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { resolveSessionCookiePolicy } from "./auth-cookie-policy.ts";

test("uses the secure Auth.js session cookie for forwarded HTTPS requests", () => {
  assert.deepEqual(
    resolveSessionCookiePolicy(
      new Headers({
        host: "vietsage.com",
        "x-forwarded-proto": "https",
      }),
    ),
    {
      secureCookie: true,
      cookieName: "__Secure-authjs.session-token",
    },
  );
});

test("uses the unprefixed Auth.js session cookie for local HTTP requests", () => {
  assert.deepEqual(
    resolveSessionCookiePolicy(
      new Headers({
        host: "localhost:3000",
        "x-forwarded-proto": "http",
      }),
    ),
    {
      secureCookie: false,
      cookieName: "authjs.session-token",
    },
  );
});

test("prefers the actual secure cookie when proxy protocol headers are absent", () => {
  assert.deepEqual(
    resolveSessionCookiePolicy(
      new Headers({
        host: "vietsage.com",
        cookie: "__Secure-authjs.session-token.0=chunk-a; __Secure-authjs.session-token.1=chunk-b",
      }),
    ),
    {
      secureCookie: true,
      cookieName: "__Secure-authjs.session-token",
    },
  );
});

test("does not let an untrusted forwarded host force secure-cookie mode", () => {
  assert.deepEqual(
    resolveSessionCookiePolicy(
      new Headers({
        host: "localhost:3000",
        "x-forwarded-host": "vietsage.com",
        "x-forwarded-proto": "http",
      }),
    ),
    {
      secureCookie: false,
      cookieName: "authjs.session-token",
    },
  );
});

test("prefers the non-secure cookie when AUTH_URL is HTTP but DevTunnel forwards as HTTPS", () => {
  // DevTunnel sets x-forwarded-proto: https, but AUTH_URL=http://...
  // makes Auth.js set authjs.session-token (non-secure).
  // resolveSessionCookiePolicy must use the cookie that actually exists.
  assert.deepEqual(
    resolveSessionCookiePolicy(
      new Headers({
        host: "t62jk3dx-3000.asse.devtunnels.ms",
        "x-forwarded-proto": "https",
        cookie: "authjs.session-token=eyJhbGciOi...",
      }),
    ),
    {
      secureCookie: false,
      cookieName: "authjs.session-token",
    },
  );
});
