import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./mobile-cccd-capture.tsx", import.meta.url), "utf8");

test("mobile capture sends QR-derived fields without uploading identity images", () => {
  assert.match(source, /import QrScanner from "qr-scanner"/);
  assert.match(source, /new QrScanner\(/);
  assert.match(source, /parseCccdQr/);
  assert.match(source, /Quét mã QR CCCD/);
  assert.match(source, /action:\s*"submit"/);
  assert.doesNotMatch(source, /type="file"|FormData|\/api\/cccd-mobile\/ocr|scanImage\(/);
});

test("mobile QR camera cleanup stops tracks", () => {
  assert.match(source, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(source, /scannerRef\.current\.destroy\(\)/);
});
