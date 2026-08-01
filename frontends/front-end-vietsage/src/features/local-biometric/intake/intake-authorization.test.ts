import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node strip-types requires the explicit extension.
import { resolveIntakeAuthorizationMode } from "./intake-authorization.ts";

test("tenant owner uses owner backend authorization even when accessibleHotels is empty", () => {
  assert.equal(resolveIntakeAuthorizationMode("TENANT_OWNER"), "owner-backend");
});

test("hotel operator uses workspace hotel scope", () => {
  assert.equal(resolveIntakeAuthorizationMode("FRONT_DESK"), "hotel-workspace");
});
