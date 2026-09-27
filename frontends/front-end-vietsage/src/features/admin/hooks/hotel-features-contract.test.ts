import assert from "node:assert/strict";
import test from "node:test";

// prettier-ignore
// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { MANAGE_HOTEL_FEATURES_PERMISSION, canManageHotelFeatures } from "../types/admin-contract.ts";

test("hotel feature controls require the dedicated active-role capability", () => {
  assert.equal(
    MANAGE_HOTEL_FEATURES_PERMISSION,
    "platform.hotel-features.manage",
  );
  assert.equal(
    canManageHotelFeatures([MANAGE_HOTEL_FEATURES_PERMISSION]),
    true,
  );
  assert.equal(canManageHotelFeatures(["platform.hotels.manage"]), false);
  assert.equal(canManageHotelFeatures([]), false);
  assert.equal(canManageHotelFeatures(null), false);
});
