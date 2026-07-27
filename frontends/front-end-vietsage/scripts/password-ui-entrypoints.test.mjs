import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const topbar = read("src/app/(vietsage)/_components/vs-top-bar.tsx");
const changePasswordDialog = read("src/features/account/security/change-password-dialog.tsx");
const owners = read("src/app/(vietsage)/admin/users/tenant-owners-client.tsx");
const staff = read("src/features/staff-management/components/staff-management-client.tsx");
const secretDialog = read("src/features/account/security/one-time-password-dialog.tsx");

test("authenticated topbar exposes self-service password change", () => {
  assert.match(topbar, /ChangePasswordDialog/);
  assert.match(changePasswordDialog, /Đổi mật khẩu/);
  assert.match(changePasswordDialog, /createPortal/);
  assert.match(changePasswordDialog, /document\.body/);
  assert.match(changePasswordDialog, /100dvh/);
<<<<<<< ours
=======
  assert.match(changePasswordDialog, /visibility_off/);
  assert.match(changePasswordDialog, /aria-pressed/);
>>>>>>> theirs
});

test("super admin can reset tenant-owner password from both desktop and mobile actions", () => {
  assert.match(owners, /useResetTenantOwnerPassword/);
  assert.ok((owners.match(/Cấp lại mật khẩu/g) ?? []).length >= 2);
  assert.match(owners, /OneTimePasswordDialog/);
});

test("tenant manager can reset only HOTEL_FRONTDESK users", () => {
  assert.match(staff, /scope\.surface === "owner" && canResetFrontdeskPassword\(user\.roles\.map\(\(role\) => role\.code\)\)/);
  assert.ok((staff.match(/Cấp lại mật khẩu/g) ?? []).length >= 2);
  assert.match(staff, /OneTimePasswordDialog/);
});

test("temporary password dialog clears the secret on every close", () => {
  assert.match(secretDialog, /onClose\(\)/);
  assert.match(secretDialog, /temporaryPassword/);
  assert.doesNotMatch(secretDialog, /localStorage|sessionStorage|console\./);
});
