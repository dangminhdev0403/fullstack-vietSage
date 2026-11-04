import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

function source(path) {
  return ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function find(tree, predicate) {
  let result;
  function visit(node) {
    if (!result && predicate(node)) result = node;
    if (!result) ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(result, "source node exists");
  return result;
}
function evaluate(code, context = {}) {
  const js = ts.transpileModule(`const evaluated = (${code});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return vm.runInNewContext(`${js}; evaluated`, context);
}
function declaration(path, name, context) {
  const tree = source(path);
  const fn = find(tree, (node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  return evaluate(fn.getText(tree).replace(/^export /, ""), context);
}
function prop(path, tag, name, context) {
  const tree = source(path);
  const element = find(tree, (node) => (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(tree) === tag);
  const attribute = element.attributes.properties.find((node) => ts.isJsxAttribute(node) && node.name.getText(tree) === name);
  assert.ok(attribute?.initializer && ts.isJsxExpression(attribute.initializer));
  return evaluate(attribute.initializer.expression.getText(tree), context);
}

test("conflict checkout forwards selected stay E rather than original D", () => {
  let route;
  const callback = prop("./components/front-desk-room-detail-panel.tsx", "EditReservationModal", "onCheckOutConflictingStay", {
    canViewBilling: true, canCheckoutBilling: true, canCheckOutStay: false,
    URLSearchParams, hotelId: "hotel", setIsEditModalOpen() {}, onClose() {},
    router: { push(value) { route = value; } },
  });
  callback("stay-E", "QA04-E");
  const url = new URL(route, "https://local");
  assert.equal(url.searchParams.get("stayId"), "stay-E");
  assert.equal(url.searchParams.get("roomNumber"), "QA04-E");
  assert.equal(url.searchParams.get("roomId"), null);
});
test("conflict checkout remains unavailable without billing permission", () => {
  assert.equal(prop("./components/front-desk-room-detail-panel.tsx", "EditReservationModal", "onCheckOutConflictingStay", {
    canViewBilling: false, canCheckoutBilling: true,
  }), undefined);
});
test("assignment continuation receives authoritative updatedAt, not captured arrival", async () => {
  const fresh = { id: "reservation", roomId: "H", updatedAt: "new" };
  let received;
  const callback = prop("./components/daily-movements-modal.tsx", "AssignOrSwapRoomSubModal", "onSuccess", {
    isAutoCheckInAfterAssign: true, hotelId: "hotel", assigningArrival: { id: "reservation", updatedAt: "old" },
    staffRoomsRepository: { getReservation: async () => fresh },
    invalidateHotelRealtimeQueries: async () => {}, queryClient: {}, onRefreshData: async () => {},
    setAssigningArrival() {}, setIsAutoCheckInAfterAssign() {}, onCheckInArrival(value) { received = value; },
  });
  await callback("H");
  assert.equal(received, fresh);
});
test("failed authoritative fetch cannot open check-in with old version", async () => {
  let opened = false;
  const callback = prop("./components/daily-movements-modal.tsx", "AssignOrSwapRoomSubModal", "onSuccess", {
    isAutoCheckInAfterAssign: true, hotelId: "hotel", assigningArrival: { id: "reservation" },
    staffRoomsRepository: { getReservation: async () => { throw new Error("offline"); } },
    onCheckInArrival() { opened = true; },
  });
  await assert.rejects(callback("H"), /offline/);
  assert.equal(opened, false);
});
test("blocked physical room cannot be advertised as reserved or ready", () => {
  const resolve = declaration("./components/front-desk-room-detail-panel.tsx", "resolveRoomStatusModel");
  for (const physicalStatus of ["BLOCKED", "MAINTENANCE", "OUT_OF_SERVICE"]) {
    const model = resolve({ physicalStatus, projectedStatus: "RESERVED" });
    assert.ok(["blocked", "maintenance"].includes(model.operational.status));
  }
});
test("zero room price survives number and decimal-string representations", () => {
  const extract = declaration("../../app/(vietsage)/hotels/[hotelId]/rooms/staff-rooms-client.tsx", "extractRoomBasePrice");
  for (const price of [0, "0", "0.00"]) assert.equal(extract({ price, roomType: { basePrice: 900000 } }), 0);
  for (const price of [-1, Infinity, ""]) assert.equal(extract({ price }), null);
});
test("dirty room takes precedence over today's reservation, without masking a future projection", () => {
  const resolve = declaration("./components/front-desk-room-detail-panel.tsx", "resolveRoomStatusModel");
  for (const physicalStatus of ["PROCESSING", "DIRTY"]) {
    const room = { physicalStatus, projectedStatus: "RESERVED" };
    assert.equal(resolve(room).operational.status, "processing");
    assert.equal(resolve(room, { isFuture: true }).operational.status, "reserved");
  }
});
test("blank optional companion identity and DOB are omitted", () => {
  const tree = source("../local-biometric/components/check-in-workspace.tsx");
  const arrow = find(tree, (node) => ts.isArrowFunction(node) && node.parameters[0]?.name.getText(tree) === "occupant" && node.getText(tree).includes("rawOccDob"));
  const normalize = evaluate(arrow.getText(tree), {
    document: { getElementById: () => null }, toIsoDate: () => "", matchBcaNationalityCode: () => "VNM", nationalities: [],
  });
  const result = JSON.parse(JSON.stringify(normalize({ fullName: "Companion", identityNumber: "  ", dateOfBirth: "" }, 0)));
  assert.equal("identityNumber" in result, false);
  assert.equal("dateOfBirth" in result, false);
});

for (const early of [true, false]) {
  for (const accept of [true, false]) {
    test(`group ${early ? "early" : "late"} exception requires explicit ${accept ? "acceptance" : "cancellation"}`, async () => {
      const calls = [];
      const error = new Error(early ? "EARLY_CHECK_IN_CONFIRMATION_REQUIRED" : "LATE_CHECK_IN_CONFIRMATION_REQUIRED");
      const run = declaration("./components/group-check-in-modal.tsx", "checkInGroupRoom", {
        staffRoomsRepository: { checkInReservation: async (_hotel, _id, payload) => {
          calls.push(payload);
          if (calls.length === 1) throw error;
          return { stayId: "stay" };
        } },
        isEarlyCheckInError: () => early, isLateCheckInError: () => !early,
        toDisplayVnDate: (value) => value,
        showConfirmDialog: async (options) => {
          assert.match(options.text, /QA04-J/);
          assert.match(options.text, /2026-11-05/);
          return { isConfirmed: accept };
        },
      });
      const task = run("hotel", { reservationId: "res", roomNumber: "QA04-J", plannedCheckInAt: "2026-11-05T07:00:00Z" }, { expectedUpdatedAt: "version" }, "QA Guest");
      if (accept) {
        assert.equal((await task).stayId, "stay");
        assert.equal(calls[1][early ? "confirmEarlyCheckIn" : "confirmLateCheckIn"], true);
        assert.equal(calls[1].expectedUpdatedAt, "version");
      } else await assert.rejects(task, (value) => value === error);
      assert.equal(calls.length, accept ? 2 : 1);
      assert.equal(calls[0].confirmEarlyCheckIn, undefined);
      assert.equal(calls[0].confirmLateCheckIn, undefined);
    });
  }
}
