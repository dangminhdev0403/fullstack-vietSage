import { describe, it } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node strip-types runner requires explicit extension
import { resolveChannelManagerAccess } from "./channel-manager-access.ts";

describe("resolveChannelManagerAccess", () => {
  it("grants bookings but denies inventory and channel configuration for HOTEL_FRONTDESK-like permissions", () => {
    const frontdeskPermissions = [
      "hotel.dashboard.view",
      "hotel.rooms.view",
      "hotel.rooms.status.manage",
      "hotel.stays.view",
      "hotel.stays.manage",
      "hotel.stays.check-in",
      "hotel.stays.check-out",
      "hotel.reservations.view",
      "hotel.reservations.manage",
      "hotel.requests.view",
      "hotel.requests.manage",
      "hotel.requests.execute",
      "hotel.billing.checkout",
      "hotel.kbtt.declarations.view",
      "hotel.kbtt.declarations.manage",
    ] as const;

    const access = resolveChannelManagerAccess(frontdeskPermissions);

    // Bookings yes
    assert.equal(access.canViewBookings, true);
    // Inventory and channel configuration NO
    assert.equal(access.canManageInventory, false);
    assert.equal(access.canViewChannels, false);
    assert.equal(access.canManageChannels, false);
    // Front desk receives only BOOKINGS tab
    assert.deepEqual(access.visibleTabs, ["BOOKINGS"]);
  });

  it("resolves owner read-only capabilities with zero mutation affordances", () => {
    const ownerReadOnlyPermissions = [
      "hotel.reservations.view",
      "hotel.rooms.view",
      "hotel.channels.view",
      "hotel.profile.view",
    ] as const;

    const access = resolveChannelManagerAccess(ownerReadOnlyPermissions);

    assert.equal(access.canViewBookings, true);
    assert.equal(access.canViewInventory, true);
    assert.equal(access.canViewChannels, true);
    // Read-only has no management rights
    assert.equal(access.canManageInventory, false);
    assert.equal(access.canManageChannels, false);
    // Authorized tabs for read-only owner
    assert.deepEqual(access.visibleTabs, ["BOOKINGS", "ARI", "CHANNELS"]);
  });

  it("resolves owner manage capabilities with full mutation affordances", () => {
    const ownerManagePermissions = [
      "hotel.reservations.view",
      "hotel.reservations.manage",
      "hotel.rooms.view",
      "hotel.rooms.manage",
      "hotel.channels.view",
      "hotel.channels.manage",
      "hotel.profile.view",
      "hotel.profile.manage",
    ] as const;

    const access = resolveChannelManagerAccess(ownerManagePermissions);

    assert.equal(access.canViewBookings, true);
    assert.equal(access.canViewInventory, true);
    assert.equal(access.canManageInventory, true);
    assert.equal(access.canViewChannels, true);
    assert.equal(access.canManageChannels, true);
    assert.deepEqual(access.visibleTabs, ["BOOKINGS", "ARI", "CHANNELS"]);
  });

  it("fails closed on empty permissions", () => {
    const access = resolveChannelManagerAccess([]);

    assert.equal(access.canViewBookings, false);
    assert.equal(access.canViewInventory, false);
    assert.equal(access.canManageInventory, false);
    assert.equal(access.canViewChannels, false);
    assert.equal(access.canManageChannels, false);
    assert.deepEqual(access.visibleTabs, []);
  });

  it("does not unlock Channel Manager actions from unrelated hotel permissions", () => {
    const unrelatedPermissions = [
      "hotel.kbtt.view",
      "hotel.kbtt.manage",
      "hotel.services.view",
      "hotel.services.manage",
      "hotel.staff.view",
      "hotel.staff.manage",
      "hotel.local-partners.view",
      "hotel.billing.view",
    ] as const;

    const access = resolveChannelManagerAccess(unrelatedPermissions);

    assert.equal(access.canViewBookings, false);
    assert.equal(access.canViewInventory, false);
    assert.equal(access.canManageInventory, false);
    assert.equal(access.canViewChannels, false);
    assert.equal(access.canManageChannels, false);
    assert.deepEqual(access.visibleTabs, []);
  });

  it("handles platform permissions only where an admin surface consumes it", () => {
    const platformAdminPermissions = [
      "platform.hotels.view",
      "platform.hotels.manage",
    ] as const;

    // In hotel/owner surface (default, allowPlatformAdmin=false), platform keys are not consumed
    const defaultSurfaceAccess = resolveChannelManagerAccess(platformAdminPermissions);
    assert.equal(defaultSurfaceAccess.canViewBookings, false);
    assert.equal(defaultSurfaceAccess.canManageChannels, false);
    assert.deepEqual(defaultSurfaceAccess.visibleTabs, []);

    // In admin surface (allowPlatformAdmin=true), platform keys unlock access
    const adminSurfaceAccess = resolveChannelManagerAccess(platformAdminPermissions, {
      allowPlatformAdmin: true,
    });
    assert.equal(adminSurfaceAccess.canViewBookings, true);
    assert.equal(adminSurfaceAccess.canViewInventory, true);
    assert.equal(adminSurfaceAccess.canManageInventory, true);
    assert.equal(adminSurfaceAccess.canViewChannels, true);
    assert.equal(adminSurfaceAccess.canManageChannels, true);
    assert.deepEqual(adminSurfaceAccess.visibleTabs, ["BOOKINGS", "ARI", "CHANNELS"]);
  });
});
