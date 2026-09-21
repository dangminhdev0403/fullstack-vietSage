import assert from "node:assert/strict";
import test from "node:test";

// prettier-ignore
// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { buildWorkspaceNavigation, createWorkspaceRegistry, getWorkspaceDashboardWidgets, getWorkspaceDefinition, resolveWorkspacePersona } from "./workspace-registry.ts";

test("keeps platform navigation capability-driven", () => {
  const navigation = buildWorkspaceNavigation({
    persona: "platform_admin",
    permissions: ["platform.hotels.view"],
  });

  assert.deepEqual(
    navigation.map((item) => item.href),
    ["/admin/dashboard", "/admin/hotels"],
  );
});

test("configures dedicated platform finance workspace and navigation", () => {
  assert.equal(
    getWorkspaceDefinition("platform_finance").homePath,
    "/finance/billing",
  );
  assert.equal(resolveWorkspacePersona("PLATFORM_FINANCE"), "platform_finance");

  const navigation = buildWorkspaceNavigation({
    persona: "platform_finance",
    permissions: ["platform.billing.view", "platform.hotels.view"],
  });

  assert.deepEqual(
    navigation.map((item) => ({ key: item.key, href: item.href })),
    [{ key: "finance.billing", href: "/finance/billing" }],
  );
});

test("provides service navigation only to configured staff personas", () => {
  const permissions = ["hotel.requests.view", "hotel.services.manage"];
  const manager = buildWorkspaceNavigation({
    persona: "manager",
    permissions,
    hotelId: "hotel-1",
  });
  const frontDesk = buildWorkspaceNavigation({
    persona: "front_desk",
    permissions,
    hotelId: "hotel-1",
  });
  const frontDeskWithoutServices = buildWorkspaceNavigation({
    persona: "front_desk",
    permissions: ["hotel.requests.view"],
    hotelId: "hotel-1",
  });

  assert.equal(getWorkspaceDefinition("manager").homePath, "/staff");
  assert.equal(getWorkspaceDefinition("front_desk").homePath, "/staff");
  assert.equal(
    manager.some((item) => item.key === "staff.home"),
    false,
  );
  assert.equal(
    manager.some((item) => item.href.endsWith("/services")),
    true,
  );
  assert.equal(
    frontDesk.some((item) => item.href.endsWith("/services")),
    false,
  );
  assert.equal(
    frontDeskWithoutServices.some((item) => item.href.endsWith("/services")),
    false,
  );
});

test("builds owner sidebar with operational modules and hotel settings", () => {
  const navigation = buildWorkspaceNavigation({
    persona: "owner",
    permissions: [
      "hotel.dashboard.view",
      "hotel.billing.view",
      "hotel.profile.view",
      "hotel.rooms.manage",
      "hotel.staff.manage",
      "hotel.services.manage",
      "hotel.kbtt.manage",
    ],
    hotelId: "hotel-1",
  });

  assert.deepEqual(
    navigation.map(({ key, href, label }) => ({ key, href, label })),
    [
      { key: "owner.home", href: "/owner/dashboard", label: "Tổng quan" },
      {
        key: "owner.hotel.billing",
        href: "/owner/hotels/hotel-1/billing",
        label: "Tài chính & đối soát",
      },
      {
        key: "owner.hotel.rooms",
        href: "/owner/hotels/hotel-1/rooms",
        label: "Phòng & QR",
      },
      {
        key: "owner.hotel.services",
        href: "/owner/hotels/hotel-1/services",
        label: "Danh mục dịch vụ",
      },
      {
        key: "owner.hotel.staff",
        href: "/owner/hotels/hotel-1/staff",
        label: "Nhân viên",
      },
      {
        key: "owner.hotel.partners",
        href: "/owner/hotels/hotel-1/partners",
        label: "Kết nối đối tác",
      },
      {
        key: "owner.hotel.kbtt",
        href: "/owner/hotels/hotel-1/kbtt",
        label: "Kết nối Bộ Công an",
      },
      {
        key: "owner.hotel.settings",
        href: "/owner/hotels/hotel-1",
        label: "Cài đặt khách sạn",
      },
    ],
  );
});

test("keeps receptionist room and biometric tools available", () => {
  const navigation = buildWorkspaceNavigation({
    persona: "front_desk",
    permissions: ["hotel.stays.manage", "hotel.rooms.view"],
    hotelId: "hotel-1",
  });

  assert.equal(
    navigation.some((item) => item.key === "staff.rooms"),
    true,
  );
  assert.equal(
    navigation.some(
      (item) =>
        item.key === "staff.biometric" &&
        item.href === "/hotels/hotel-1/biometric",
    ),
    true,
  );
});

test("filters dashboard widgets by persona, capability, and explicit hotel scope", () => {
  const withoutHotel = getWorkspaceDashboardWidgets({
    persona: "manager",
    permissions: ["hotel.requests.view", "hotel.services.view"],
  });
  const withHotel = getWorkspaceDashboardWidgets({
    persona: "manager",
    permissions: ["hotel.requests.view", "hotel.services.view"],
    hotelId: "hotel-1",
  });

  assert.deepEqual(withoutHotel, []);
  assert.deepEqual(
    withHotel.map((widget) => widget.key),
    [
      "requests.active",
      "requests.new",
      "services.categories",
      "services.items",
      "requests.feed",
    ],
  );
});

test("adds role aliases, navigation, and widgets through an immutable extension", () => {
  const registry = createWorkspaceRegistry([
    {
      roleAliases: { HOTEL_AUDITOR: "manager" },
      navigation: [
        {
          key: "manager.audit",
          personas: ["manager"],
          href: "/staff/operations",
          label: "Đối soát",
          icon: "fact_check",
          order: 90,
          anyCapabilities: ["hotel.billing.view"],
        },
      ],
      widgets: [
        {
          key: "manager.audit-summary",
          personas: ["manager"],
          title: "Đối soát tài chính",
          description: "Theo dõi dữ liệu đối soát trong phạm vi khách sạn.",
          icon: "fact_check",
          order: 90,
          size: "wide",
          anyCapabilities: ["hotel.billing.view"],
        },
      ],
    },
  ]);

  assert.equal(resolveWorkspacePersona("hotel_auditor", registry), "manager");
  assert.equal(
    buildWorkspaceNavigation({
      persona: "manager",
      permissions: ["hotel.billing.view"],
      registry,
    }).some((item) => item.key === "manager.audit"),
    true,
  );
  assert.equal(
    getWorkspaceDashboardWidgets({
      persona: "manager",
      permissions: ["hotel.billing.view"],
      registry,
    }).some((widget) => widget.key === "manager.audit-summary"),
    true,
  );
});

test("rejects accidental registry key overrides unless explicitly requested", () => {
  assert.throws(
    () =>
      createWorkspaceRegistry([
        {
          widgets: [
            {
              key: "platform.hotels",
              personas: ["platform_admin"],
              title: "Duplicate",
              description: "Duplicate",
              icon: "error",
              order: 1,
              size: "compact",
            },
          ],
        },
      ]),
    /already exists/,
  );
});
