import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node strip-types requires explicit extensions.
import { checkInRecovery, formatFriendlyCheckInError, formatFriendlyHotelOpsError, isConflictOrStaleError } from "./check-in-error.ts";

test("permission errors take precedence over room conflicts", () => {
  const message = formatFriendlyCheckInError({ status: 403, data: { detail: "ROOM_ALREADY_HAS_ACTIVE_STAY_OR_FOLIO" } });
  assert.equal(checkInRecovery(message).action, "permission");
  assert.equal(checkInRecovery("Bạn không có quyền thực hiện thao tác này.").action, "permission");
  assert.doesNotMatch(message, /403|FORBIDDEN/);
});

test("folio conflicts offer settlement, stale assignments offer refresh", () => {
  assert.equal(checkInRecovery(formatFriendlyCheckInError(new Error("ROOM_ALREADY_HAS_ACTIVE_STAY_OR_FOLIO"))).action, "settlement");
  assert.equal(
    checkInRecovery(formatFriendlyCheckInError({ data: { data: { code: "OVERDUE_STAY_HAS_UNPAID_FOLIO" } } })).action,
    "settlement",
  );
  for (const code of ["STALE_RESERVATION_RECORD", "STALE_ROOM_ASSIGNMENT", "ROOM_CHECK_IN_CONFLICT", "ALREADY_CHECKED_IN"]) {
    assert.equal(checkInRecovery(formatFriendlyCheckInError(new Error(code))).action, "refresh", code);
  }
});

test("stale and conflict codes are detected uniformly across error shapes", () => {
  assert.equal(isConflictOrStaleError({ data: { code: "STALE_RESERVATION_RECORD" } }), true);
  assert.equal(isConflictOrStaleError({ response: { error: { code: "STALE_ROOM_ASSIGNMENT" } } }), true);
  assert.equal(isConflictOrStaleError(new Error("Dữ liệu đặt phòng đã thay đổi ở phiên khác")), true);
  assert.doesNotMatch(
    formatFriendlyHotelOpsError({ data: { code: "OVERDUE_STAY_HAS_UNPAID_FOLIO" } }),
    /OVERDUE_STAY_HAS_UNPAID_FOLIO/,
  );
});

test("readiness and capacity issues offer a room alternative", () => {
  for (const code of ["ROOM_NOT_READY_FOR_CHECK_IN", "ROOM_QR", "ROOM_CAPACITY_OVERFLOW"]) {
    assert.equal(checkInRecovery(formatFriendlyCheckInError(new Error(code))).action, "swap", code);
  }
});

test("unknown failures never suggest collecting money or moving a guest", () => {
  assert.equal(checkInRecovery("Không kết nối được máy chủ.").action, "retry");
});
