import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./desktop-document-ocr-upload.tsx", import.meta.url), "utf8");

test("desktop MRZ upload supports multiple files through only the local bridge helper", () => {
  assert.match(source, /type="file"/);
  assert.match(source, /\bmultiple\b/);
  assert.match(source, /Array\.from\(event\.target\.files/);
  assert.match(source, /recognizeDesktopIdentityDocuments\(accepted\)/);
  assert.match(source, /Ảnh hộ chiếu \/ thị thực/);
  assert.match(source, /recognizeDesktopIdentityDocuments\s*\(\s*accepted\s*\)/);
  assert.doesNotMatch(source, /OCR CCCD|recognizeIdentityDocument|\bfetch\s*\(|\baxios\b|<canvas\b|<img\b/);
});

test("desktop upload validates each image and isolates per-file failures", () => {
  assert.match(source, /15\s*\*\s*1024\s*\*\s*1024/);
  assert.match(source, /for \(const item of await recognizeDesktopIdentityDocuments\(accepted\)\)/);
  assert.match(source, /captures\.push/);
  assert.match(source, /errors\.push/);
  assert.match(source, /processingRef\.current/);
  assert.match(source, /onCaptures\(captures\)/);
  assert.match(source, /finally\s*\{[\s\S]*clearInput/);
});

test("desktop upload retains accessible status and error regions", () => {
  assert.match(source, /role="status"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /role="alert"/);
  assert.match(source, /aria-live="assertive"/);
  assert.match(source, /catch \(caught\)[\s\S]*setError\(caught instanceof Error \? caught\.message/);
});
