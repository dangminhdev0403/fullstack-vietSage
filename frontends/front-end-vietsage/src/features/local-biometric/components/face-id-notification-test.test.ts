import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(new URL("./face-id-notification-test.tsx", import.meta.url), "utf8");
const tabs = readFileSync(new URL("./biometric-owner-tabs.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../../../app/(vietsage)/owner/(hotel)/hotels/[hotelId]/biometric/page.tsx", import.meta.url), "utf8");
const registry = readFileSync(new URL("../../workspace/config/workspace-registry.ts", import.meta.url), "utf8");

test("FaceID tab is hidden and CCCD device panels are rendered directly", () => {
  assert.match(tabs, /WorkstationConnectionPanel/);
  assert.match(tabs, /WorkstationTestScanPanel/);
  assert.match(page, /BiometricOwnerTabs/);
  assert.doesNotMatch(registry, /owner\.hotel\.face-id|\/owner\/hotels\/\{hotelId\}\/face-id/);
});

test("notification test is explicitly simulated and scoped to the route hotel", () => {
  assert.match(panel, /Sự kiện kiểm thử/);
  assert.match(panel, /face-id-test:\$\{hotelId\}/);
  assert.match(panel, /BroadcastChannel/);
  assert.match(panel, /Thông báo FaceID/);
  assert.match(panel, /Không phải sự kiện từ thiết bị thật/);
  assert.doesNotMatch(panel, /fetch\(|localStorage|sessionStorage/);
});
