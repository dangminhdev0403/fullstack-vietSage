import assert from "node:assert/strict";
import test from "node:test";

// prettier-ignore
// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { FRONTDESK_HN2N_CCCD_SCANNER, GUEST_AI_FLOATING_CHAT, hasHotelFeature } from "../../hotel-features/hotel-features.ts";

test("recognizes only present canonical hotel features", () => {
  const enabledFeatures = [GUEST_AI_FLOATING_CHAT, FRONTDESK_HN2N_CCCD_SCANNER];

  assert.equal(hasHotelFeature(enabledFeatures, GUEST_AI_FLOATING_CHAT), true);
  assert.equal(
    hasHotelFeature(enabledFeatures, FRONTDESK_HN2N_CCCD_SCANNER),
    true,
  );
  assert.equal(
    hasHotelFeature([FRONTDESK_HN2N_CCCD_SCANNER], GUEST_AI_FLOATING_CHAT),
    false,
  );
});

test("fails closed when the hotel feature projection is missing or malformed", () => {
  assert.equal(hasHotelFeature([], GUEST_AI_FLOATING_CHAT), false);
  assert.equal(hasHotelFeature(undefined, GUEST_AI_FLOATING_CHAT), false);
  assert.equal(hasHotelFeature(null, GUEST_AI_FLOATING_CHAT), false);
  assert.equal(
    hasHotelFeature(
      "not-an-array" as unknown as string[],
      GUEST_AI_FLOATING_CHAT,
    ),
    false,
  );
});
