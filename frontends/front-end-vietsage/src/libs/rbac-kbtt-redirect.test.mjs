import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node strip-types requires the explicit TypeScript extension.
import { resolveTenantOwnerKbttEquivalent } from "../features/auth/utils/cross-workspace-equivalent.ts";

test("staff-KBTT URL resolves to the equivalent owner KBTT page", () => {
  assert.equal(
    resolveTenantOwnerKbttEquivalent("/hotels/hotel-1/kbtt?from=sidebar"),
    "/owner/hotels/hotel-1/kbtt?from=sidebar",
  );
  assert.equal(resolveTenantOwnerKbttEquivalent("/hotels/hotel-1/rooms"), null);
});
