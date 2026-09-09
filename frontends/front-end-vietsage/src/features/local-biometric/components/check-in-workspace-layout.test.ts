import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(new URL("./check-in-workspace.tsx", import.meta.url), "utf8");
const preview = readFileSync(new URL("./cccd-preview.tsx", import.meta.url), "utf8");

test("check-in workspace presents a guided identity-document flow", () => {
  assert.match(workspace, /data-ui="check-in-progress"/);
  assert.match(workspace, /Quét giấy tờ/);
  assert.match(workspace, /Kiểm tra/);
  assert.match(workspace, /Hoàn tất/);
  assert.match(workspace, /data-ui="room-summary"/);
  assert.match(workspace, /data-ui="stay-form"/);
});

test("check-in workspace keeps content reachable and actions responsive", () => {
  assert.match(workspace, /max-h-\[calc\(100dvh-48px\)\]/);
  assert.match(workspace, /md:max-w-\[1400px\]/);
  assert.doesNotMatch(workspace, /max-w-\[880px\]/);
  assert.match(workspace, /min-h-0 flex-1 overflow-y-auto/);
  assert.match(workspace, /flex-col-reverse[^\"]*sm:flex-row/);
  assert.match(workspace, /lg:grid-cols-\[minmax\(0,3fr\)_minmax\(340px,2\.2fr\)\]/);
  assert.match(workspace, /data-ui="sticky-actions"/);
});

test("successful capture changes hierarchy from scan action to verification", () => {
  assert.match(workspace, /Điện thoại quét QR CCCD/);
  assert.doesNotMatch(workspace, /<CccdPreview|buildCccdPreviewModel/);
  assert.match(workspace, /Dữ liệu giấy tờ chỉ xử lý tạm thời/);
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

test("workspace maps a multi-file MRZ batch to consecutive guest slots", () => {
  assert.match(workspace, /<MobileCccdScan/);
  assert.match(workspace, /<DesktopDocumentOcrUpload\s+hotelId=\{hotelId\}\s+onCaptures=\{handleDocumentCaptures\}/);
  assert.match(workspace, /const targetSlot = occupantIndex \+ 1/);
  assert.match(workspace, /while \(next\.length <= occupantIndex\)/);
});

test("workspace retains exact phone QR wording for phone block and uses CCCD / hộ chiếu for combined section", () => {
  assert.match(workspace, /Điện thoại quét QR CCCD/);
  assert.match(workspace, /CCCD \/ [hH]ộ chiếu/);
});

test("workspace renders editable DOB and sex fields for primary guest and occupants", () => {
  assert.match(workspace, /ciw-dob/);
  assert.match(workspace, /ciw-gender/);
  assert.match(workspace, /occ-dob-/);
  assert.match(workspace, /occ-gender-/);
  assert.match(workspace, /type="date"/);
});

test("handleCapture preserves existing manual fields when incoming OCR values are blank or undefined", () => {
  assert.match(workspace, /guestDisplayName:\s*nextCapture\.guestDisplayName\?\.trim\(\)\s*\|\|\s*current\.guestDisplayName/);
  assert.match(workspace, /guestIdentityNumber:\s*nextCapture\.guestIdentityNumber\?\.trim\(\)\s*\|\|\s*current\.guestIdentityNumber/);
  assert.match(workspace, /guestDateOfBirth:\s*nextCapture\.guestDateOfBirth\?\.trim\(\)\s*\|\|\s*current\.guestDateOfBirth/);
  assert.match(workspace, /guestGender:\s*nextCapture\.guestGender\?\.trim\(\)\s*\|\|\s*current\.guestGender/);
  assert.match(workspace, /fullName:\s*nextCapture\.guestDisplayName\?\.trim\(\)\s*\|\|\s*(?:existing|next\[occupantIdx\])\.fullName/);
  assert.match(workspace, /identityNumber:\s*nextCapture\.guestIdentityNumber\?\.trim\(\)\s*\|\|\s*(?:existing|next\[occupantIdx\])\.identityNumber/);
  assert.match(workspace, /dateOfBirth:\s*nextCapture\.guestDateOfBirth\?\.trim\(\)\s*\|\|\s*(?:existing|next\[occupantIdx\])\.dateOfBirth/);
  assert.match(workspace, /gender:\s*nextCapture\.guestGender\?\.trim\(\)\s*\|\|\s*(?:existing|next\[occupantIdx\])\.gender/);
});

test("handleClose dirty detection checks changed nationality, residencePlace, and non-empty occupants", () => {
  assert.match(workspace, /fields\.guestNationality !== \(initialStayFields\?\.guestNationality \|\| ""\)/);
  assert.match(workspace, /fields\.guestResidencePlace !== \(initialStayFields\?\.guestResidencePlace \|\| ""\)/);
  assert.match(workspace, /occupants\.some\(\(occ\)\s*=>[\s\S]*occ\.fullName\?\.trim\(\)[\s\S]*occ\.identityNumber\?\.trim\(\)/);
  assert.match(workspace, /hasNonEmptyOccupant/);
});


test("owner room QR modal does not display raw QR URL text below QR image", () => {
  const ownerRoomsClient = readFileSync(new URL("../../../app/(vietsage)/owner/(hotel)/hotels/[hotelId]/rooms/owner-rooms-client.tsx", import.meta.url), "utf8");
  assert.match(ownerRoomsClient, /BrandedRoomQr/);
  assert.doesNotMatch(ownerRoomsClient, /<p[^>]*>\s*\{getGuestQrUrl\(selectedQrRoom,\s*clientOrigin\)\}\s*<\/p>/);
});

test("guest slot selector tabs provide clear button affordances and green verified checkmarks", () => {
  assert.match(workspace, /Vị trí quét:/);
  assert.match(workspace, /Khách 1 \(Đại diện\)/);
  assert.match(workspace, /Khách \{slotIdx \+ 1\}/);
  assert.match(workspace, /text-emerald-600/);
  assert.match(workspace, /text-emerald-700/);
  assert.match(workspace, /Thêm người ở cùng/);
  assert.match(workspace, /border-dashed/);
});

test("first passport upload does not duplicate primary guest into occupants", () => {
  assert.match(workspace, /offset === primaryCaptureIndex/);
  assert.match(workspace, /isSameIdentity\(capture,\s*fields\.guestIdentityNumber/);
});
