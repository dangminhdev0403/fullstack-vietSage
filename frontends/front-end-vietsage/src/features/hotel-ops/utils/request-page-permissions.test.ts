import assert from "node:assert/strict";
import test from "node:test";

import { canLoadRequestServiceCatalog } from "./request-page-permissions";

test("receptionist request queue does not require service catalog permission", () => {
  assert.equal(canLoadRequestServiceCatalog(["hotel.requests.view"]), false);
  assert.equal(
    canLoadRequestServiceCatalog(["hotel.requests.view", "hotel.services.view"]),
    true,
  );
});