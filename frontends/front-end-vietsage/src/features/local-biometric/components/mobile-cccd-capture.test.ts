import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./mobile-cccd-capture.tsx", import.meta.url), "utf8");

test("mobile capture focuses on QR CCCD and removes phone passport capture", () => {
  assert.match(source, /import QrScanner from "qr-scanner"/);
  assert.match(source, /new QrScanner\(/);
  assert.match(source, /parseCccdQr/);
  assert.match(source, /Mở camera quét QR/);
  assert.doesNotMatch(source, /Chụp hộ chiếu/);
  assert.doesNotMatch(source, /capture="environment"/);
  assert.doesNotMatch(source, /handlePassport/);
  assert.match(source, /action:\s*"submit"/);
  assert.doesNotMatch(source, /\/api\/cccd-mobile\/ocr|scanImage\(/);
});

test("mobile QR camera cleanup stops tracks", () => {
  assert.match(source, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(source, /scannerRef\.current\.destroy\(\)/);
});
