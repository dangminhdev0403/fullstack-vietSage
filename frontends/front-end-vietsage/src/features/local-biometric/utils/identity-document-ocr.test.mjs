import assert from "node:assert/strict";
import test from "node:test";

import {
  matchBcaNationalityCode,
  parseLocalMrzResult,
} from "./identity-document-ocr.ts";

const catalog = [
  { code: "KOR", nameVi: "CH Hàn Quốc", nameEn: "Korea (South)" },
  { code: "VNM", nameVi: "Việt Nam", nameEn: "Viet Nam" },
];

test("OpenMRZ nationality resolves to the exact BCA catalog code", () => {
  assert.equal(matchBcaNationalityCode("Korean [KOR]", catalog), "KOR");
  assert.equal(matchBcaNationalityCode("Hàn Quốc", catalog), "KOR");
  assert.equal(matchBcaNationalityCode("KOR", catalog), "KOR");
  assert.equal(matchBcaNationalityCode("Việt Nam", catalog), "VNM");
  assert.equal(matchBcaNationalityCode("Không xác định", catalog), "");
});

test("OpenMRZ CCCD compact birth date is normalized before check-in", () => {
  const result = parseLocalMrzResult({
    documentKind: "passport",
    format: "QR_CCCD",
    identityNumber: "001203004567",
    fullName: "TEST USER",
    dateOfBirth: "04032005",
    gender: "Nam",
    nationality: "Việt Nam",
    residencePlace: "Test",
  });
  assert.equal(result.dateOfBirth, "2005-03-04");
  assert.equal(result.guestDateOfBirth, "2005-03-04");
  assert.throws(() =>
    parseLocalMrzResult({
      documentKind: "passport",
      identityNumber: "001203004567",
      fullName: "TEST USER",
      dateOfBirth: "32132005",
    }),
  );
});
