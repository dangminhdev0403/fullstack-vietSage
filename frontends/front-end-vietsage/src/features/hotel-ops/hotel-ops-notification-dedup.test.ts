import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const hotelOpsNotifierSource = readFileSync(
  new URL("./components/hotel-ops-realtime-notifier.tsx", import.meta.url),
  "utf8",
);

const hkNotifierSource = readFileSync(
  new URL("../housekeeping/components/housekeeping-realtime-notifier.tsx", import.meta.url),
  "utf8",
);

test("HotelOpsRealtimeNotifier contains smart suppression for generic room status toasts", () => {
  // Verifies housekeeping tracking and timer refs
  assert.match(hotelOpsNotifierSource, /recentHousekeepingTasksRef\s*=\s*useRef/);
  assert.match(hotelOpsNotifierSource, /pendingRoomStatusTimerRef\s*=\s*useRef/);
  assert.match(hotelOpsNotifierSource, /markHousekeepingAction/);

  // Verifies that onHousekeepingTaskCompleted marks housekeeping action
  assert.match(hotelOpsNotifierSource, /markHousekeepingAction\(\[raw\?\.roomNumber,\s*raw\?\.taskId\],\s*"COMPLETED"\)/);

  // Verifies that onRoomStatusUpdated checks for recent housekeeping action and suppresses duplicate toast
  assert.match(hotelOpsNotifierSource, /hasRecentHk\s*&&/);
  assert.match(hotelOpsNotifierSource, /statusUpper\s*===\s*"AVAILABLE"/);

  // Verifies that room status toast is debounced and bound to room key
  assert.match(hotelOpsNotifierSource, /id:\s*`hotel-ops-room-status-\$\{primaryKey\}`/);
});

test("HotelOpsRealtimeNotifier deduplicates guest messages by thread/room", () => {
  assert.match(hotelOpsNotifierSource, /id:\s*`hotel-ops-message-\$\{messageKey\}`/);
});

test("HousekeepingRealtimeNotifier prevents duplicate room status and task event toasts", () => {
  assert.match(hkNotifierSource, /recentTaskEventsRef\s*=\s*useRef/);
  assert.match(hkNotifierSource, /pendingStatusTimerRef\s*=\s*useRef/);
  assert.match(hkNotifierSource, /markTaskAction/);
  assert.match(hkNotifierSource, /hasRecentTask\s*&&/);
  assert.match(hkNotifierSource, /id:\s*`hk-task-\$\{roomKey\}`/);
});
