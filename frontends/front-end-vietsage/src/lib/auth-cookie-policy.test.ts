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
