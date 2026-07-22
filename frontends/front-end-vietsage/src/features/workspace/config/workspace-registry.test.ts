import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { buildWorkspaceNavigation, createWorkspaceRegistry, getWorkspaceDashboardWidgets, getWorkspaceDefinition, resolveWorkspacePersona } from "./workspace-registry.ts";

test("keeps platform navigation capability-driven", () => {
  const navigation = buildWorkspaceNavigation({
    persona: "platform_admin",
    permissions: ["platform.hotels.view"],
  });

  assert.deepEqual(navigation.map((item) => item.href), ["/admin/dashboard", "/admin/hotels"]);
});

test("provides service navigation for staff personas with service capabilities", () => {
  const permissions = ["hotel.requests.view", "hotel.services.manage"];
  const manager = buildWorkspaceNavigation({ persona: "manager", permissions, hotelId: "hotel-1" });
  const frontDesk = buildWorkspaceNavigation({ persona: "front_desk", permissions, hotelId: "hotel-1" });
  const frontDeskWithoutServices = buildWorkspaceNavigation({ persona: "front_desk", permissions: ["hotel.requests.view"], hotelId: "hotel-1" });

  assert.equal(getWorkspaceDefinition("manager").homePath, "/staff");
  assert.equal(getWorkspaceDefinition("front_desk").homePath, "/staff");
  assert.equal(manager.some((item) => item.key === "staff.home"), false);
  assert.equal(manager[0]?.href, "/hotels/hotel-1/services");
  assert.equal(manager.some((item) => item.href.endsWith("/services")), true);
  assert.equal(frontDesk.some((item) => item.href.endsWith("/services")), true);
  assert.equal(frontDeskWithoutServices.some((item) => item.href.endsWith("/services")), false);
});

test("renders only registered labels and scopes owner staff navigation by capability", () => {
  const withoutStaff = buildWorkspaceNavigation({
    persona: "owner",
    permissions: ["hotel.reservations.manage"],
    hotelId: "hotel-1",
  });
  const withStaff = buildWorkspaceNavigation({
    persona: "owner",
    permissions: ["hotel.staff.manage"],
    hotelId: "hotel-1",
  });

  assert.equal(withoutStaff.some((item) => item.label.includes("hotel.")), false);
  assert.equal(withoutStaff.some((item) => item.key === "owner.staff"), false);
  assert.equal(
    withStaff.some((item) => item.key === "owner.staff" && item.href === "/owner/staff"),
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
    ["requests.active", "requests.new", "services.categories", "services.items", "requests.feed"],
  );
});

test("adds role aliases, navigation, and widgets through an immutable extension", () => {
  const registry = createWorkspaceRegistry([
    {
      roleAliases: { HOTEL_AUDITOR: "finance" },
      navigation: [
        {
          key: "finance.audit",
          personas: ["finance"],
          href: "/staff/operations",
          label: "Đối soát",
          icon: "fact_check",
          order: 90,
          anyCapabilities: ["hotel.billing.view"],
        },
      ],
      widgets: [
        {
          key: "finance.audit-summary",
          personas: ["finance"],
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

  assert.equal(resolveWorkspacePersona("hotel_auditor", registry), "finance");
  assert.equal(
    buildWorkspaceNavigation({
      persona: "finance",
      permissions: ["hotel.billing.view"],
      registry,
    }).some((item) => item.key === "finance.audit"),
    true,
  );
  assert.equal(
    getWorkspaceDashboardWidgets({
      persona: "finance",
      permissions: ["hotel.billing.view"],
      registry,
    }).some((widget) => widget.key === "finance.audit-summary"),
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
