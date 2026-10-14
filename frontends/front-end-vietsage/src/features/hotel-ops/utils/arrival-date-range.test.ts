import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { addCalendarDays, getArrivalDateRange } from "./arrival-date-range.ts";

test("uses exclusive end dates for arrival queries", () => {
  assert.deepEqual(getArrivalDateRange("today", "2026-10-14"), {
    from: "2026-10-14",
    to: "2026-10-15",
  });
  assert.deepEqual(getArrivalDateRange("tomorrow", "2026-10-14"), {
    from: "2026-10-15",
    to: "2026-10-16",
  });
  assert.deepEqual(getArrivalDateRange("week", "2026-10-14"), {
    from: "2026-10-14",
    to: "2026-10-21",
  });
});

test("adds calendar days across month and leap-year boundaries", () => {
  assert.equal(addCalendarDays("2026-01-31", 1), "2026-02-01");
  assert.equal(addCalendarDays("2028-02-28", 1), "2028-02-29");
});
