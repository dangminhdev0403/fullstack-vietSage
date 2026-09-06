import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node strip-types requires explicit extension.
import { parseCccdQr } from "./cccd-qr-parser.ts";

test("parses the seven fields printed in a Vietnamese CCCD QR", () => {
  assert.deepEqual(
    parseCccdQr("001203004567|012345678|NGUYEN VAN A|02031990|Nam|Ha Noi|25042021"),
    {
      identityNumber: "001203004567",
      displayName: "NGUYEN VAN A",
      dateOfBirth: "1990-03-02",
      gender: "Nam",
      residencePlace: "Ha Noi",
      identityIssueDate: "2021-04-25",
    },
  );
});

test("parses 7 fields with trailing pipe and extra fields", () => {
  const res = parseCccdQr("034205005951||DANG HOANG MINH|04032005|Nam|Binh Dinh|04032024|31032030|");
  assert.equal(res.identityNumber, "034205005951");
  assert.equal(res.displayName, "DANG HOANG MINH");
  assert.equal(res.dateOfBirth, "2005-03-04");
  assert.equal(res.gender, "Nam");
  assert.equal(res.residencePlace, "Binh Dinh");
  assert.equal(res.identityIssueDate, "2024-03-04");
});

test("parses 6 fields format without CMND", () => {
  const res = parseCccdQr("034205005951|DANG HOANG MINH|04/03/2005|Nam|Binh Dinh|04/03/2024");
  assert.equal(res.identityNumber, "034205005951");
  assert.equal(res.displayName, "DANG HOANG MINH");
  assert.equal(res.dateOfBirth, "2005-03-04");
});

test("parses 3-line MRZ from card back", () => {
  const mrz = [
    "IDVNM2050059513034205005951<<6",
    "0503040M3003046VNM<<<<<<<<<<<8",
    "DANG<HOANG<MINH<<<<<<<<<<<<<<"
  ].join("\n");
  const res = parseCccdQr(mrz);
  assert.equal(res.identityNumber, "034205005951");
  assert.equal(res.displayName, "DANG HOANG MINH");
  assert.equal(res.dateOfBirth, "2005-03-04");
  assert.equal(res.gender, "Nam");
});

test("rejects malformed or incomplete CCCD QR content", () => {
  assert.throws(() => parseCccdQr("https://example.com"));
  assert.throws(() => parseCccdQr("001203004567||A|32131990|Nam|Ha Noi|25042021"));
});