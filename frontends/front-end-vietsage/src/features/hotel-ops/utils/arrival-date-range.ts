// Relative `.ts` path keeps this module loadable by Node's strip-types test runner.
// @ts-expect-error Explicit TypeScript extension is not enabled in tsconfig.
import { addDaysYmd } from "../../../libs/vietnam-temporal.ts";

export type ArrivalRange = "today" | "tomorrow" | "week";

export function addCalendarDays(ymd: string, days: number): string {
  return addDaysYmd(ymd, days);
}

export function getArrivalDateRange(
  range: ArrivalRange,
  todayYmd: string,
): { from: string; to: string } {
  if (range === "tomorrow") {
    const from = addCalendarDays(todayYmd, 1);
    return { from, to: addCalendarDays(from, 1) };
  }

  return {
    from: todayYmd,
    to: addCalendarDays(todayYmd, range === "week" ? 7 : 1),
  };
}
