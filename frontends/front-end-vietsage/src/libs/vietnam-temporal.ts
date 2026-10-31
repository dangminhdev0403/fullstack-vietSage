import { Temporal } from "@js-temporal/polyfill";

export const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";

/** Today's `YYYY-MM-DD` in Vietnam, independent of the browser zone. */
export function getVietnamToday(): string {
  return Temporal.Now.plainDateISO(VIETNAM_TIME_ZONE).toString();
}

export function addDaysYmd(ymd: string, days: number): string {
  return Temporal.PlainDate.from(ymd.slice(0, 10)).add({ days }).toString();
}

/** Signed calendar days between two `YYYY-MM-DD` values. */
export function diffDaysYmd(startYmd: string, endYmd: string): number {
  return Temporal.PlainDate.from(startYmd.slice(0, 10))
    .until(Temporal.PlainDate.from(endYmd.slice(0, 10)), { largestUnit: "days" })
    .days;
}

/** `YYYY-MM-DD` of an instant as seen in Vietnam. */
export function toVietnamYmd(value: Date | string): string {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Temporal.Instant.fromEpochMilliseconds(ms)
    .toZonedDateTimeISO(VIETNAM_TIME_ZONE)
    .toPlainDate()
    .toString();
}

/** ISO day of week: 1 = Monday … 7 = Sunday. */
export function dayOfWeekYmd(ymd: string): number {
  return Temporal.PlainDate.from(ymd.slice(0, 10)).dayOfWeek;
}

/** Formats an ISO instant or Date into Vietnam local "YYYY-MM-DDTHH:mm" */
export function toVietnamDatetimeLocal(isoString?: string | Date | null): string {
  if (!isoString) return "";
  try {
    const instant = isoString instanceof Date
      ? Temporal.Instant.fromEpochMilliseconds(isoString.getTime())
      : Temporal.Instant.from(isoString);
    return instant.toZonedDateTimeISO(VIETNAM_TIME_ZONE).toPlainDateTime()
      .toString({ smallestUnit: "minute" });
  } catch {
    return "";
  }
}

/** Parses minute/second datetime-local strings or explicit-offset instants into UTC ISO instant */
export function parseHotelDatetimeToIso(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const instant = /([+-]\d{2}:?\d{2}|Z)$/i.test(trimmed)
      ? Temporal.Instant.from(trimmed)
      : Temporal.PlainDateTime.from(trimmed.replace(" ", "T"), { overflow: "reject" })
        .toZonedDateTime(VIETNAM_TIME_ZONE).toInstant();
    return instant.toString({ fractionalSecondDigits: 3 });
  } catch {
    return null;
  }
}

/** Extracts "YYYY-MM-DDTHH:mm" in Vietnam local time for comparison */
export function extractVietnamMinuteString(val?: string | null): string {
  if (!val) return "";
  const trimmed = val.trim();
  if (!trimmed) return "";
  if (/([+-]\d{2}:?\d{2}|Z)$/i.test(trimmed)) {
    return toVietnamDatetimeLocal(trimmed);
  }
  return trimmed.slice(0, 16);
}
