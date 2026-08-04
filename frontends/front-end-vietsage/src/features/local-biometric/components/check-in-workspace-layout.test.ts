import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(new URL("./check-in-workspace.tsx", import.meta.url), "utf8");
const preview = readFileSync(new URL("./cccd-preview.tsx", import.meta.url), "utf8");

test("check-in workspace presents a guided CCCD-first flow", () => {
  assert.match(workspace, /data-ui="check-in-progress"/);
  assert.match(workspace, /Quét CCCD/);
  assert.match(workspace, /Kiểm tra/);
  assert.match(workspace, /Hoàn tất/);
  assert.match(workspace, /data-ui="room-summary"/);
  assert.match(workspace, /data-ui="stay-form"/);
});

test("check-in workspace keeps content reachable and actions responsive", () => {
  assert.match(workspace, /max-h-\[calc\(100dvh-48px\)\]/);
  assert.match(workspace, /min-h-0 flex-1 overflow-y-auto/);
  assert.match(workspace, /flex-col-reverse[^\"]*sm:flex-row/);
  assert.match(workspace, /lg:grid-cols-\[minmax\(0,3fr\)_minmax\(340px,2\.2fr\)\]/);
  assert.match(workspace, /data-ui="sticky-actions"/);
});

test("successful capture changes hierarchy from scan action to verification", () => {
  assert.match(workspace, /Máy quét CCCD/);
  assert.match(workspace, /Xác thực thành công/);
  assert.match(workspace, /Dữ liệu CCCD chỉ xử lý tạm thời/);
});

test("CCCD preview gives portrait and long identity values safe geometry", () => {
  assert.match(preview, /sm:grid-cols-\[minmax\(140px,180px\)_minmax\(0,1fr\)\]/);
  assert.match(preview, /object-contain/);
  assert.match(preview, /break-words/);
  assert.match(preview, /sm:col-span-2/);
});

test("volatile portrait is previewed but never added to stay fields", () => {
  assert.match(workspace, /guestIdentityNumber: nextCapture\.guestIdentityNumber/);
  assert.doesNotMatch(workspace, /portraitDataUrl:\s*nextCapture/);
});

test("check-in workspace renders manual input fields for nationality and residence place", () => {
  assert.match(workspace, /Quốc tịch/);
  assert.match(workspace, /Quê quán/);
  assert.match(workspace, /ciw-nationality/);
  assert.match(workspace, /ciw-residence/);
  assert.match(workspace, /occ-nationality-/);
  assert.match(workspace, /occ-residence-/);
});

test("scan capture merges non-empty nationality/residencePlace and preserves existing manual values", () => {
  assert.match(workspace, /nextCapture\.guestNationality\?\.\s*trim\(\)\s*\|\|\s*current\.guestNationality/);
  assert.match(workspace, /nextCapture\.guestResidencePlace\?\.\s*trim\(\)\s*\|\|\s*current\.guestResidencePlace/);
});

test("owner room QR modal does not display raw QR URL text below QR image", () => {
  const ownerRoomsClient = readFileSync(new URL("../../../app/(vietsage)/owner/(hotel)/hotels/[hotelId]/rooms/owner-rooms-client.tsx", import.meta.url), "utf8");
  assert.match(ownerRoomsClient, /BrandedRoomQr/);
  assert.doesNotMatch(ownerRoomsClient, /<p[^>]*>\s*\{getGuestQrUrl\(selectedQrRoom,\s*clientOrigin\)\}\s*<\/p>/);
});
