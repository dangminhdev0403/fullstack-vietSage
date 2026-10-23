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
    [
      { key: "finance.billing", href: "/finance/billing" },
      { key: "finance.finalize", href: "/finance/finalize" },
      { key: "finance.contracts", href: "/finance/contracts" },
    ],
  );
});

test("configures dedicated localmate manager workspace and navigation", () => {
  assert.equal(
    resolveWorkspacePersona("LOCALMATE_MANAGER"),
    "localmate_manager",
  );
  assert.equal(
    resolveWorkspacePersona("LOCALMATE"),
    "localmate_manager",
  );
  assert.equal(
    resolveWorkspacePersona("LOCAL_MATE"),
    "localmate_manager",
  );
  assert.equal(
    resolveWorkspacePersona("LOCALMATE_GUIDE"),
    "localmate_manager",
  );
  assert.equal(
    resolveWorkspacePersona("LOCALMATE_COORDINATOR"),
    "localmate_manager",
  );
  assert.equal(
    resolveWorkspacePersona("ANY_FUTURE_LOCALMATE_ROLE"),
    "localmate_manager",
  );
  assert.equal(
    getWorkspaceDefinition("localmate_manager").homePath,
    "/localmate/guides",
  );

  const navigation = buildWorkspaceNavigation({
    persona: "localmate_manager",
    permissions: ["platform.localmate.view", "platform.localmate.manage"],
  });

  assert.deepEqual(
    navigation.map((item) => ({ key: item.key, href: item.href, label: item.label })),
    [
      {
        key: "localmate.guides",
        href: "/localmate/guides",
        label: "Hướng dẫn viên",
      },
      {
        key: "localmate.knowledge",
        href: "/localmate/knowledge",
        label: "Kho tri thức Tour AI",
      },
    ],
  );

  // Ensure super_admin / platform_admin does not have localmate items in navigation
  const platformAdminNav = buildWorkspaceNavigation({
    persona: "platform_admin",
    permissions: [
      "platform.hotels.view",
      "platform.hotels.manage",
      "platform.localmate.view",
      "platform.localmate.manage",
    ],
  });
  const adminNavKeys = platformAdminNav.map((item) => item.key);
  assert.equal(adminNavKeys.includes("localmate.guides"), false);
  assert.equal(adminNavKeys.includes("localmate.knowledge"), false);
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
    enabledFeatures: ["hotel.channel_manager"],
  });

  assert.deepEqual(
    navigation.map(({ key, href, label }) => ({ key, href, label })),
    [
      { key: "owner.home", href: "/owner/dashboard", label: "Tổng quan" },
      {
        key: "staff.dashboard",
        href: "/owner/hotels/hotel-1/dashboard",
        label: "Điều hành hôm nay",
      },
      {
        key: "owner.hotel.billing",
        href: "/owner/hotels/hotel-1/billing",
        label: "Tài chính & đối soát",
      },
      {
        key: "owner.hotel.reports",
        href: "/owner/hotels/hotel-1/reports",
        label: "Báo cáo & Phân tích",
      },
      {
        key: "staff.rooms",
        href: "/owner/hotels/hotel-1/rooms",
        label: "Sơ đồ phòng & Check In",
      },
      {
        key: "staff.front-desk",
        href: "/owner/hotels/hotel-1/front-desk",
        label: "Quản lý khách lưu trú",
      },
      {
        key: "owner.hotel.channel-manager",
        href: "/owner/hotels/hotel-1/channel-manager",
        label: "Kho Phòng & Kênh Bán",
      },
      {
        key: "staff.kbtt",
        href: "/owner/hotels/hotel-1/kbtt",
        label: "Khai báo tạm trú",
      },
      {
        key: "owner.hotel.profile",
        href: "/owner/hotels/hotel-1/profile",
        label: "Thông tin khách sạn",
      },
      {
        key: "owner.hotel.settings",
        href: "/owner/hotels/hotel-1/settings",
        label: "Thiết lập khách sạn",
      },
    ],
  );
});

test("builds full-featured owner sidebar including all front-desk operations and staff delegation", () => {
  const navigation = buildWorkspaceNavigation({
    persona: "owner",
    permissions: [
      "hotel.dashboard.view",
      "hotel.billing.view",
      "hotel.revenue-protection.view",
      "hotel.marketplace.revenue.view",
      "hotel.rooms.view",
      "hotel.rooms.manage",
      "hotel.rooms.qr.manage",
      "hotel.stays.check-in",
      "hotel.stays.manage",
      "hotel.reservations.view",
      "hotel.reservations.manage",
      "hotel.requests.view",
      "hotel.requests.manage",
      "hotel.messages.view",
      "hotel.messages.manage",
      "hotel.kbtt.declarations.view",
      "hotel.kbtt.declarations.manage",
      "hotel.channels.view",
      "hotel.channels.manage",
      "hotel.services.view",
      "hotel.services.manage",
      "hotel.local-partners.view",
      "hotel.local-partners.manage",
      "hotel.staff.view",
      "hotel.staff.manage",
      "hotel.profile.view",
      "hotel.profile.manage",
    ],
    hotelId: "hotel-1",
    enabledFeatures: ["hotel.channel_manager", "frontdesk.hn2n_cccd_scanner"],
  });

  const keys = navigation.map((item) => item.key);

  // Receptionist & Operational tools are fully included
  assert.ok(keys.includes("staff.dashboard"));
  assert.ok(keys.includes("staff.rooms"));
  assert.ok(keys.includes("staff.front-desk"));
  assert.ok(keys.includes("staff.requests"));
  assert.ok(keys.includes("staff.messages"));
  assert.ok(keys.includes("staff.kbtt"));
  assert.ok(keys.includes("staff.biometric"));
  // Operational services & partners are managed centrally in Hotel Settings for owners
  assert.ok(!keys.includes("staff.services"));
  assert.ok(!keys.includes("staff.partners"));

  // Owner management, channel manager & centralized hotel settings
  assert.ok(keys.includes("owner.home"));
  assert.ok(keys.includes("owner.hotel.billing"));
  assert.ok(keys.includes("owner.hotel.reports"));
  assert.ok(!keys.includes("owner.hotel.rooms"));
  assert.ok(keys.includes("owner.hotel.channel-manager"));
  assert.ok(!keys.includes("owner.hotel.staff"));
  assert.ok(keys.includes("owner.hotel.profile"));
  assert.ok(keys.includes("owner.hotel.settings"));
});

test("toggles channel manager in owner and staff navigation based on hotel feature flag", () => {
  const ownerEnabled = buildWorkspaceNavigation({
    persona: "owner",
    permissions: ["hotel.channels.view", "hotel.rooms.view"],
    hotelId: "hotel-1",
    enabledFeatures: ["hotel.channel_manager"],
  });
  assert.equal(
    ownerEnabled.some((item) => item.key === "owner.hotel.channel-manager"),
    true,
  );

  const ownerDisabled = buildWorkspaceNavigation({
    persona: "owner",
    permissions: ["hotel.channels.view", "hotel.rooms.view"],
    hotelId: "hotel-1",
    enabledFeatures: [],
  });
  assert.equal(
    ownerDisabled.some((item) => item.key === "owner.hotel.channel-manager"),
    false,
  );

  const managerEnabled = buildWorkspaceNavigation({
    persona: "manager",
    permissions: ["hotel.channels.view", "hotel.rooms.view"],
    hotelId: "hotel-1",
    enabledFeatures: ["hotel.channel_manager"],
  });
  assert.equal(
    managerEnabled.some((item) => item.key === "staff.channel-manager"),
    true,
  );

  const managerDisabled = buildWorkspaceNavigation({
    persona: "manager",
    permissions: ["hotel.channels.view", "hotel.rooms.view"],
    hotelId: "hotel-1",
    enabledFeatures: [],
  });
  assert.equal(
    managerDisabled.some((item) => item.key === "staff.channel-manager"),
    false,
  );

  // Front desk has concise "Đơn đặt phòng OTA" nav item with concierge icon
  const frontDeskNav = buildWorkspaceNavigation({
    persona: "front_desk",
    permissions: ["hotel.channels.view", "hotel.rooms.view"],
    hotelId: "hotel-1",
    enabledFeatures: ["hotel.channel_manager"],
  });
  assert.equal(
    frontDeskNav.some((item) => item.key === "staff.channel-manager"),
    true,
  );
  assert.equal(
    frontDeskNav.find((item) => item.key === "staff.channel-manager")?.label,
    "Đơn đặt phòng OTA",
  );
  assert.equal(
    frontDeskNav.find((item) => item.key === "staff.channel-manager")?.icon,
    "concierge",
  );
});

test("shows front-desk guest operations only to manager and receptionist capabilities", () => {
  for (const persona of ["manager", "front_desk"] as const) {
    const navigation = buildWorkspaceNavigation({
      persona,
      permissions: ["hotel.reservations.view", "hotel.rooms.view"],
      hotelId: "hotel-1",
    });

    assert.deepEqual(
      navigation.find((item) => item.key === "staff.front-desk"),
      {
        key: "staff.front-desk",
        href: "/hotels/hotel-1/front-desk",
        label: "Quản lý khách lưu trú",
        icon: "concierge",
        section: "OPERATIONS",
      },
    );

    const roomsIndex = navigation.findIndex((item) => item.key === "staff.rooms");
    const frontDeskIndex = navigation.findIndex((item) => item.key === "staff.front-desk");
    assert.ok(roomsIndex !== -1 && frontDeskIndex !== -1);
    assert.ok(roomsIndex < frontDeskIndex, "staff.front-desk should appear after staff.rooms");
  }

  const withoutCapability = buildWorkspaceNavigation({
    persona: "front_desk",
    permissions: ["hotel.requests.view"],
    hotelId: "hotel-1",
  });
  const housekeeping = buildWorkspaceNavigation({
    persona: "housekeeping",
    permissions: ["hotel.reservations.view", "hotel.rooms.view"],
    hotelId: "hotel-1",
  });

  assert.equal(withoutCapability.some((item) => item.key === "staff.front-desk"), false);
  assert.equal(housekeeping.some((item) => item.key === "staff.front-desk"), false);
});

test("keeps receptionist room and biometric tools available when feature is enabled and hides biometric when disabled", () => {
  const enabledNav = buildWorkspaceNavigation({
    persona: "front_desk",
    permissions: ["hotel.stays.manage", "hotel.rooms.view"],
    hotelId: "hotel-1",
    enabledFeatures: ["frontdesk.hn2n_cccd_scanner"],
  });

  assert.equal(
    enabledNav.some((item) => item.key === "staff.rooms"),
    true,
  );
  assert.equal(
    enabledNav.some(
      (item) =>
        item.key === "staff.biometric" &&
        item.href === "/hotels/hotel-1/biometric",
    ),
    true,
  );

  const disabledNav = buildWorkspaceNavigation({
    persona: "front_desk",
    permissions: ["hotel.stays.manage", "hotel.rooms.view"],
    hotelId: "hotel-1",
    enabledFeatures: [],
  });

  assert.equal(
    disabledNav.some((item) => item.key === "staff.rooms"),
    true,
  );
  assert.equal(
    disabledNav.some((item) => item.key === "staff.biometric"),
    false,
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

test("maps HOTEL_HOUSEKEEPING to housekeeping and provides only room navigation", () => {
  assert.equal(resolveWorkspacePersona("HOTEL_HOUSEKEEPING"), "housekeeping");
  const navigation = buildWorkspaceNavigation({
    persona: "housekeeping",
    permissions: [
      "hotel.dashboard.view",
      "hotel.rooms.view",
      "hotel.rooms.status.manage",
      "hotel.requests.view",
      "hotel.messages.view",
    ],
    hotelId: "hotel-1",
  });
  assert.deepEqual(
    navigation.map((item) => ({ key: item.key, href: item.href })),
    [{ key: "staff.rooms", href: "/hotels/hotel-1/rooms" }],
  );
  assert.equal(
    navigation.find((item) => item.key === "staff.rooms")?.label,
    "Sơ đồ phòng & Buồng phòng",
  );
});
