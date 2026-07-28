import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const staffRoomsSource = readFileSync(
  new URL(
    "../src/app/(vietsage)/hotels/[hotelId]/rooms/staff-rooms-client.tsx",
    import.meta.url,
  ),
  "utf8",
);
const ownerQrUtilsSource = readFileSync(
  new URL(
    "../src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/rooms/room-qr-utils.ts",
    import.meta.url,
  ),
  "utf8",
);
const guestQrEntrySource = readFileSync(
  new URL("../src/app/(vietsage)/g/[qrCode]/page.tsx", import.meta.url),
  "utf8",
);

test("occupied frontdesk rooms open a GuestOS QR preview", () => {
  assert.match(
    staffRoomsSource,
    /roomStatus === "occupied"[\s\S]{0,180}setRoomQrPreview/,
  );
  assert.match(staffRoomsSource, /BrandedRoomQr/);
  assert.match(staffRoomsSource, /\/g\/\$\{encodeURIComponent\(qrValue\)\}/);
  assert.match(staffRoomsSource, /document\.body/);
});

test("QR preview reports a missing room QR instead of encoding a fallback value", () => {
  assert.match(staffRoomsSource, /if \(!qrValue\) return null/);
  assert.match(staffRoomsSource, /Phòng chưa có QR GuestOS/);
});

test("room QR links use only the active canonical public code", () => {
  assert.match(ownerQrUtilsSource, /getQrStatus\(room\) !== "ACTIVE"/);
  assert.match(ownerQrUtilsSource, /room\.qr\?\.publicCode\?\.trim\(\)/);
  assert.doesNotMatch(ownerQrUtilsSource, /room\.publicCode\?\.trim\(\)/);
  assert.doesNotMatch(ownerQrUtilsSource, /room\.qrCode\?\.trim\(\)/);
});

test("successful room QR scans open guest services", () => {
  assert.match(guestQrEntrySource, /language \? "\/g\/services" : "\/g\/language"/);
});
