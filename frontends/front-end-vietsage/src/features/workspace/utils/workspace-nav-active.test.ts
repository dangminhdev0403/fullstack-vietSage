import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires explicit TypeScript extension.
import { isNavItemActive, parseSidebarUrl, resolveWorkspaceSubNavigation } from "./workspace-nav-active.ts";
// @ts-expect-error Node's strip-types runner requires explicit TypeScript extension.
import { buildWorkspaceNavigation } from "../config/workspace-registry.ts";
import type { DashboardNavItem } from "../types/workspace-navigation.ts";

const ownerHotelItems: readonly DashboardNavItem[] = [
  { key: "owner.home", href: "/owner/dashboard", label: "Tổng quan", icon: "dashboard" },
  { key: "owner.hotel.billing", href: "/owner/hotels/hotel-1/billing", label: "Tài chính & đối soát", icon: "payments" },
  { key: "owner.hotel.settings", href: "/owner/hotels/hotel-1", label: "Cài đặt khách sạn", icon: "settings" },
];

test("front desk navigation exposes one shared guest entry with BCA capabilities", () => {
  const items = [{ key: "staff.front-desk", href: "/owner/hotels/hotel-1/front-desk", label: "Khách lưu trú", icon: "person" }] as const;
  const nav = resolveWorkspaceSubNavigation(items, { permissions: ["hotel.rooms.view", "hotel.reservations.view", "hotel.kbtt.declarations.view"] });
  assert.deepEqual(nav[0].children?.map((item) => item.tabValue), ["in-house", "arrivals", "groups"]);
  const bcaNav = resolveWorkspaceSubNavigation(items, { permissions: ["hotel.kbtt.declarations.view", "hotel.reservations.view"] });
  assert.ok(bcaNav[0].children?.some((item) => item.tabValue === "in-house"));
  assert.equal(bcaNav[0].children?.some((item) => item.tabValue === "kbtt"), false);
});

test("isNavItemActive highlights exact match for owner dashboard", () => {
  assert.equal(isNavItemActive("/owner/dashboard", "/owner/dashboard", ownerHotelItems), true);
  assert.equal(isNavItemActive("/owner/hotels/hotel-1", "/owner/dashboard", ownerHotelItems), false);
});

test("isNavItemActive keeps owner settings active for nested setup pages", () => {
  assert.equal(isNavItemActive("/owner/hotels/hotel-1", "/owner/hotels/hotel-1/room-management", ownerHotelItems), true);
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
    "owner.hotel.reports",
    "staff.rooms",
    "staff.front-desk",
    "staff.requests",
    "staff.billing",
    "owner.hotel.profile",
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
    "staff.front-desk",
    "staff.requests",
    "staff.messages",
    "staff.billing",
    "staff.reports",
  ]);
});



test("legacy BCA tab bookmark resolves to the unified in-house sidebar", () => {
  assert.equal(parseSidebarUrl("/owner/hotels/hotel-1/front-desk?tab=kbtt").searchParams.get("tab"), "in-house");
  assert.equal(parseSidebarUrl("/hotels/hotel-1/front-desk?tab=arrivals").searchParams.get("tab"), "arrivals");
});
