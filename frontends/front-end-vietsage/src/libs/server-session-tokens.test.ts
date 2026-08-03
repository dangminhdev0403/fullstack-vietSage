import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { resolveSessionCookiePolicy } from "./auth-cookie-policy.ts";

test("resolves correct cookie policy with plain headers object", () => {
  const headers = new Headers({
    cookie: "authjs.session-token=test-token",
  });
  const policy = resolveSessionCookiePolicy(headers);
  assert.equal(policy.secureCookie, false);
  assert.equal(policy.cookieName, "authjs.session-token");
});
