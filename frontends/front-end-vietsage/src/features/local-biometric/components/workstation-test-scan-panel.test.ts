import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./workstation-test-scan-panel.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../../../app/(vietsage)/owner/(hotel)/hotels/[hotelId]/biometric/page.tsx", import.meta.url), "utf8");

test("owner can test a CCCD scan without selecting a room or persisting a stay", () => {
  assert.match(source, /Test quét CCCD/);
  assert.match(source, /CccdCheckInPanel/);
  assert.match(source, /CccdPreview/);
  assert.match(source, /buildCccdPreviewModel/);
  assert.doesNotMatch(source, /fetch\(|checkIn|roomId|stayId|Hoàn tất/);
  assert.match(page, /WorkstationTestScanPanel/);
});

test("test scan explains its volatile privacy boundary", () => {
  assert.match(source, /chỉ hiển thị tạm thời/);
  assert.match(source, /không tạo check-in/);
  assert.match(source, /không lưu/);
});