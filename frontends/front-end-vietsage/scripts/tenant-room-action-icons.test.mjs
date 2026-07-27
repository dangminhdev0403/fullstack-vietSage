import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const ownerRoomsSource = read(
  "src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/rooms/owner-rooms-client.tsx",
);
const iconSource = read("src/app/(vietsage)/_components/vs-icon.tsx");

test("tenant room actions only use distinct icons supported by VsIcon", () => {
  const actionIcons = [
    "block",
    "task_alt",
    "qr_code",
    "history",
    "visibility_off",
    "verified",
  ];

  for (const icon of actionIcons) {
    assert.match(iconSource, new RegExp(`case "${icon}"`));
    assert.match(ownerRoomsSource, new RegExp(`"${icon}"`));
  }

  assert.doesNotMatch(
    ownerRoomsSource,
    /name="(?:lock|lock_open|sync|power_settings_new|check_circle)"/,
  );
});

test("inactive QR rows render only the activation action", () => {
  assert.match(
    ownerRoomsSource,
    /qrIsActive \? \([\s\S]{0,2400}: showActivate \? \(/,
  );
  assert.doesNotMatch(ownerRoomsSource, /data-action-placeholder=/);
});
