import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node strip-types requires explicit extension.
import { LEGACY_LOGIN_PATH, LOGIN_PATH, loginUrl } from "./login-route.ts";

test("uses Vietnamese login route while preserving the legacy path", () => {
  assert.equal(LOGIN_PATH, "/dangnhap");
  assert.equal(LEGACY_LOGIN_PATH, "/login");
  assert.equal(loginUrl("/owner/dashboard"), "/dangnhap?reauth=1&callbackUrl=%2Fowner%2Fdashboard");
});
