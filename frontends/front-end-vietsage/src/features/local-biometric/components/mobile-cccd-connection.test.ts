import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tabs = readFileSync(new URL("./biometric-owner-tabs.tsx", import.meta.url), "utf8");
const connection = readFileSync(new URL("./mobile-cccd-connection-panel.tsx", import.meta.url), "utf8");
const testScan = readFileSync(new URL("./mobile-cccd-test-scan-panel.tsx", import.meta.url), "utf8");
const scan = readFileSync(new URL("./mobile-cccd-scan.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("./check-in-workspace.tsx", import.meta.url), "utf8");
const deskStore = readFileSync(new URL("../store/mobile-desk-store.ts", import.meta.url), "utf8");
const mobileScanHook = readFileSync(new URL("../hooks/use-mobile-cccd-scan.ts", import.meta.url), "utf8");

test("phone pairing is configured once on the biometric page", () => {
  assert.match(tabs, /MobileCccdConnectionPanel/);
  assert.doesNotMatch(tabs, /WorkstationConnectionPanel|WorkstationTestScanPanel/);
  assert.match(connection, /Tạo QR kết nối điện thoại/);
  assert.match(connection, /Mã trùng — Cho phép kết nối/);
  assert.match(connection, /Ngắt điện thoại/);
});

test("biometric setup includes a phone test scan without creating a check-in", () => {
  assert.match(tabs, /MobileCccdConnectionPanel[\s\S]*MobileCccdTestScanPanel/);
  assert.match(testScan, /Test quét QR CCCD/);
  assert.match(testScan, /Kết quả chỉ hiển thị tạm thời/);
  assert.match(testScan, /không tạo check-in/);
  assert.match(testScan, /MobileCccdScan/);
  assert.match(testScan, /showSetupLink=\{false\}/);
  assert.match(testScan, /CccdPreview/);
  assert.match(testScan, /Xóa kết quả test/);
  assert.doesNotMatch(testScan, /CheckInWorkspace|onSubmit|localStorage/);
});

test("room check-in only targets an already connected phone", () => {
  assert.doesNotMatch(scan, /Tạo QR kết nối điện thoại/);
  assert.doesNotMatch(scan, /Mã trùng — Cho phép kết nối/);
  assert.doesNotMatch(scan, /Ngắt điện thoại/);
  assert.match(scan, /Kết nối điện thoại trước tại mục Máy quét CCCD/);
  assert.match(scan, /Quét lại vị trí này/);
  assert.doesNotMatch(workspace, /CccdCheckInPanel|HN-212|Đặt thẻ CCCD/);
  assert.match(workspace, /MobileCccdScan|Điện thoại quét QR CCCD/);
  assert.match(mobileScanHook, /if \(!result\?\.success\) \{[\s\S]*action: "discard"[\s\S]*setTargetGeneration/);
  assert.match(mobileScanHook, /\}\)\.catch\(report\)\.finally/);
  assert.match(mobileScanHook, /const dataUpdatedAt = query\.dataUpdatedAt/);
  assert.match(mobileScanHook, /requestId = result\.target\?\.requestId/);
  assert.match(mobileScanHook, /if \(cancelled && requestId\)[\s\S]*action: "discard"/);
  assert.match(mobileScanHook, /return \(\) => \{[\s\S]*cancelled = true;[\s\S]*if \(requestId\)[\s\S]*action: "discard"/);
  assert.equal((mobileScanHook.match(/action: "target"/g) ?? []).length, 1);
  assert.match(mobileScanHook, /if \(!result\?\.success\)[\s\S]*setTargetGeneration\(\(value\) => value \+ 1\)/);
  assert.match(mobileScanHook, /rescan: \(\) => \{[\s\S]*setTargetGeneration\(\(value\) => value \+ 1\)/);
});

test("phone shift keeps the same desktop-tab identity across route changes", () => {
  assert.match(deskStore, /sessionStorage/);
  assert.match(deskStore, /vietsage:cccd-mobile-desk-id/);
});
