import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

import type { HotelPriorityAlertsResponse } from "../types/hotel-ops-contract.ts";
import type { mapBackendPriorityAlerts as MapBackendPriorityAlertsFn } from "./priority-room-alerts.ts";

function loadTsModule<T>(relativePath: string, customRequire?: (id: string) => unknown): T {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const mod = { exports: {} as T };
  const fn = vm.runInNewContext(
    "(function(exports, require, module) {\n" + outputText + "\n})",
    { Intl, Date, Map, Set, Array, Object, Number, String, Boolean, Math, JSON },
  );
  fn(mod.exports, customRequire ?? (() => ({})), mod);
  return mod.exports;
}

const vietnamTemporalMod = loadTsModule<Record<string, unknown>>(
  "../../../libs/vietnam-temporal.ts",
);
const { mapBackendPriorityAlerts } = loadTsModule<{
  mapBackendPriorityAlerts: typeof MapBackendPriorityAlertsFn;
}>("./priority-room-alerts.ts", (id) => {
  if (id === "@/libs/vietnam-temporal") return vietnamTemporalMod;
  throw new Error(`Unexpected runtime import in priority-room-alerts test: ${id}`);
});

function makeResponse(
  items: HotelPriorityAlertsResponse["items"],
): HotelPriorityAlertsResponse {
  return {
    generatedAt: "2026-11-13T05:00:00.000Z",
    businessDate: "2026-11-13",
    timezone: "Asia/Ho_Chi_Minh",
    total: items.length,
    summary: {
      overdueArrivals: 0,
      dueTodayArrivals: 0,
      overdueCheckouts: 0,
      dueTodayCheckouts: 0,
      dirtyRooms: 0,
      blockedOrMaintenance: 0,
      turnaroundConflicts: 0,
    },
    items,
  };
}

test("mapBackendPriorityAlerts returns empty array when backend has no actionable items", () => {
  assert.deepEqual([...mapBackendPriorityAlerts({ response: makeResponse([]) })], []);
  assert.deepEqual([...mapBackendPriorityAlerts({ response: null })], []);
});

test("mapBackendPriorityAlerts maps overdue checkout, overdue arrival, and deduplicates covered dirty/blocked rooms", () => {
  const items = mapBackendPriorityAlerts({
    response: makeResponse([
      {
        id: "dirty-room-202",
        category: "DIRTY_ROOM",
        severity: "HIGH",
        priorityRank: 4,
        roomId: "room-202",
        roomNumber: "202",
        floor: "Tầng 2",
        zone: null,
        roomType: "Deluxe",
        roomStatus: "PROCESSING",
        roomUpdatedAt: "2026-11-13T04:00:00.000Z",
        reservationId: null,
        stayId: null,
        reservationCode: null,
        groupCode: null,
        sourceType: "ROOM",
        status: "PROCESSING",
        guestDisplayName: null,
        guestPhone: null,
        guestCount: null,
        plannedCheckInAt: null,
        plannedCheckOutAt: null,
        blockerCode: "RESERVATION_TODAY_ON_DIRTY_ROOM",
      },
      {
        id: "arr-202",
        category: "DUE_TODAY_ARRIVAL",
        severity: "HIGH",
        priorityRank: 3,
        roomId: "room-202",
        roomNumber: "202",
        floor: "Tầng 2",
        zone: null,
        roomType: "Deluxe",
        roomStatus: "PROCESSING",
        roomUpdatedAt: "2026-11-13T04:00:00.000Z",
        reservationId: "res-202",
        stayId: null,
        reservationCode: "RES-202",
        groupCode: null,
        sourceType: "RESERVATION",
        status: "CONFIRMED",
        guestDisplayName: "Nguyễn Văn A",
        guestPhone: "0901234567",
        guestCount: 2,
        plannedCheckInAt: "2026-11-13T07:00:00.000Z",
        plannedCheckOutAt: "2026-11-14T05:00:00.000Z",
        blockerCode: "ROOM_PROCESSING",
      },
      {
        id: "stay-overdue-101",
        category: "OVERDUE_CHECKOUT",
        severity: "CRITICAL",
        priorityRank: 1,
        roomId: "room-101",
        roomNumber: "101",
        floor: "Tầng 1",
        zone: null,
        roomType: "Standard",
        roomStatus: "OCCUPIED",
        roomUpdatedAt: "2026-11-12T10:00:00.000Z",
        reservationId: null,
        stayId: "stay-101",
        reservationCode: null,
        groupCode: null,
        sourceType: "STAY",
        status: "ACTIVE",
        guestDisplayName: "Trần Thị B",
        guestPhone: null,
        guestCount: 1,
        plannedCheckInAt: "2026-11-11T07:00:00.000Z",
        plannedCheckOutAt: "2026-11-12T05:00:00.000Z",
        blockerCode: null,
      },
      {
        id: "res-overdue-unassigned",
        category: "OVERDUE_ARRIVAL",
        severity: "CRITICAL",
        priorityRank: 2,
        roomId: null,
        roomNumber: null,
        floor: null,
        zone: null,
        roomType: "Suite",
        roomStatus: null,
        roomUpdatedAt: null,
        reservationId: "res-unassigned",
        stayId: null,
        reservationCode: "RES-999",
        groupCode: null,
        sourceType: "RESERVATION",
        status: "CONFIRMED",
        guestDisplayName: "Lê Văn C",
        guestPhone: null,
        guestCount: 2,
        plannedCheckInAt: "2026-11-12T07:00:00.000Z",
        plannedCheckOutAt: "2026-11-14T05:00:00.000Z",
        blockerCode: "UNASSIGNED_ROOM",
      },
    ]),
    nowMs: Date.parse("2026-11-13T06:00:00.000Z"),
  });

  // dirty-room-202 must be deduplicated because arr-202 already carries ROOM_PROCESSING
  assert.equal(items.length, 3);
  assert.equal(items[0].stayId, "stay-101");
  assert.equal(items[0].bucket, "overdue");
  assert.equal(items[0].actionKind, "manage-stay");

  assert.equal(items[1].reservationId, "res-unassigned");
  assert.equal(items[1].bucket, "overdue");
  assert.equal(items[1].actionKind, "assign-room");

  assert.equal(items[2].reservationId, "res-202");
  assert.equal(items[2].bucket, "urgent");
  assert.equal(items[2].actionKind, "mark-ready");
  assert.equal(items[2].roomUpdatedAt, "2026-11-13T04:00:00.000Z");
  assert.match(items[2].readinessLabel, /dọn buồng/i);
});

test("mapBackendPriorityAlerts marks occupied turnaround conflict as manage-stay rather than check-in", () => {
  const items = mapBackendPriorityAlerts({
    response: makeResponse([
      {
        id: "arr-305",
        category: "DUE_TODAY_ARRIVAL",
        severity: "HIGH",
        priorityRank: 2,
        roomId: "room-305",
        roomNumber: "305",
        floor: "Tầng 3",
        zone: null,
        roomType: "VIP",
        roomStatus: "OCCUPIED",
        roomUpdatedAt: "2026-11-13T03:00:00.000Z",
        reservationId: "res-305",
        stayId: null,
        reservationCode: "RES-305",
        groupCode: null,
        sourceType: "RESERVATION",
        status: "CONFIRMED",
        guestDisplayName: "Phạm Minh D",
        guestPhone: null,
        guestCount: 2,
        plannedCheckInAt: "2026-11-13T07:00:00.000Z",
        plannedCheckOutAt: "2026-11-14T05:00:00.000Z",
        blockerCode: "ROOM_OCCUPIED",
      },
    ]),
    nowMs: Date.parse("2026-11-13T06:00:00.000Z"),
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].bucket, "urgent");
  assert.equal(items[0].badgeLabel, "Đảo phòng hôm nay");
  assert.equal(items[0].actionKind, "manage-stay");
  assert.match(items[0].reasonText, /đang có khách/i);
  assert.match(items[0].readinessLabel, /Cần trả phòng cũ/);
});
