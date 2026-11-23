import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires explicit TypeScript extension.
import { isNavItemActive, isSubNavItemActive, parseSidebarUrl, resolveWorkspaceSubNavigation } from "./workspace-nav-active.ts";
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

test("owner.hotel.billing resolves to 2 consolidated sub-nav items and highlights multi-tab deep links", () => {
  const billingHref = "/owner/hotels/hotel-1/billing" as const;
  const [billingItem] = resolveWorkspaceSubNavigation([
    {
      key: "owner.hotel.billing",
      href: billingHref,
      label: "Tài chính & đối soát",
      icon: "payments",
    },
  ]);

  const children = billingItem.children ?? [];
  assert.deepEqual(
    children.map((item) => ({
      label: item.label,
      tabValue: item.tabValue,
      matchTabValues: item.matchTabValues,
      icon: item.icon,
    })),
    [
      {
        label: "Hóa đơn & Công nợ",
        tabValue: "folios",
        matchTabValues: ["folios", "receivables"],
        icon: "receipt_long",
      },
      {
        label: "Chi phí & Phí SaaS",
        tabValue: "expenses",
        matchTabValues: ["expenses", "saas"],
        icon: "payments",
      },
    ],
  );

  const [foliosGroup, expensesGroup] = children;

  // Default (no ?tab) and unknown tab fall back to Hóa đơn & Công nợ
  for (const activePath of [billingHref, `${billingHref}?tab=folios`, `${billingHref}?tab=receivables`, `${billingHref}?tab=unknown`]) {
    assert.equal(isSubNavItemActive(foliosGroup, billingHref, activePath, children), true, `Expected foliosGroup active for ${activePath}`);
    assert.equal(isSubNavItemActive(expensesGroup, billingHref, activePath, children), false, `Expected expensesGroup inactive for ${activePath}`);
  }

  // ?tab=expenses and ?tab=saas highlight Chi phí & Phí SaaS exclusively
  for (const activePath of [`${billingHref}?tab=expenses`, `${billingHref}?tab=saas`, `${billingHref}?tab=SAAS`]) {
    assert.equal(isSubNavItemActive(expensesGroup, billingHref, activePath, children), true, `Expected expensesGroup active for ${activePath}`);
    assert.equal(isSubNavItemActive(foliosGroup, billingHref, activePath, children), false, `Expected foliosGroup inactive for ${activePath}`);
  }
});

test("owner.hotel.reports and staff.reports resolve to 4 consolidated sub-nav items with multi-tab active matching", () => {
  const reportEntries: readonly DashboardNavItem[] = [
    {
      key: "owner.hotel.reports",
      href: "/owner/hotels/hotel-1/reports",
      label: "Báo cáo & Phân tích",
      icon: "analytics",
    },
    {
      key: "staff.reports",
      href: "/hotels/hotel-1/reports",
      label: "Báo cáo & Phân tích",
      icon: "analytics",
    },
  ];

  const resolved = resolveWorkspaceSubNavigation(reportEntries);

  for (const reportItem of resolved) {
    const children = reportItem.children ?? [];
    assert.deepEqual(
      children.map((item) => ({
        label: item.label,
        tabValue: item.tabValue,
        matchTabValues: item.matchTabValues,
        icon: item.icon,
      })),
      [
        {
          label: "Tổng quan & KPIs",
          tabValue: "overview",
          matchTabValues: undefined,
          icon: "dashboard",
        },
        {
          label: "Kết quả KD & Lãi lỗ",
          tabValue: "pnl",
          matchTabValues: undefined,
          icon: "account_balance",
        },
        {
          label: "Sổ doanh thu",
          tabValue: "book",
          matchTabValues: ["book", "daily", "monthly", "staff"],
          icon: "receipt_long",
        },
        {
          label: "Kênh & Thị trường",
          tabValue: "sources",
          matchTabValues: ["sources", "demographics"],
          icon: "hub",
        },
      ],
    );

    const activeLabelsFor = (path: string) =>
      children
        .filter((child) => isSubNavItemActive(child, reportItem.href, path, children))
        .map((child) => child.label);

    assert.deepEqual(activeLabelsFor(reportItem.href), ["Tổng quan & KPIs"]);
    assert.deepEqual(activeLabelsFor(`${reportItem.href}?tab=overview`), ["Tổng quan & KPIs"]);
    assert.deepEqual(activeLabelsFor(`${reportItem.href}?tab=pnl`), ["Kết quả KD & Lãi lỗ"]);

    for (const tab of ["book", "daily", "monthly", "staff"]) {
      assert.deepEqual(
        activeLabelsFor(`${reportItem.href}?tab=${tab}`),
        ["Sổ doanh thu"],
        `Expected Sổ doanh thu for ${reportItem.key}?tab=${tab}`,
      );
    }

    for (const tab of ["sources", "demographics"]) {
      assert.deepEqual(
        activeLabelsFor(`${reportItem.href}?tab=${tab}`),
        ["Kênh & Thị trường"],
        `Expected Kênh & Thị trường for ${reportItem.key}?tab=${tab}`,
      );
    }
  }
});
