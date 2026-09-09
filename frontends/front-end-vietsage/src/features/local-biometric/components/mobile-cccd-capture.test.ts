import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./mobile-cccd-capture.tsx", import.meta.url), "utf8");

test("mobile capture keeps QR CCCD and restores native passport capture", () => {
  assert.match(source, /import QrScanner from "qr-scanner"/);
  assert.match(source, /new QrScanner\(/);
  assert.match(source, /parseCccdQr/);
  assert.match(source, /quét QR CCCD/);
  assert.match(source, /Chụp hộ chiếu/);
  assert.match(source, /type="file"/);
  assert.match(source, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(source, /capture="environment"/);
  assert.match(source, /sendDocument/);
  assert.match(source, /passportTransfer\.current \?\?= safeRandomUuid\(\)/);
  assert.doesNotMatch(source, /sendDocument\(requestId, transfer\.current/);
  assert.match(source, /action:\s*"submit"/);
  assert.doesNotMatch(source, /\/api\/cccd-mobile\/ocr|scanImage\(/);
});

test("mobile QR camera cleanup stops tracks", () => {
  assert.match(source, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(source, /scannerRef\.current\.destroy\(\)/);
});
