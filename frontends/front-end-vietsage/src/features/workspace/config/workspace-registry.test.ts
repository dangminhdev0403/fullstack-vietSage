import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { buildWorkspaceNavigation, getWorkspaceDefinition } from "./workspace-registry.ts";

test("keeps platform navigation capability-driven", () => {
  const navigation = buildWorkspaceNavigation({
    persona: "platform_admin",
    permissions: ["platform.hotels.view"],
  });

  assert.deepEqual(navigation.map((item) => item.href), ["/admin/dashboard", "/admin/hotels"]);
});

test("separates manager and front desk workspace navigation", () => {
  const permissions = ["hotel.requests.view", "hotel.services.manage"];
  const manager = buildWorkspaceNavigation({ persona: "manager", permissions, hotelId: "hotel-1" });
  const frontDesk = buildWorkspaceNavigation({ persona: "front_desk", permissions, hotelId: "hotel-1" });

  assert.equal(getWorkspaceDefinition("manager").homePath, "/staff/manager");
  assert.equal(getWorkspaceDefinition("front_desk").homePath, "/staff/front-desk");
  assert.equal(manager.some((item) => item.href.endsWith("/services")), true);
  assert.equal(frontDesk.some((item) => item.href.endsWith("/services")), false);
});
