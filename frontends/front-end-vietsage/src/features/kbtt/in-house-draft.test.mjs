import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { saveKbttDraftPayloadSchema } from "./types/kbtt-contract.ts";

const source = readFileSync(new URL("./in-house-draft.ts", import.meta.url), "utf8");
const module = { exports: {} };
new Function("require", "module", "exports", ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)((name) => {
  assert.equal(name, "./types/kbtt-contract");
  return { saveKbttDraftPayloadSchema };
}, module, module.exports);
const { buildInlineDraft } = module.exports;
const row = { source: "VIETSAGE", kind: "VIETNAMESE", occupantId: "test-1", status: "NOT_FOUND", declarationStatus: "FAILED",
  draftPayload: { hoTen: "Khách Mẫu", soGiayTo: "000000000001", loaiGiayTo: 1, lyDoCuTru: 1, ghiChu: "Giữ nguyên", soPhong: "101", gioiTinh: "M", ngayThangNamSinhStr: "1990-01-01", ngayDenCsltStr: "2026-11-17 09:00:00", ngayDiDuKienStr: "2026-11-19 11:00:00" } };

test("inline save merges edits without losing provider-specific fields or mutating the original", () => {
  const result = buildInlineDraft(row, { soGiayTo: "000000000002", gioiTinh: "F" });
  assert.equal(result.data.soGiayTo, "000000000002");
  assert.equal(result.data.ghiChu, "Giữ nguyên");
  assert.equal(result.data.soPhong, "101");
  assert.equal(row.draftPayload.soGiayTo, "000000000001");
  assert.equal(result.allowSubmittedEdit, undefined);
});

test("readonly, matched and uncertain states refuse inline writes", () => {
  for (const declarationStatus of ["UNKNOWN", "SUBMITTED", "CANCELLED"]) {
    assert.throws(() => buildInlineDraft({ ...row, declarationStatus }, { hoTen: "Khách Khác" }));
  }
  for (const override of [{ source: "BCA_ONLY" }, { status: "MATCHED" }, { occupantId: null }, { kind: null }, { draftPayload: null }]) {
    assert.throws(() => buildInlineDraft({ ...row, ...override }, { hoTen: "Khách Khác" }));
  }
});

test("invalid edits cannot clear required values, override stay coordinates or inject unknown keys", () => {
  for (const edits of [{ soGiayTo: "" }, { gioiTinh: null }, { hoTen: "X".repeat(121) }, { loaiGiayTo: "1" },
    { ngayThangNamSinhStr: "not-a-date" }, { soPhong: "999" },
    { accessToken: "secret" }, { internalMetadata: { payload: true } }]) {
    assert.throws(() => buildInlineDraft(row, edits));
  }
});

test("foreign inline save preserves date precision and residence expiry without domestic fields", () => {
  const foreign = { ...row, kind: "FOREIGN", draftPayload: { hoTen: "Test Guest", quocTich: "GBR", soHoChieu: "TEST001",
    gioiTinh: "M", ngayDenCsltStr: "2026-11-17 09:00:00", ngayDiDuKienStr: "2026-11-19 11:00:00", loaiNgayThangNamSinh: "Y", ngayThangNamSinhStr: "1990-01-01", thoiHanTamTruStr: "2026-12-31 12:00:00" } };
  const result = buildInlineDraft(foreign, { soHoChieu: "TEST002" });
  assert.equal(result.data.loaiNgayThangNamSinh, "Y");
  assert.equal(result.data.thoiHanTamTruStr, "2026-12-31 12:00:00");
  assert.throws(() => buildInlineDraft(foreign, { loaiGiayTo: 1 }));
});

test("arrival and departure edits validate real dates and tourism is constant", () => {
 const result = buildInlineDraft(row, { ngayDenCsltStr: "2026-11-16 08:00:00", lyDoCuTru: 7 });
 assert.equal(result.data.lyDoCuTru, 1);
 assert.equal(result.data.ngayDenCsltStr, "2026-11-16 08:00:00");
 assert.equal(row.draftPayload.ngayDenCsltStr, "2026-11-17 09:00:00");
 for (const edits of [{ ngayDenCsltStr: "2026-02-30 12:00:00" }, { ngayDiDuKienStr: "2026-11-16 09:00:00" }, { ngayThangNamSinhStr: "1990-02-31" }]) assert.throws(() => buildInlineDraft(row, edits));
 assert.throws(() => buildInlineDraft({ ...row, draftPayload: { ...row.draftPayload, soGiayTo: undefined } }, { hoTen: "Test" }));
});
