import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { canResetFrontdeskPassword, resetResponseHeaders, validatePasswordChange } from "./password-security.ts";

test("password change validation rejects weak, reused, and mismatched passwords", () => {
  assert.equal(validatePasswordChange({ currentPassword: "oldSecret1!", newPassword: "short", confirmPassword: "short" }), "Mật khẩu mới cần tối thiểu 8 ký tự.");
  assert.equal(validatePasswordChange({ currentPassword: "oldSecret1!", newPassword: "12345678", confirmPassword: "12345678" }), "Mật khẩu mới cần chữ hoa, chữ thường, chữ số và ký tự đặc biệt.");
  assert.equal(validatePasswordChange({ currentPassword: "oldSecret1!", newPassword: "oldSecret1!", confirmPassword: "oldSecret1!" }), "Mật khẩu mới phải khác mật khẩu hiện tại.");
  assert.equal(validatePasswordChange({ currentPassword: "oldSecret1!", newPassword: "newSecret1!", confirmPassword: "newSecret2!" }), "Xác nhận mật khẩu không khớp.");
  assert.equal(validatePasswordChange({ currentPassword: "oldSecret1!", newPassword: "newSecret1!", confirmPassword: "newSecret1!" }), null);
});

test("frontdesk reset is exposed only for HOTEL_FRONTDESK role and no-store headers", () => {
  assert.equal(canResetFrontdeskPassword(["HOTEL_MANAGER", "HOTEL_HOUSEKEEPING"]), false);
  assert.equal(canResetFrontdeskPassword(["HOTEL_FRONTDESK", "HOTEL_MANAGER"]), false);
  assert.equal(canResetFrontdeskPassword(["HOTEL_FRONTDESK"]), true);
  assert.deepEqual(resetResponseHeaders(), { "Cache-Control": "no-store" });
});
