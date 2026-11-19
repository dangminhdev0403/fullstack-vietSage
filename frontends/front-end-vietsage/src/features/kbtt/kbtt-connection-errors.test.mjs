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
