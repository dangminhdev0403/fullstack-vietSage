import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// @ts-expect-error Node strip-types requires explicit extension.
import { parseLocalMrzBatch, parseLocalMrzResult, recognizeDesktopIdentityDocuments } from "./identity-document-ocr.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "../../../..");

test("validates local MRZ bridge responses before filling the form", () => {
  const result = parseLocalMrzResult({
    documentKind: "passport",
    identityNumber: "L898902C3",
    fullName: "ERIKSSON ANNA MARIA",
    nationality: "GBR",
  });
  assert.equal(result.guestIdentityNumber, "L898902C3");
  const visa = parseLocalMrzResult({
    documentKind: "visa",
    format: "MRVA",
    mrzValid: false,
    identityNumber: "VISA123",
    fullName: "VISA HOLDER",
  });
  assert.equal(visa.documentKind, "visa");
  assert.equal(visa.mrzValid, false);
  assert.throws(() => parseLocalMrzResult({ documentKind: "passport", identityNumber: "../bad", fullName: "X" }));
});

test("server OpenMRZ rejection is surfaced without fallback", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { protocol: "http:" } } });
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "Không tìm thấy MRZ hộ chiếu hợp lệ" }), {
    status: 422,
    headers: { "Content-Type": "application/json" },
  });
  try {
    await assert.rejects(
      () => recognizeDesktopIdentityDocuments([new File(["image"], "passport.jpg", { type: "image/jpeg" })], "hotel-1"),
      /Không tìm thấy MRZ hộ chiếu hợp lệ/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

test("parses isolated success and failure items from OpenMRZ batch", () => {
  const items = parseLocalMrzBatch({ results: [
    { success: true, documentKind: "passport", identityNumber: "PASS123", fullName: "PASSPORT HOLDER" },
    { success: false, code: "IMAGE_TOO_BLURRY", error: "Ảnh bị mờ" },
  ] });
  assert.equal(items.length, 2);
  assert.equal(items[0].success, true);
  assert.equal(items[1].success, false);
});

test("browser uses the authenticated hotel-scoped BFF, never workstation loopback", () => {
  const source = fs.readFileSync(new URL("./identity-document-ocr.ts", import.meta.url), "utf8");
  const routePath = path.join(frontendRoot, "src/app/api/cccd-mobile/hotels/[hotelId]/ocr/route.ts");
  const route = fs.readFileSync(routePath, "utf8");
  assert.doesNotMatch(source, /tesseract|from ["']mrz["']|recognizeIdentityDocument|parseTd3PassportMrz|parseCccdOcrText/i);
  assert.doesNotMatch(source, /127\.0\.0\.1:8787|biometric-bridge/i);
  assert.match(source, /\/api\/cccd-mobile\/hotels\/\$\{encodeURIComponent\(hotelId\)\}\/ocr/);
  assert.match(route, /auth\(\)/);
  assert.match(route, /authorizeHotelWorkstation\(session, hotelId\)/);
  assert.match(route, /OPEN_MRZ_BASE_URL/);
  assert.match(route, /limitedBytes\(request, 16 \* 1024 \* 1024\)/);
  assert.match(route, /\.formData\(\)/);
  assert.match(route, /files\.length !== 1/);
  assert.match(route, /image\/jpeg/);
  assert.match(route, /const jpeg =/);
  assert.equal(fs.existsSync(path.join(frontendRoot, "public/ocr")), false);
});
