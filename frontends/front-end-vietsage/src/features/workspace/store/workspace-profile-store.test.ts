import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires explicit TypeScript extension.
import { initialWorkspaceProfile, useWorkspaceProfileStore } from "./workspace-profile-store.ts";

test("useWorkspaceProfileStore manages profile, accessibleHotels, permissions and resets", () => {
  useWorkspaceProfileStore.getState().resetProfile();
  assert.deepEqual(useWorkspaceProfileStore.getState(), {
    ...initialWorkspaceProfile,
    setProfile: useWorkspaceProfileStore.getState().setProfile,
    resetProfile: useWorkspaceProfileStore.getState().resetProfile,
  });

  useWorkspaceProfileStore.getState().setProfile({
    profileName: "Nguyen Van A",
    roleName: "Hotel Owner",
    hotelName: "Grand Saigon",
    accessibleHotels: [
      { id: "hotel-1", name: "Grand Saigon", enabledFeatures: ["pms", "pos"] },
    ],
    permissions: ["hotels.view", "billing.view"],
  });

  const state = useWorkspaceProfileStore.getState();
  assert.equal(state.profileName, "Nguyen Van A");
  assert.equal(state.roleName, "Hotel Owner");
  assert.equal(state.hotelName, "Grand Saigon");
  assert.equal(state.accessibleHotels?.length, 1);
  assert.equal(state.accessibleHotels?.[0]?.name, "Grand Saigon");
  assert.deepEqual(state.permissions, ["hotels.view", "billing.view"]);

  useWorkspaceProfileStore.getState().resetProfile();
  assert.equal(useWorkspaceProfileStore.getState().profileName, null);
  assert.deepEqual(useWorkspaceProfileStore.getState().permissions, []);
});
