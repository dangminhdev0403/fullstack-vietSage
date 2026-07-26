import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

const { formatDayMonth } = createRequire(import.meta.url)(
  "./dashboard-presentation.ts",
) as { formatDayMonth(value: Date | string | number): string };

test("Ngày hôm nay chỉ hiển thị ngày-tháng", () => {
  assert.equal(formatDayMonth("2026-07-27T10:45:00+07:00"), "27/07");
});

test("dashboard kế thừa một nền duy nhất từ workspace shell", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(source, /<main className="space-y-8">/);
  assert.doesNotMatch(source, /<main className="[^"]*bg-/);
});
