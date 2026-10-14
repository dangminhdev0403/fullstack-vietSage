export type ArrivalRange = "today" | "tomorrow" | "week";

export function addCalendarDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
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
