import assert from "node:assert/strict";
import test from "node:test";
import { checkInBirthDateError, normalizeCheckInBirthDate, toIsoDate } from "./check-in-validation.ts";
import { intakeGuestV2Schema } from "../intake/intake-contract.ts";

const now = new Date("2026-11-05T10:00:00Z");
test("check-in rejects impossible and malformed dates before confirmation", () => {
  for (const value of ["31/02/1990", "1990-02-31", "29/02/1900", "29021990", "abc1990", "1990-13-01"]) {
    assert.equal(toIsoDate(value), "", value);
    assert.equal(checkInBirthDateError(value, false, now), "Ngày sinh không hợp lệ.", value);
  }
});
test("valid VN and foreign birth-date formats normalize consistently", () => {
  for (const value of ["29/02/2000", "2000-02-29", "29022000", "20000229"]) {
    assert.equal(toIsoDate(value), "2000-02-29");
    assert.equal(checkInBirthDateError(value, true, now), undefined);
  }
});
test("birth date remains optional without identity and future dates are rejected", () => {
  assert.equal(checkInBirthDateError("", false, now), undefined);
  assert.equal(checkInBirthDateError("", true, now), "Nhập ngày sinh khi có số giấy tờ.");
  assert.equal(checkInBirthDateError("2999-01-01", false, now), "Ngày sinh không được ở tương lai.");
  assert.equal(checkInBirthDateError("2026-11-06", false, new Date("2026-11-05T18:00:00Z")), undefined);
});
test("the reused intake identity schema accepts VN and foreign numbers and rejects punctuation", () => {
  for (const value of ["001090550502", "m1234567"]) assert.equal(intakeGuestV2Schema.shape.identityNumber.safeParse(value).success, true);
  for (const value of ["abc@", "AB 123", "AB-123", "A".repeat(33)]) assert.equal(intakeGuestV2Schema.shape.identityNumber.safeParse(value).success, false);
});

test("year-only birth dates keep their precision without becoming a full date", () => {
  assert.equal(normalizeCheckInBirthDate("1990"), "1990");
  assert.equal(checkInBirthDateError("1990", true, now), undefined);
  assert.equal(toIsoDate("1990"), "");
  assert.equal(normalizeCheckInBirthDate("20/12"), "");
  assert.equal(normalizeCheckInBirthDate("2012"), "2012");
  assert.equal(checkInBirthDateError("1899", false, now), "Ngày sinh không hợp lệ.");
  assert.equal(checkInBirthDateError("2999", false, now), "Ngày sinh không được ở tương lai.");
  assert.equal(normalizeCheckInBirthDate("31/02/1990"), "");
});
