import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const notifierSource = readFileSync(
  new URL("./components/hotel-ops-realtime-notifier.tsx", import.meta.url),
  "utf8",
);

const invalidatorSource = readFileSync(
  new URL("./utils/invalidate-hotel-realtime-queries.ts", import.meta.url),
  "utf8",
);

const hookSource = readFileSync(
  new URL("../request-realtime/use-owner-request-realtime.ts", import.meta.url),
  "utf8",
);

test("HotelOpsRealtimeNotifier wires all housekeeping task lifecycle events", () => {
  // Verifies all 6 event handlers are wired
  assert.match(notifierSource, /onHousekeepingTaskCreated:/);
  assert.match(notifierSource, /onHousekeepingTaskClaimed:/);
  assert.match(notifierSource, /onHousekeepingTaskStarted:/);
  assert.match(notifierSource, /onHousekeepingTaskBlocked:/);
  assert.match(notifierSource, /onHousekeepingTaskCompleted:/);
  assert.match(notifierSource, /onHousekeepingTaskReopened:/);

  // Verifies audio alerts on urgent/blocked tasks
  assert.match(notifierSource, /playRequestAlertSound\(isUrgent\)/);
  assert.match(notifierSource, /playRequestAlertSound\(true\)/);

  // Verifies toast feedback with human-friendly descriptions
  assert.match(notifierSource, /Nhiệm vụ buồng phòng mới/);
  assert.match(notifierSource, /Đã nhận nhiệm vụ dọn phòng/);
  assert.match(notifierSource, /Bắt đầu dọn phòng/);
  assert.match(notifierSource, /Buồng phòng gặp sự cố/);
  assert.match(notifierSource, /Đã hoàn thành dọn phòng/);
  assert.match(notifierSource, /Mở lại nhiệm vụ buồng phòng/);
});

test("HotelOpsRealtimeNotifier wires reconnect-safe invalidation", () => {
  // onReconnect triggers housekeeping, requests, and room realtime query invalidation
  assert.match(notifierSource, /onReconnect:\s*\(\)\s*=>\s*\{[^}]*invalidateHotelRequestRealtimeQueries/);
  assert.match(notifierSource, /onReconnect:\s*\(\)\s*=>\s*\{[^}]*invalidateHotelHousekeepingRealtimeQueries/);
  assert.match(notifierSource, /onReconnect:\s*\(\)\s*=>\s*\{[^}]*invalidateHotelRealtimeQueries/);
});

test("invalidate-hotel-realtime-queries exports invalidateHotelHousekeepingRealtimeQueries with core keys", () => {
  assert.match(invalidatorSource, /export async function invalidateHotelHousekeepingRealtimeQueries/);
  assert.match(invalidatorSource, /queryKey:\s*\["housekeeping"\]/);
  assert.match(invalidatorSource, /queryKey:\s*\["housekeeping-tasks"\]/);
  assert.match(invalidatorSource, /staffBound\.queries\.list\.invalidateAll/);
  assert.match(invalidatorSource, /roomPlanBound\.queries\.plan\.invalidateAll/);
});

test("useOwnerRequestRealtime supports typed HousekeepingTaskRealtimeEvent", () => {
  assert.match(hookSource, /export type HousekeepingTaskRealtimeEvent/);
  assert.match(hookSource, /onHousekeepingTaskCreated\?:/);
  assert.match(hookSource, /onHousekeepingTaskClaimed\?:/);
  assert.match(hookSource, /onHousekeepingTaskStarted\?:/);
  assert.match(hookSource, /onHousekeepingTaskBlocked\?:/);
  assert.match(hookSource, /onHousekeepingTaskCompleted\?:/);
  assert.match(hookSource, /onHousekeepingTaskReopened\?:/);
});
