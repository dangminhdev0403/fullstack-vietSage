export function formatDayMonth(value: string): string {
  const parts = new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).formatToParts(new Date(value));
  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${valueOf("day")}/${valueOf("month")}`;
}

export function formatDashboardCount(value: number | null | undefined): string {
  const numeric = Number(value ?? 0);
  if (!numeric || numeric <= 0) return "0";
  return String(numeric).padStart(2, "0");
}
