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
