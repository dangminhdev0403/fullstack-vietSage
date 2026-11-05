import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { useHousekeepingStore } from "./housekeeping-store.ts";

test("useHousekeepingStore defaults view mode to tasklist and allows setting per hotel", () => {
  const store = useHousekeepingStore.getState();
  assert.equal(store.getViewMode("hotel-test-1"), "tasklist");

  store.setViewMode("hotel-test-1", "grid");
  assert.equal(useHousekeepingStore.getState().getViewMode("hotel-test-1"), "grid");
  assert.equal(useHousekeepingStore.getState().getViewMode("hotel-test-2"), "tasklist");
});

test("useHousekeepingStore manages filtering state per hotel", () => {
  const store = useHousekeepingStore.getState();
  const defaultFilter = store.getFilter("hotel-test-filter");
  assert.equal(defaultFilter.status, "processing");
  assert.equal(defaultFilter.floor, "all");
  assert.equal(defaultFilter.search, "");

  store.setFilter("hotel-test-filter", { status: "processing", floor: "2" });
  const updatedFilter = useHousekeepingStore.getState().getFilter("hotel-test-filter");
  assert.equal(updatedFilter.status, "processing");
  assert.equal(updatedFilter.floor, "2");
  assert.equal(updatedFilter.search, "");

  store.resetFilter("hotel-test-filter");
  const resetFilter = useHousekeepingStore.getState().getFilter("hotel-test-filter");
  assert.equal(resetFilter.status, "processing");
  assert.equal(resetFilter.floor, "all");
});

test("useHousekeepingStore normalizes retired filters while preserving each hotel's saved context", async () => {
  const previousStorage = useHousekeepingStore.persist.getOptions().storage;
  const persistedState = {
    ...useHousekeepingStore.getState(),
    viewModeMap: { "hotel-saved": "grid" as const },
    filterMap: {
      "hotel-saved": { status: "cleaning" as const, floor: "3", search: "301" },
      "hotel-maintenance": { status: "maintenance" as const, floor: "2", search: "" },
      "hotel-all": { status: "all" as const, floor: "all", search: "VIP" },
    },
  };

  useHousekeepingStore.persist.setOptions({
    storage: {
      getItem: () => ({ state: persistedState }),
      setItem: () => {},
      removeItem: () => {},
    },
  });

  try {
    await useHousekeepingStore.persist.rehydrate();
    const store = useHousekeepingStore.getState();
    assert.deepEqual(store.getFilter("hotel-saved"), { status: "processing", floor: "3", search: "301" });
    assert.deepEqual(store.getFilter("hotel-maintenance"), { status: "all", floor: "2", search: "" });
    assert.deepEqual(store.getFilter("hotel-all"), { status: "all", floor: "all", search: "VIP" });
    assert.equal(store.getViewMode("hotel-saved"), "grid");

    store.setFilter("hotel-saved", { status: "available" });
    assert.deepEqual(useHousekeepingStore.getState().getFilter("hotel-saved"), { status: "processing", floor: "3", search: "301" });
  } finally {
    useHousekeepingStore.persist.setOptions({ storage: previousStorage });
  }
});

test("useHousekeepingStore tracks claimed rooms for cleaning shifts", () => {
  const store = useHousekeepingStore.getState();
  assert.equal(store.isRoomClaimed("hotel-claim", "room-101"), false);

  store.claimRoom("hotel-claim", "room-101", {
    staffId: "staff-hk-1",
    staffName: "Nguyễn Văn Dọn",
  });

  assert.equal(useHousekeepingStore.getState().isRoomClaimed("hotel-claim", "room-101"), true);
  const claimedInfo = useHousekeepingStore.getState().getClaimedInfo("hotel-claim", "room-101");
  assert.equal(claimedInfo?.staffId, "staff-hk-1");
  assert.equal(claimedInfo?.staffName, "Nguyễn Văn Dọn");
  assert.ok(claimedInfo?.claimedAt);

  store.unclaimRoom("hotel-claim", "room-101");
  assert.equal(useHousekeepingStore.getState().isRoomClaimed("hotel-claim", "room-101"), false);
});
