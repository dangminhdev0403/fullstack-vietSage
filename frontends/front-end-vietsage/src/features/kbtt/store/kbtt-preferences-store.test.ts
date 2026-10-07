import assert from "node:assert/strict";
import test from "node:test";
import { useKbttPreferencesStore } from "./kbtt-preferences-store";

test("useKbttPreferencesStore manages pageSize and rejects invalid values", () => {
  const store = useKbttPreferencesStore.getState();
  assert.equal(store.pageSize, 20);

  store.setPageSize(50);
  assert.equal(useKbttPreferencesStore.getState().pageSize, 50);

  store.setPageSize(999); // invalid size -> fallback to default 20
  assert.equal(useKbttPreferencesStore.getState().pageSize, 20);
});
