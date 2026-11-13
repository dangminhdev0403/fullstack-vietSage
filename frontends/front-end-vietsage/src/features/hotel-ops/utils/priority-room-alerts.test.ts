import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { Temporal } from "@js-temporal/polyfill";

import type { HotelPriorityAlertsResponse } from "../types/hotel-ops-contract.ts";
import type { mapBackendPriorityAlerts as MapBackendPriorityAlertsFn } from "./priority-room-alerts.ts";
import type { buildPriorityRoomAlerts as BuildPriorityRoomAlertsFn } from "./priority-room-alerts.ts";

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
  (id) => {
    if (id === "@js-temporal/polyfill") return { Temporal };
    throw new Error(`Unexpected temporal import: ${id}`);
  },
);
const { mapBackendPriorityAlerts, buildPriorityRoomAlerts } = loadTsModule<{
  mapBackendPriorityAlerts: typeof MapBackendPriorityAlertsFn;
  buildPriorityRoomAlerts: typeof BuildPriorityRoomAlertsFn;
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
  assert.equal(items[1].actionKind, "resolve-overdue");
  assert.equal(items[1].actionLabel, "Xử lý quá hạn");

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

function overdueAlert(overrides: Partial<HotelPriorityAlertsResponse["items"][number]> = {}): HotelPriorityAlertsResponse["items"][number] {
  return {
    id: "overdue-arrival", category: "OVERDUE_ARRIVAL", severity: "CRITICAL", priorityRank: 2,
    roomId: "room-1", roomNumber: "101", floor: null, zone: null, roomType: "Deluxe",
    roomStatus: "AVAILABLE", roomUpdatedAt: null, reservationId: "reservation-1", stayId: null,
    reservationCode: "RES-1", groupCode: null, sourceType: "RESERVATION", status: "CONFIRMED",
    guestDisplayName: "Nguyễn Văn An", guestPhone: null, guestCount: 1,
    plannedCheckInAt: "2026-11-12T07:00:00.000Z", plannedCheckOutAt: "2026-11-14T05:00:00.000Z",
    blockerCode: null, ...overrides,
  };
}

for (const [name, overrides] of [
  ["clean assigned room", {}],
  ["unassigned room", { roomId: null, roomNumber: null, blockerCode: "UNASSIGNED_ROOM" }],
  ["dirty room", { roomStatus: "PROCESSING", blockerCode: "ROOM_PROCESSING" }],
  ["occupied room", { roomStatus: "OCCUPIED", blockerCode: "ROOM_OCCUPIED" }],
  ["expired schedule", { plannedCheckOutAt: "2026-11-12T05:00:00.000Z" }],
] satisfies Array<[string, Partial<HotelPriorityAlertsResponse["items"][number]>]>) {
  test(`backend overdue arrival opens resolution for ${name}`, () => {
    const [item] = mapBackendPriorityAlerts({
      response: makeResponse([overdueAlert(overrides)]), nowMs: Date.parse("2026-11-13T06:00:00.000Z"),
    });
    assert.equal(item.actionKind, "resolve-overdue");
    assert.equal(item.actionLabel, "Xử lý quá hạn");
  });
}

test("an unassigned arrival that is still due today keeps the room assignment action", () => {
  const [item] = mapBackendPriorityAlerts({ response: makeResponse([overdueAlert({
    category: "DUE_TODAY_ARRIVAL", roomId: null, roomNumber: null,
    plannedCheckInAt: "2026-11-13T07:00:00.000Z", blockerCode: "UNASSIGNED_ROOM",
  })]) });
  assert.equal(item.actionKind, "assign-room");
});

for (const roomId of ["room-1", null]) {
  test(`local overdue fallback opens resolution with roomId=${roomId}`, () => {
    const [item] = buildPriorityRoomAlerts({
      rooms: roomId ? [{ id: roomId, roomNumber: "101", floor: null, type: "Deluxe", status: "AVAILABLE" }] : [],
      arrivalsList: [{
        id: "arrival-1", hotelId: "hotel-1", roomId, reservationCode: "RES-1",
        status: "CONFIRMED", guestDisplayName: "Nguyễn Văn An", guestPhone: null,
        plannedCheckInAt: "2026-11-12T07:00:00.000Z", plannedCheckOutAt: "2026-11-14T05:00:00.000Z",
      }],
      otaBookings: [], todayYmd: "2026-11-13", targetYmd: "2026-11-13", isFutureDate: false,
      nowMs: Date.parse("2026-11-13T06:00:00.000Z"),
    });
    assert.equal(item.actionKind, "resolve-overdue");
    assert.equal(item.actionLabel, "Xử lý quá hạn");
  });
}

test("resolution opens details with either reservation-management or check-in permission", () => {
  const controlSource = readFileSync(new URL("../components/priority-rooms-control-section.tsx", import.meta.url), "utf8");
  const helperSource = controlSource.slice(controlSource.indexOf("function getPrimaryActionButtonClass"), controlSource.indexOf("/**"));
  const { outputText } = ts.transpileModule(helperSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  });
  const react = { createElement: (type: string, props: Record<string, unknown>, ...children: unknown[]) => ({ type, props, children }) };
  const { PriorityRowActions } = vm.runInNewContext(`${outputText}\n({ PriorityRowActions })`, { React: react });
  for (const [canManageReservations, canCheckInStay, expectedLabel] of [
    [true, false, "Xử lý quá hạn"], [false, true, "Xử lý quá hạn"], [false, false, "Chi tiết"],
  ]) {
    let inspected = 0;
    let mutated = 0;
    const button = PriorityRowActions({
      item: { bucket: "overdue", actionKind: "resolve-overdue", actionLabel: "Xử lý quá hạn" },
      permissions: { canManageReservations, canCheckInStay, canManageRooms: false },
      onInspectItem: () => inspected++, onPrimaryAction: () => mutated++,
    });
    assert.equal(button.children[0], expectedLabel);
    button.props.onClick({ stopPropagation() {}, currentTarget: null });
    assert.equal(inspected, 1);
    assert.equal(mutated, 0);
  }
});
