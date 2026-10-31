import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node strip-types requires explicit extensions.
import { toVietnamDatetimeLocal, parseHotelDatetimeToIso, extractVietnamMinuteString } from "../../libs/vietnam-temporal.ts";
// @ts-expect-error Node strip-types requires explicit extensions.
import { buildFrontDeskGroupSummaries } from "./utils/front-desk-groups.ts";
import type { HotelArrival } from "./types/hotel-ops-contract.ts";

test("toVietnamDatetimeLocal correctly converts UTC instants to Vietnam local time string", () => {
  // 07:00 UTC = 14:00 in Asia/Ho_Chi_Minh (UTC+7)
  const localStr = toVietnamDatetimeLocal("2026-10-31T07:00:00.000Z");
  assert.equal(localStr, "2026-10-31T14:00");

  // 05:00 UTC = 12:00 in Asia/Ho_Chi_Minh (UTC+7)
  const checkoutStr = toVietnamDatetimeLocal("2026-11-02T05:00:00.000Z");
  assert.equal(checkoutStr, "2026-11-02T12:00");
});

test("parseHotelDatetimeToIso handles minute, second, and explicit-offset forms", () => {
  // Minute form (standard datetime-local)
  const isoFromMinute = parseHotelDatetimeToIso("2026-10-31T14:00");
  assert.equal(isoFromMinute, "2026-10-31T07:00:00.000Z");

  // Second form (datetime-local with seconds)
  const isoFromSeconds = parseHotelDatetimeToIso("2026-10-31T14:00:00");
  assert.equal(isoFromSeconds, "2026-10-31T07:00:00.000Z");

  // Explicit +07:00 offset
  const isoFromOffset = parseHotelDatetimeToIso("2026-10-31T14:00:00+07:00");
  assert.equal(isoFromOffset, "2026-10-31T07:00:00.000Z");

  // Instant with Z
  const isoFromZ = parseHotelDatetimeToIso("2026-10-31T07:00:00.000Z");
  assert.equal(isoFromZ, "2026-10-31T07:00:00.000Z");
  assert.equal(parseHotelDatetimeToIso("2026-02-30T14:00"), null);
});

test("extractVietnamMinuteString compares local strings directly without double conversion", () => {
  // Instant with Z extracts Vietnam local minute string
  assert.equal(extractVietnamMinuteString("2026-10-31T07:00:00.000Z"), "2026-10-31T14:00");

  // Offset-free local string (as typed by user in browser) preserves its exact local time
  // e.g. user intentionally edited time to 07:00 - must NOT double-convert to 14:00
  assert.equal(extractVietnamMinuteString("2026-10-31T07:00"), "2026-10-31T07:00");
  assert.equal(extractVietnamMinuteString("2026-10-31T14:00"), "2026-10-31T14:00");
});

test("hotel time conversion preserves meaning in UTC, Vietnam, and New York browser zones", () => {
  const previousZone = process.env.TZ;
  try {
    for (const zone of ["UTC", "Asia/Ho_Chi_Minh", "America/New_York"]) {
      process.env.TZ = zone;
      assert.equal(toVietnamDatetimeLocal("2026-10-31T07:00:42.123Z"), "2026-10-31T14:00");
      assert.equal(extractVietnamMinuteString("2026-10-31T14:00"), "2026-10-31T14:00");
      assert.equal(extractVietnamMinuteString("2026-10-31T07:00"), "2026-10-31T07:00");
      assert.equal(parseHotelDatetimeToIso("2026-10-31T14:00"), "2026-10-31T07:00:00.000Z");
      assert.equal(parseHotelDatetimeToIso("2026-10-31T07:00"), "2026-10-31T00:00:00.000Z");
    }
  } finally {
    if (previousZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousZone;
  }
});

test("Group total presentation uses authoritative totalAmount including 0 without falling through", () => {
  // Case A: Free / 100% comped stay (totalAmount: 0)
  const freeArrival: HotelArrival = {
    id: "arr_free",
    hotelId: "h1",
    roomId: "r1",
    reservationCode: "RES_FREE",
    groupCode: "GRP_ZERO",
    guestDisplayName: "Khách miễn phí",
    guestPhone: null,
    status: "CONFIRMED",
    plannedCheckInAt: "2026-10-31T07:00:00.000Z",
    plannedCheckOutAt: "2026-11-02T05:00:00.000Z",
    totalAmount: 0,
    rate: "1000000",
    nightlyRateSnapshot: 1000000,
  };

  const groupSummaries = buildFrontDeskGroupSummaries([freeArrival]);
  assert.equal(groupSummaries.length, 1);
  // Authoritative 0 must be preserved and NOT fall through to rate (1.000.000 * 2)
  assert.equal(groupSummaries[0].totalEstimatedAmount, 0);

  // Case B: Group booking with 2 nights authoritative total (2.470.000đ)
  const booking1: HotelArrival = {
    id: "arr_1",
    hotelId: "h1",
    roomId: "r1",
    reservationCode: "RES_0112",
    groupCode: "GRP_AUDIT",
    guestDisplayName: "Khách 1",
    guestPhone: null,
    status: "CONFIRMED",
    plannedCheckInAt: "2026-10-31T07:00:00.000Z",
    plannedCheckOutAt: "2026-11-02T05:00:00.000Z",
    totalAmount: 1270000,
    rate: "500000",
  };

  const booking2: HotelArrival = {
    id: "arr_2",
    hotelId: "h1",
    roomId: "r2",
    reservationCode: "RES_0113",
    groupCode: "GRP_AUDIT",
    guestDisplayName: "Khách 2",
    guestPhone: null,
    status: "CONFIRMED",
    plannedCheckInAt: "2026-10-31T07:00:00.000Z",
    plannedCheckOutAt: "2026-11-02T05:00:00.000Z",
    totalAmount: 1200000,
    rate: "500000",
  };

  const auditGroup = buildFrontDeskGroupSummaries([booking1, booking2]);
  assert.equal(auditGroup.length, 1);
  // Authoritative sum: 1.270.000 + 1.200.000 = 2.470.000, not flat 1.000.000
  assert.equal(auditGroup[0].totalEstimatedAmount, 2470000);
});

