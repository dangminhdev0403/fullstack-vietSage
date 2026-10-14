import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

const { formatDayMonth, formatDashboardCount } = createRequire(import.meta.url)(
  "./dashboard-presentation.ts",
) as {
  formatDayMonth(value: Date | string | number): string;
  formatDashboardCount(value: number | null | undefined): string;
};

test("Ngày hôm nay chỉ hiển thị ngày-tháng", () => {
  assert.equal(formatDayMonth("2026-07-27T10:45:00+07:00"), "27/07");
});

test("formatDashboardCount hiển thị 1 số 0 thay vì 00 khi số lượng bằng 0 hoặc rỗng", () => {
  assert.equal(formatDashboardCount(0), "0");
  assert.equal(formatDashboardCount(null), "0");
  assert.equal(formatDashboardCount(undefined), "0");
  assert.equal(formatDashboardCount(-1), "0");
});

test("formatDashboardCount hiển thị 2 chữ số khi giá trị lớn hơn 0", () => {
  assert.equal(formatDashboardCount(5), "05");
  assert.equal(formatDashboardCount(11), "11");
  assert.equal(formatDashboardCount(65), "65");
});

test("dashboard kế thừa một nền duy nhất từ workspace shell", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(source, /<main className="space-y-8">/);
  assert.doesNotMatch(source, /<main className="[^"]*bg-/);
});

