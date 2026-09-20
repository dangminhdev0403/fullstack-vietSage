import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires explicit TypeScript extension.
import { isNavItemActive } from "./workspace-nav-active.ts";
// @ts-expect-error Node's strip-types runner requires explicit TypeScript extension.
import { buildWorkspaceNavigation } from "../config/workspace-registry.ts";
import type { DashboardNavItem } from "../types/workspace-navigation.ts";

const ownerHotelItems: readonly DashboardNavItem[] = [
  { key: "owner.home", href: "/owner/dashboard", label: "Tổng quan", icon: "dashboard" },
  { key: "owner.hotel.billing", href: "/owner/hotels/hotel-1/billing", label: "Tài chính & đối soát", icon: "payments" },
  { key: "owner.hotel.settings", href: "/owner/hotels/hotel-1", label: "Cài đặt khách sạn", icon: "settings" },
];

test("isNavItemActive highlights exact match for owner dashboard", () => {
  assert.equal(isNavItemActive("/owner/dashboard", "/owner/dashboard", ownerHotelItems), true);
  assert.equal(isNavItemActive("/owner/hotels/hotel-1", "/owner/dashboard", ownerHotelItems), false);
});

test("isNavItemActive keeps owner settings active for nested setup pages", () => {
  assert.equal(isNavItemActive("/owner/hotels/hotel-1", "/owner/hotels/hotel-1/rooms", ownerHotelItems), true);
});

test("isNavItemActive highlights owner billing invoices without selecting settings", () => {
  const invoiceDetailPath = "/owner/hotels/hotel-1/billing/invoices/inv-001";
  assert.equal(isNavItemActive("/owner/hotels/hotel-1/billing", invoiceDetailPath, ownerHotelItems), true);
  assert.equal(isNavItemActive("/owner/hotels/hotel-1", invoiceDetailPath, ownerHotelItems), false);
});

test("isNavItemActive highlights admin roles and permissions navigation item correctly", () => {
  const adminItems = buildWorkspaceNavigation({
    persona: "platform_admin",
    permissions: ["platform.roles.view"],
  });
  const accessItem = adminItems.find((item) => item.label === "Vai trò & Quyền");
  assert.ok(accessItem);
  assert.equal(accessItem.href, "/admin/permissions");
  assert.equal(isNavItemActive(accessItem.href, "/admin/permissions", adminItems), true);
  assert.equal(isNavItemActive(accessItem.href, "/admin/users", adminItems), false);
});

test("buildWorkspaceNavigation produces complete owner navigation structure", () => {
  const ownerItems = buildWorkspaceNavigation({
    persona: "owner",
    permissions: [
      "hotel.dashboard.view",
      "hotel.profile.view",
      "hotel.staff.view",
      "hotel.services.view",
      "hotel.local-partners.view",
      "hotel.rooms.view",
      "hotel.requests.view",
      "hotel.billing.view",
    ],
    hotelId: "hotel-1",
  });
  assert.deepEqual(ownerItems.map((item) => item.key), [
    "owner.home",
    "owner.hotel.billing",
    "owner.hotel.rooms",
    "owner.hotel.services",
    "owner.hotel.staff",
    "owner.hotel.partners",
    "owner.hotel.kbtt",
    "owner.hotel.settings",
  ]);
});

test("buildWorkspaceNavigation produces shift, rooms, requests, messages, checkout, tools for frontdesk", () => {
  const frontdeskItems = buildWorkspaceNavigation({
    persona: "front_desk",
    permissions: [
      "hotel.dashboard.view",
      "hotel.rooms.view",
      "hotel.rooms.status.manage",
      "hotel.stays.check-in",
      "hotel.requests.execute",
      "hotel.messages.view",
      "hotel.billing.checkout",
    ],
    hotelId: "hotel-1",
  });
  assert.deepEqual(frontdeskItems.map((item) => item.key), [
    "staff.dashboard",
    "staff.rooms",
    "staff.requests",
    "staff.messages",
    "staff.billing",
    "staff.biometric",
  ]);
});
