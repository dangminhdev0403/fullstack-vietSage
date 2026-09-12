import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires explicit TypeScript extension.
import { isNavItemActive } from "./workspace-nav-active.ts";
// @ts-expect-error Node's strip-types runner requires explicit TypeScript extension.
import { buildWorkspaceNavigation } from "../config/workspace-registry.ts";
import type { DashboardNavItem } from "../types/workspace-navigation.ts";

const ownerHotelItems: readonly DashboardNavItem[] = [
  { key: "owner.home", href: "/owner/dashboard", label: "Tổng quan", icon: "dashboard" },
  { key: "owner.hotels", href: "/owner/hotels", label: "Khách sạn", icon: "hotel" },
  { key: "owner.staff", href: "/owner/staff", label: "Nhân viên", icon: "group" },
  { key: "owner.hotel.overview", href: "/owner/hotels/hotel-1", label: "Thông tin khách sạn", icon: "hotel" },
  { key: "owner.hotel.rooms", href: "/owner/hotels/hotel-1/rooms", label: "Phòng & lưu trú", icon: "bed" },
  { key: "owner.hotel.billing", href: "/owner/hotels/hotel-1/billing", label: "Thanh toán", icon: "inventory_2" },
];

test("isNavItemActive highlights exact match for owner dashboard", () => {
  assert.equal(isNavItemActive("/owner/dashboard", "/owner/dashboard", ownerHotelItems), true);
  assert.equal(isNavItemActive("/owner/hotels", "/owner/dashboard", ownerHotelItems), false);
});

test("isNavItemActive highlights owner hotel rooms subpage correctly", () => {
  assert.equal(isNavItemActive("/owner/hotels/hotel-1/rooms", "/owner/hotels/hotel-1/rooms", ownerHotelItems), true);
  assert.equal(isNavItemActive("/owner/hotels/hotel-1", "/owner/hotels/hotel-1/rooms", ownerHotelItems), false);
});

test("isNavItemActive highlights owner hotel billing invoices sub-route correctly", () => {
  const invoiceDetailPath = "/owner/hotels/hotel-1/billing/invoices/inv-001";
  assert.equal(isNavItemActive("/owner/hotels/hotel-1/billing", invoiceDetailPath, ownerHotelItems), true);
  assert.equal(isNavItemActive("/owner/hotels/hotel-1", invoiceDetailPath, ownerHotelItems), false);
});

test("isNavItemActive highlights staff navigation with search params correctly", () => {
  const staffPath = "/owner/staff?hotelId=hotel-1";
  assert.equal(isNavItemActive("/owner/staff", staffPath, ownerHotelItems), true);
});

test("isNavItemActive highlights admin roles and permissions navigation item correctly", () => {
  const adminItems = buildWorkspaceNavigation({
    persona: "platform_admin",
    permissions: ["platform.roles.view"],
  });
  const accessItem = adminItems.find((item) => item.label === "Vai trò & quyền");
  assert.ok(accessItem);
  assert.equal(accessItem.href, "/admin/permissions");
  assert.equal(isNavItemActive(accessItem.href, "/admin/permissions", adminItems), true);
  assert.equal(isNavItemActive(accessItem.href, "/admin/users", adminItems), false);
});
