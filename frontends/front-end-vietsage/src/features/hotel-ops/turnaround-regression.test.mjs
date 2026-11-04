import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const modal = readFileSync(new URL("./components/edit-reservation-modal.tsx", import.meta.url), "utf8");
function modalFunction(name, context) {
  const source = ts.createSourceFile("modal.tsx", modal, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) declaration = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(declaration, name);
  const code = ts.transpileModule(declaration.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return vm.runInNewContext(`${code}; ${name}`, context);
}
function expressContext() {
  const events = [];
  const updated = { id: "res", roomId: "B", plannedCheckOutAt: "2026-11-06T05:00:00Z", updatedAt: "new-version" };
  const context = {
    reservation: { id: "res", roomId: "A", guestDisplayName: "Guest" },
    canCheckIn: true, isSubmitting: false, isLoadingRooms: false, isRoomsError: false,
    roomsPage: { items: [{ id: "B" }] }, roomsList: [{ id: "B", roomNumber: "102", status: "AVAILABLE" }],
    roomId: "B", cleanedRoomIds: [], isRoomOccupiedConflict: false,
    guestDisplayName: "Guest", guestPhone: "", hotelId: "hotel", queryClient: {},
    saveReservationCore: async () => { events.push("save"); return updated; },
    staffRoomsRepository: { checkInReservation: async (...args) => { events.push(["check-in", ...args]); return {}; } },
    invalidateHotelRealtimeQueries: async () => events.push("invalidate"),
    showSuccessAlert: async () => events.push("success"),
    showErrorAlert: async () => events.push("error"), showWarningAlert: async () => events.push("warning"),
    onSuccess: async () => events.push("complete"), onClose: () => events.push("close"),
    setIsSubmitting: () => {}, formatFriendlyCheckInError: () => "failure",
    isEarlyCheckInError: () => false, isLateCheckInError: () => false,
  };
  return { context, events };
}
test("express check-in uses saved room/version and closes only after completion", async () => {
  const { context, events } = expressContext();
  await modalFunction("executeExpressCheckIn", context)();
  const request = events.find(Array.isArray);
  assert.equal(request[3].expectedRoomId, "B");
  assert.equal(request[3].expectedUpdatedAt, "new-version");
  assert.ok(events.indexOf("complete") > events.indexOf("success"));
  assert.equal(events.at(-1), "close");
});
test("failed check-in retains the modal and never signals completion", async () => {
  const { context, events } = expressContext();
  context.staffRoomsRepository.checkInReservation = async () => { throw new Error("conflict"); };
  await modalFunction("executeExpressCheckIn", context)();
  assert.ok(events.includes("error"));
  assert.ok(!events.includes("close"));
  assert.ok(!events.includes("complete"));
});
test("cancelled early check-in retains the saved form", async () => {
  const { context, events } = expressContext();
  context.staffRoomsRepository.checkInReservation = async () => { throw new Error("early"); };
  context.isEarlyCheckInError = () => true;
  context.formatEarlyCheckInConfirmHtml = () => "confirm";
  context.showConfirmDialog = async () => ({ isConfirmed: false });
  await modalFunction("executeExpressCheckIn", context)();
  assert.ok(!events.includes("close"));
  assert.ok(!events.includes("complete"));
});
test("unknown room data blocks express check-in before saving", async () => {
  for (const state of [{ isLoadingRooms: true }, { isRoomsError: true }, { roomsPage: { items: [] } }]) {
    const { context, events } = expressContext();
    Object.assign(context, state);
    await modalFunction("executeExpressCheckIn", context)();
    assert.ok(events.includes("warning"));
    assert.ok(!events.includes("save"));
  }
});
test("CCCD continuation receives the record returned by save", async () => {
  const updated = { id: "res", roomId: "B", updatedAt: "new-version" };
  let received;
  await modalFunction("handleSaveAndCheckIn", {
    canCheckIn: true, isSubmitting: false, isLoadingRooms: false, isRoomsError: false,
    isRoomOccupiedConflict: false,
    saveReservationCore: async () => updated,
    onCheckIn: async (record) => { received = record; },
  })();
  assert.equal(received, updated);
});
test("save core does not invoke the completion callback", () => {
  const fn = modalFunction("saveReservationCore", {});
  assert.doesNotMatch(fn.toString(), /onSuccess/);
});

function repository(transport) {
  const source = readFileSync(new URL("./repositories/staff-rooms-repository.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, URLSearchParams, require: () => ({ requestInternalApiEnvelope: transport }) });
  return exports.staffRoomsRepository;
}
test("room discovery loads beyond page one and forwards cancellation", async () => {
  const signal = new AbortController().signal;
  const pages = [];
  const repo = repository(async (url, options) => {
    assert.equal(options.signal, signal);
    const page = Number(new URL(url, "https://local").searchParams.get("page"));
    pages.push(page);
    return { data: { page, limit: 2, total: 3, items: page === 1 ? [{ id: "A" }, { id: "B" }] : [{ id: "C", status: "OCCUPIED" }] } };
  });
  const result = await repo.listAll("hotel", signal);
  assert.deepEqual(pages, [1, 2]);
  assert.equal(result.items[2].id, "C");
  assert.equal(result.items[2].status, "OCCUPIED");
});
test("partial or repeated room pages fail instead of reporting a complete list", async () => {
  for (const second of [[], [{ id: "A" }]]) {
    const repo = repository(async (url) => ({ data: {
      page: Number(new URL(url, "https://local").searchParams.get("page")), limit: 1, total: 2,
      items: url.includes("page=1") ? [{ id: "A" }] : second,
    } }));
    await assert.rejects(repo.listAll("hotel"));
  }
});
test("room page transport errors propagate", async () => {
  const repo = repository(async () => { throw new Error("network"); });
  await assert.rejects(repo.listAll("hotel"), /network/);
});

test("express continuation suppresses concurrent clicks and releases the lock", async () => {
  let release;
  let calls = 0;
  const pending = new Promise((resolve) => { release = resolve; });
  const ref = { current: false };
  const run = modalFunction("handleExpressCheckIn", {
    continuationBusyRef: ref,
    executeExpressCheckIn: async () => { calls++; await pending; },
  });
  const first = run();
  await run();
  assert.equal(calls, 1);
  release();
  await first;
  assert.equal(ref.current, false);
  await run();
  assert.equal(calls, 2);
});
test("confirmed early check-in retries with the saved version", async () => {
  const { context, events } = expressContext();
  const requests = [];
  context.staffRoomsRepository.checkInReservation = async (_hotel, _id, payload) => {
    requests.push(payload);
    if (requests.length === 1) throw new Error("early");
    return {};
  };
  context.isEarlyCheckInError = () => true;
  context.formatEarlyCheckInConfirmHtml = () => "confirm";
  context.showConfirmDialog = async () => ({ isConfirmed: true });
  await modalFunction("executeExpressCheckIn", context)();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].confirmEarlyCheckIn, true);
  assert.equal(requests[1].expectedUpdatedAt, "new-version");
  assert.equal(events.at(-1), "close");
});
