import assert from "node:assert/strict";
import test from "node:test";
import { useChannelManagerUIStore } from "./channel-manager-ui-store";

test("useChannelManagerUIStore manages active tab per hotel", () => {
  const store = useChannelManagerUIStore.getState();
  assert.equal(store.getActiveTab("hotel-1"), undefined);

  store.setActiveTab("hotel-1", "BOOKINGS");
  assert.equal(useChannelManagerUIStore.getState().getActiveTab("hotel-1"), "BOOKINGS");

  store.setActiveTab("hotel-2", "ARI");
  assert.equal(useChannelManagerUIStore.getState().getActiveTab("hotel-2"), "ARI");
  assert.equal(useChannelManagerUIStore.getState().getActiveTab("hotel-1"), "BOOKINGS");
});
