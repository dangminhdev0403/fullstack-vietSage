import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./components/staff-management-client.tsx", import.meta.url),
  "utf8",
);

test("tenant owner can create a hotel-wide housekeeping account", () => {
  assert.match(source, /aria-label="Vai trò nhân viên"/);
  assert.match(source, /data\?\.roles\.map\(\(role\) =>/);
  assert.match(source, /roleIds: \[activeRoleId\]/);
  assert.match(source, /const selectedRoleIsFrontDesk = isFrontDeskRole\(form\.roleId\)/);
  assert.match(source, /roomId: selectedRoleIsFrontDesk \? form\.roomId \|\| undefined : undefined/);
  assert.match(source, /\{selectedRoleIsFrontDesk \? \([\s\S]*?<RoomSearchSelect/);
});
