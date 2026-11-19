import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as contract from "./types/kbtt-contract.ts";

class HttpError extends Error {
  constructor(status, data) { super(`Request failed with status ${status}`); this.status = status; this.data = data; }
}
const source = readFileSync(new URL("./components/kbtt-connection-format.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", compiled)((name) => {
  if (name.includes("http-error")) return { HttpError };
  if (name.includes("kbtt-contract")) return contract;
  throw new Error(`Unexpected dependency ${name}`);
}, mod, mod.exports);

test("BCA action errors retain backend detail instead of misreporting invalid hotel", () => {
  assert.equal(mod.exports.errorText(new HttpError(400, { data: { detail: "Đã có một phiên đang chạy." } })), "Đã có một phiên đang chạy.");
  assert.equal(mod.exports.errorText(new HttpError(400, null)), "Yêu cầu không hợp lệ. Vui lòng kiểm tra dữ liệu và thử lại.");
});
test("BCA action errors do not expose credential details", () => {
  const text = mod.exports.errorText(new HttpError(400, { data: { detail: "password=fixture-secret" } }));
  assert.doesNotMatch(text, /fixture-secret/);
});

test("formatVnDateInput preserves day/month/year segments without shifting digits into year when editing", () => {
  const wsSource = readFileSync(new URL("../local-biometric/components/check-in-workspace.tsx", import.meta.url), "utf8");
  // Extract formatVnDateInput function body
  const fnMatch = wsSource.match(/export function formatVnDateInput\([\s\S]*?\n\}/);
  assert.ok(fnMatch, "formatVnDateInput should exist in check-in-workspace.tsx");
  const fnCompiled = ts.transpileModule(fnMatch[0], { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const wsMod = { exports: {} };
  new Function("exports", fnCompiled)(wsMod.exports);
  const format = wsMod.exports.formatVnDateInput;

  // Editing day inside 20/11/2026
  assert.equal(format("2/11/2026", "20/11/2026"), "2/11/2026");
  assert.equal(format("25/11/2026", "2/11/2026"), "25/11/2026");
  assert.equal(format("11/11/2026", "20/11/2026"), "11/11/2026");

  // Editing month inside 20/11/2026
  assert.equal(format("20/1/2026", "20/11/2026"), "20/1/2026");
  assert.equal(format("20/12/2026", "20/1/2026"), "20/12/2026");

  // Editing year inside 20/11/2026
  assert.equal(format("20/11/2025", "20/11/2026"), "20/11/2025");
  assert.equal(format("20/11/202", "20/11/2026"), "20/11/202");

  // Typing sequentially from empty
  assert.equal(format("2", ""), "2");
  assert.equal(format("20", "2"), "20/");
  assert.equal(format("20/1", "20/"), "20/1");
  assert.equal(format("20/11", "20/1"), "20/11/");
  assert.equal(format("20/11/2026", "20/11/202"), "20/11/2026");
});
