import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

function source(path) {
  return ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function find(tree, predicate) {
  let found;
  function visit(node) {
    if (!found && predicate(node)) found = node;
    if (!found) ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(found, "expected production source node exists");
  return found;
}

function evaluate(code, context = {}) {
  const js = ts.transpileModule(`const evaluated = (${code});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return vm.runInNewContext(`${js}; evaluated`, context);
}

function conflictResolver() {
  const tree = source("./utils/reservation-room-conflict.ts");
  const declaration = find(tree, (node) => ts.isFunctionDeclaration(node) && node.name?.text === "resolveReservationRoomConflict");
  return evaluate(declaration.getText(tree).replace(/^export /, ""));
}

const fallbackStay = {
  stayId: "old-stay",
  guestName: "Previous guest",
  endDate: "2026-11-04T05:00:00Z",
  status: "OCCUPIED",
  phone: "0900000000",
};

const plain = (value) => value == null ? value : JSON.parse(JSON.stringify(value));

test("before live room data exists, preserve the original same-room conflict", () => {
  const result = conflictResolver()({ roomId: "room-A", reservationRoomId: "room-A", fallbackStay });
  assert.deepEqual(plain(result), fallbackStay);
});

test("old-room fallback cannot block a different room chosen in the draft", () => {
  const result = conflictResolver()({ roomId: "room-B", reservationRoomId: "room-A", fallbackStay });
  assert.equal(result, null);
});

for (const liveRoom of [{ activeStay: null }, {}, { activeStay: { id: "old-stay", status: "CHECKED_OUT" } }]) {
  test(`authoritative room data clears a stale conflict: ${JSON.stringify(liveRoom)}`, () => {
    const result = conflictResolver()({ roomId: "room-A", reservationRoomId: "room-A", liveRoom, fallbackStay });
    assert.equal(result, null);
  });
}

test("a newer active stay replaces the captured conflict after another tab acts", () => {
  const result = conflictResolver()({
    roomId: "room-A", reservationRoomId: "room-A", fallbackStay,
    liveRoom: { activeStay: { id: "new-stay", status: "OCCUPIED", guestDisplayName: "New guest", plannedCheckOutAt: "2026-11-06T05:00:00Z", guestPhone: "0911111111" } },
  });
  assert.deepEqual(plain(result), {
    stayId: "new-stay", guestName: "New guest", endDate: "2026-11-06T05:00:00Z", status: "OCCUPIED", phone: "0911111111",
  });
});

test("a changed draft room uses that room's live stay instead of the old-room fallback", () => {
  const result = conflictResolver()({
    roomId: "room-B", reservationRoomId: "room-A", fallbackStay,
    liveRoom: { activeStay: { id: "stay-B", status: "OVERDUE", guestDisplayName: "Guest B" } },
  });
  assert.equal(result?.stayId, "stay-B");
  assert.equal(result?.guestName, "Guest B");
  assert.equal(result?.status, "OVERDUE");
});

test("no captured or live stay produces no conflict", () => {
  assert.equal(conflictResolver()({ roomId: "room-A", reservationRoomId: "room-A" }), null);
});

function tapeCallback(name, context) {
  const tree = source("./components/tape-chart/tape-chart-view.tsx");
  const declaration = find(tree, (node) => ts.isVariableDeclaration(node) && node.name.getText(tree) === name);
  assert.ok(declaration.initializer && ts.isCallExpression(declaration.initializer));
  return evaluate(declaration.initializer.arguments[0].getText(tree), context);
}

function conflictCheckoutCallback(context) {
  const tree = source("./components/tape-chart/tape-chart-view.tsx");
  const element = find(tree, (node) => (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(tree) === "EditReservationModal");
  const prop = element.attributes.properties.find((node) => ts.isJsxAttribute(node) && node.name.getText(tree) === "onCheckOutConflictingStay");
  assert.ok(prop?.initializer && ts.isJsxExpression(prop.initializer));
  return evaluate(prop.initializer.expression.getText(tree), context);
}

function checkoutContext() {
  const events = [];
  const context = {
    isReadOnly: false,
    hotelId: "hotel-A", queryClient: {},
    selectedBlock: { id: "reservation-A", kind: "RESERVATION", roomId: "room-A" },
    setSelectedBlock: (value) => events.push(["selection", value]),
    onClose: () => events.push(["close"]),
    onCheckOutStay: async (...args) => events.push(["checkout", ...args]),
    onCheckInReservation: async (...args) => events.push(["checkin", ...args]),
    handleBlockCheckIn: async (...args) => events.push(["checkin", ...args]),
    invalidateHotelRealtimeQueries: async () => events.push(["invalidate"]),
    refetchPlan: async () => events.push(["refetch"]),
  };
  return { events, context };
}

test("opening stay checkout keeps the selected reservation context and never auto-checks in", async () => {
  const { events, context } = checkoutContext();
  await tapeCallback("handleBlockCheckOut", context)({ guestStayId: "stay-A", roomNumber: "1003" });
  assert.deepEqual(events.filter(([type]) => type === "checkout"), [["checkout", "stay-A", "1003"]]);
  assert.equal(events.some(([type]) => ["selection", "close", "checkin"].includes(type)), false);
});

test("checkout with no stay does not open a tab or clear the selection", async () => {
  const { events, context } = checkoutContext();
  await tapeCallback("handleBlockCheckOut", context)({ roomNumber: "1003" });
  assert.equal(events.length, 0);
});

test("conflict checkout forwards the actual conflicting stay while keeping the draft open", async () => {
  const { events, context } = checkoutContext();
  await conflictCheckoutCallback(context)("conflicting-stay-B", "1004");
  assert.deepEqual(events.filter(([type]) => type === "checkout"), [["checkout", "conflicting-stay-B", "1004"]]);
  assert.equal(events.some(([type]) => ["selection", "close", "checkin"].includes(type)), false);
});

test("opening checkout failure leaves the selected context intact", async () => {
  const { events, context } = checkoutContext();
  context.onCheckOutStay = async () => { throw new Error("tab could not open"); };
  await assert.rejects(tapeCallback("handleBlockCheckOut", context)({ guestStayId: "stay-A", roomNumber: "1003" }), /tab could not open/);
  assert.equal(events.some(([type]) => ["selection", "close", "checkin"].includes(type)), false);
});

test("conflict checkout is unavailable without a checkout continuation", () => {
  const { context } = checkoutContext();
  context.onCheckOutStay = undefined;
  assert.equal(conflictCheckoutCallback(context), undefined);
});

function billingTabCallback(context) {
  const tree = source("../../app/(vietsage)/hotels/[hotelId]/rooms/staff-rooms-client.tsx");
  const element = find(tree, (node) => (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(tree) === "TapeChartView");
  const prop = element.attributes.properties.find((node) => ts.isJsxAttribute(node) && node.name.getText(tree) === "onCheckOutStay");
  assert.ok(prop?.initializer && ts.isJsxExpression(prop.initializer));
  return evaluate(prop.initializer.expression.getText(tree), { hotelId: "hotel-A", URLSearchParams, ...context });
}

function popupContext() {
  const events = [];
  const popup = {
    closed: false,
    location: { pathname: "blank", search: "", replace: (url) => events.push(["navigate", url]) },
    focus: () => events.push(["focus"]),
  };
  const context = {
    window: { open: (...args) => { events.push(["open", ...args]); return popup; } },
    requestInternalApiEnvelope: async () => { events.push(["lookup"]); return { data: { id: "folio-A" } }; },
    showWarningAlert: async () => events.push(["warning"]),
  };
  return { popup, events, context };
}

test("billing tab opens during the click before awaiting the folio lookup", async () => {
  const { events, context } = popupContext();
  let completeLookup;
  context.requestInternalApiEnvelope = () => {
    events.push(["lookup"]);
    return new Promise((resolve) => { completeLookup = resolve; });
  };
  const pending = billingTabCallback(context)("stay-A", "1003");
  assert.deepEqual(events, [["open", "", "vietsage-billing-hotel-A-stay-A"], ["lookup"]]);
  completeLookup({ data: { id: "folio-A" } });
  await pending;
  const target = new URL(events.find(([type]) => type === "navigate")[1], "https://local");
  assert.equal(target.searchParams.get("stayId"), "stay-A");
  assert.equal(target.searchParams.get("folioId"), "folio-A");
  assert.equal(target.searchParams.get("roomNumber"), "1003");
});

test("reusing the same stay's billing tab focuses it without resetting its work", async () => {
  const { popup, events, context } = popupContext();
  popup.location.pathname = "/hotels/hotel-A/billing";
  popup.location.search = "?stayId=stay-A&folioId=folio-A";
  await billingTabCallback(context)("stay-A", "1003");
  assert.deepEqual(events.map(([type]) => type), ["open", "focus"]);
});

test("a blocked billing popup warns without looking up a folio", async () => {
  const { events, context } = popupContext();
  context.window.open = () => { events.push(["blocked"]); return null; };
  await billingTabCallback(context)("stay-A", "1003");
  assert.deepEqual(events.map(([type]) => type), ["blocked", "warning"]);
});

test("folio lookup failure still routes the opened tab to the intended stay", async () => {
  const { events, context } = popupContext();
  context.requestInternalApiEnvelope = async () => { events.push(["lookup"]); throw new Error("offline"); };
  await billingTabCallback(context)("stay-A", "1003");
  const target = new URL(events.find(([type]) => type === "navigate")[1], "https://local");
  assert.equal(target.searchParams.get("stayId"), "stay-A");
  assert.equal(target.searchParams.get("roomNumber"), "1003");
  assert.equal(target.searchParams.has("folioId"), false);
});

test("a tab closed while folio lookup is pending is not navigated afterwards", async () => {
  const { popup, events, context } = popupContext();
  let completeLookup;
  context.requestInternalApiEnvelope = () => new Promise((resolve) => { completeLookup = resolve; });
  const pending = billingTabCallback(context)("stay-A", "1003");
  popup.closed = true;
  completeLookup({ data: { id: "folio-A" } });
  await pending;
  assert.equal(events.some(([type]) => type === "navigate"), false);
});

function returnRefreshEffect(context) {
  const tree = source("./components/tape-chart/tape-chart-view.tsx");
  const effect = find(tree, (node) => ts.isCallExpression(node) && node.expression.getText(tree) === "useEffect" && node.arguments[0]?.getText(tree).includes("const refreshOnReturn"));
  return evaluate(effect.arguments[0].getText(tree), { Promise, ...context });
}

function refreshContext() {
  const events = [];
  const windowListeners = new Map();
  const documentListeners = new Map();
  const document = {
    visibilityState: "visible",
    addEventListener: (event, listener) => documentListeners.set(event, listener),
    removeEventListener: (event, listener) => { if (documentListeners.get(event) === listener) documentListeners.delete(event); },
  };
  const context = {
    selectedBlock: { id: "reservation-A" }, hotelId: "hotel-A", queryClient: {}, document,
    subscribeHotelRoomChanges: () => () => {},
    window: {
      addEventListener: (event, listener) => windowListeners.set(event, listener),
      removeEventListener: (event, listener) => { if (windowListeners.get(event) === listener) windowListeners.delete(event); },
    },
    staffRoomsScope: { invalidate: async () => events.push("rooms") },
    roomPlanScope: { queries: { plan: { invalidateAll: async () => events.push("plan") } } },
  };
  return { context, events, windowListeners, documentListeners };
}

test("focus and visibility return refresh once while pending, then allow the next return", async () => {
  const { context, events, windowListeners, documentListeners } = refreshContext();
  let complete;
  const pending = new Promise((resolve) => { complete = resolve; });
  context.staffRoomsScope.invalidate = () => { events.push("rooms"); return pending; };
  const cleanup = returnRefreshEffect(context)();
  context.document.visibilityState = "hidden";
  documentListeners.get("visibilitychange")();
  assert.equal(events.length, 0);
  context.document.visibilityState = "visible";
  documentListeners.get("visibilitychange")();
  windowListeners.get("focus")();
  assert.deepEqual(events, ["rooms", "plan"]);
  complete();
  await new Promise(setImmediate);
  windowListeners.get("focus")();
  assert.deepEqual(events, ["rooms", "plan", "rooms", "plan"]);
  cleanup();
  assert.equal(windowListeners.size, 0);
  assert.equal(documentListeners.size, 0);
});

test("a failed return refresh releases the pending guard for a later retry", async () => {
  const { context, events, windowListeners } = refreshContext();
  context.staffRoomsScope.invalidate = async () => { events.push("rooms"); throw new Error("offline"); };
  const cleanup = returnRefreshEffect(context)();
  windowListeners.get("focus")();
  await new Promise(setImmediate);
  windowListeners.get("focus")();
  await new Promise(setImmediate);
  assert.deepEqual(events, ["rooms", "plan", "rooms", "plan"]);
  cleanup();
});

test("no selected reservation installs no return-refresh listeners", () => {
  const { context, events, windowListeners, documentListeners } = refreshContext();
  context.selectedBlock = null;
  assert.equal(returnRefreshEffect(context)(), undefined);
  assert.equal(windowListeners.size, 0);
  assert.equal(documentListeners.size, 0);
  assert.equal(events.length, 0);
});

test("a checkout notification refreshes a hidden tab even while a focus refresh is pending", async () => {
  const { context, events, windowListeners } = refreshContext();
  let receive;
  let unsubscribed = false;
  context.subscribeHotelRoomChanges = (hotelId, callback) => {
    assert.equal(hotelId, "hotel-A");
    receive = callback;
    return () => { unsubscribed = true; };
  };
  let complete;
  const pending = new Promise((resolve) => { complete = resolve; });
  context.staffRoomsScope.invalidate = () => { events.push("rooms"); return pending; };
  const cleanup = returnRefreshEffect(context)();
  windowListeners.get("focus")();
  context.document.visibilityState = "hidden";
  receive();
  assert.deepEqual(events, ["rooms", "plan", "rooms", "plan"]);
  complete();
  await new Promise(setImmediate);
  cleanup();
  assert.equal(unsubscribed, true);
});

function tabSync(context = {}) {
  const code = readFileSync(new URL("./utils/hotel-ops-tab-sync.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return vm.runInNewContext(`${js}; exports`, { exports: {}, ...context });
}

function channels() {
  const opened = [];
  class Channel {
    constructor(name) { this.name = name; this.closed = false; opened.push(this); }
    postMessage(data) {
      for (const other of opened) {
        if (other !== this && !other.closed && other.name === this.name) other.onmessage?.({ data });
      }
    }
    close() { this.closed = true; }
  }
  return { opened, api: tabSync({ window: {}, BroadcastChannel: Channel }) };
}

test("a committed change reaches other tabs of the same hotel, not another hotel", () => {
  const { opened, api } = channels();
  let sameHotel = 0;
  let otherHotel = 0;
  const cleanup = api.subscribeHotelRoomChanges("hotel-A", () => { sameHotel++; });
  const cleanupOther = api.subscribeHotelRoomChanges("hotel-B", () => { otherHotel++; });
  api.publishHotelRoomChange("hotel-A");
  assert.equal(sameHotel, 1);
  assert.equal(otherHotel, 0);
  assert.equal(opened[2].closed, true);
  cleanup();
  cleanupOther();
  api.publishHotelRoomChange("hotel-A");
  assert.equal(sameHotel, 1);
});

test("tab notifications ignore malformed and unrelated messages", () => {
  const { opened, api } = channels();
  let changes = 0;
  const cleanup = api.subscribeHotelRoomChanges("hotel-A", () => { changes++; });
  for (const data of [null, "rooms-changed", {}, { type: "other" }]) opened[0].onmessage({ data });
  assert.equal(changes, 0);
  opened[0].onmessage({ data: { type: "rooms-changed" } });
  assert.equal(changes, 1);
  cleanup();
});

test("SSR, unsupported channels and an empty hotel do not block checkout", () => {
  for (const context of [{}, { window: {} }, { window: {}, BroadcastChannel: undefined }]) {
    const api = tabSync(context);
    assert.doesNotThrow(() => api.publishHotelRoomChange("hotel-A"));
    assert.doesNotThrow(() => api.subscribeHotelRoomChanges("hotel-A", () => {})());
  }
  const { opened, api } = channels();
  api.publishHotelRoomChange("");
  api.subscribeHotelRoomChanges("", () => {})();
  assert.equal(opened.length, 0);
});

test("unavailable or failed channel sends cannot turn a successful checkout into an error", () => {
  const blocked = tabSync({ window: {}, BroadcastChannel: class { constructor() { throw new Error("blocked"); } } });
  assert.doesNotThrow(() => blocked.publishHotelRoomChange("hotel-A"));
  assert.doesNotThrow(() => blocked.subscribeHotelRoomChanges("hotel-A", () => {})());
  let closed = false;
  const broken = tabSync({ window: {}, BroadcastChannel: class {
    postMessage() { throw new Error("unavailable"); }
    close() { closed = true; }
  } });
  assert.doesNotThrow(() => broken.publishHotelRoomChange("hotel-A"));
  assert.equal(closed, true);
});
