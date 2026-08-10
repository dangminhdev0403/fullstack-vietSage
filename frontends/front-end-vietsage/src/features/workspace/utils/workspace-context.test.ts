import assert from "node:assert/strict";
import test from "node:test";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore Node's strip-types runner requires the explicit TypeScript extension.
const workspaceContext = await import("./workspace-context.ts");
const {
  canAccessHotelScope,
  resolveExplicitAccessibleHotel,
  resolveSingleAssignedHotel,
  resolveWorkspacePersona,
} = workspaceContext;
type WorkspaceContext = import("./workspace-context").WorkspaceContext;

const frontDeskContext: WorkspaceContext = {
  activeRole: {
    id: "role-frontdesk",
    code: "HOTEL_FRONTDESK",
    name: "Front Desk",
  },
  permissions: ["hotel.dashboard.view", "hotel.requests.view"],
  accessibleHotels: [
    { id: "hotel-1", tenantId: "tenant-1", code: "H1", name: "Hotel 1" },
    { id: "hotel-2", tenantId: "tenant-1", code: "H2", name: "Hotel 2" },
  ],
};

test("maps established role templates to workspace personas", () => {
  assert.equal(resolveWorkspacePersona("SUPER_ADMIN"), "platform_admin");
  assert.equal(resolveWorkspacePersona("HOTEL_OWNER"), "owner");
  assert.equal(resolveWorkspacePersona("PRINCIPAL"), "principal");
  assert.equal(resolveWorkspacePersona("SCHOOL_PRINCIPAL"), "principal");
  assert.equal(resolveWorkspacePersona("HIEU_TRUONG"), "principal");
  assert.equal(resolveWorkspacePersona("SCHOOL_ADMIN"), "principal");
  assert.equal(resolveWorkspacePersona("HOTEL_MANAGER"), "front_desk");
  assert.equal(resolveWorkspacePersona("HOTEL_HOUSEKEEPING"), "front_desk");
  assert.equal(resolveWorkspacePersona("HOTEL_MAINTENANCE"), "front_desk");
  assert.equal(resolveWorkspacePersona("HOTEL_FNB"), "front_desk");
  assert.equal(resolveWorkspacePersona("HOTEL_FINANCE"), "front_desk");
  assert.equal(resolveWorkspacePersona("HOTEL_FRONTDESK"), "front_desk");
  assert.equal(resolveWorkspacePersona("UNKNOWN_ROLE"), null);
});

test("requires an explicit hotel selection and never infers the first assignment", () => {
  assert.equal(resolveExplicitAccessibleHotel(frontDeskContext, null), null);
  assert.equal(
    resolveExplicitAccessibleHotel(frontDeskContext, "hotel-2")?.id,
    "hotel-2",
  );
  assert.equal(
    resolveExplicitAccessibleHotel(frontDeskContext, "hotel-outside"),
    null,
  );
});

test("resolves a staff hotel only when exactly one active assignment exists", () => {
  assert.equal(resolveSingleAssignedHotel(frontDeskContext), null);
  assert.equal(
    resolveSingleAssignedHotel({
      ...frontDeskContext,
      accessibleHotels: [frontDeskContext.accessibleHotels[0]],
    })?.id,
    "hotel-1",
  );
});

test("combines hotel capability with assigned resource scope", () => {
  assert.equal(canAccessHotelScope(frontDeskContext, "hotel-1"), true);
  assert.equal(canAccessHotelScope(frontDeskContext, "hotel-outside"), false);
  assert.equal(
    canAccessHotelScope(
      { permissions: [], accessibleHotels: frontDeskContext.accessibleHotels },
      "hotel-1",
    ),
    false,
  );
});
