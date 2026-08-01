import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { ownerAttentionRoute } from "./owner-attention-route.ts";

const hotelId = "hotel 1";

test("maps a generic request detail route into the owner request modal", () => {
  assert.equal(
    ownerAttentionRoute(`/hotels/${hotelId}/requests/request/2`, hotelId),
    "/owner/hotels/hotel%201/requests?requestId=request%2F2",
  );
});

test("maps generic hotel routes into the owner workspace", () => {
  assert.equal(
    ownerAttentionRoute(`/hotels/${hotelId}/rooms`, hotelId),
    "/owner/hotels/hotel%201/rooms",
  );
  assert.equal(
    ownerAttentionRoute(`/hotels/${hotelId}/billing`, hotelId),
    "/owner/hotels/hotel%201/billing",
  );
});

test("keeps unrelated safe routes unchanged", () => {
  assert.equal(ownerAttentionRoute("/owner/staff", hotelId), "/owner/staff");
});
