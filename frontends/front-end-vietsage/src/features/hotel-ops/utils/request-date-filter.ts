export function normalizeDayFilter(value: string | undefined, boundary: "start" | "end"): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const displayMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!displayMatch) return trimmed;

  return `${displayMatch[3]}-${displayMatch[2]}-${displayMatch[1]}T${boundary === "start" ? "00:00:00.000" : "23:59:59.999"}Z`;
}
