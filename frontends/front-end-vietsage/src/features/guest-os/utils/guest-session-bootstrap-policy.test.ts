import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { decideGuestSessionValidationError, isCurrentGuestSessionValidation, isProtectedGuestRoute } from "./guest-session-bootstrap-policy.ts";

test("protects only the four exact GuestOS session routes", () => {
  for (const pathname of ["/g/home", "/g/language", "/g/services", "/g/requests"]) {
    assert.equal(isProtectedGuestRoute(pathname), true);
  }
  for (const pathname of ["/g/QR-123", "/g", "/g/services/extra", "/g/home/"]) {
    assert.equal(isProtectedGuestRoute(pathname), false);
  }
});

test("logs out only for invalid or closed session statuses", () => {
  for (const status of [401, 403, 410]) assert.equal(decideGuestSessionValidationError(status), "logout");
  for (const status of [0, 408, 500, 503]) assert.equal(decideGuestSessionValidationError(status), "retry");
});

test("ignores validation results for a token that is no longer current", () => {
  assert.equal(isCurrentGuestSessionValidation("token-a", "token-a"), true);
  assert.equal(isCurrentGuestSessionValidation("token-a", "token-b"), false);
  assert.equal(isCurrentGuestSessionValidation("token-a", null), false);
});
