import { Temporal } from "@js-temporal/polyfill";

export const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";

type PlainDateInput = Temporal.PlainDate | string;

/** Normalizes legacy/empty/invalid zones to the canonical Vietnam zone. */
export function resolveTimeZone(timeZone?: string | null): string {
  const trimmed = timeZone?.trim();
  if (!trimmed || trimmed === "Asia/Saigon") return VIETNAM_TIME_ZONE;
  try {
    Temporal.Now.zonedDateTimeISO(trimmed);
    return trimmed;
  } catch {
    return VIETNAM_TIME_ZONE;
  }
}

function asPlainDate(value: PlainDateInput): Temporal.PlainDate {
  return typeof value === "string"
    ? Temporal.PlainDate.from(value.slice(0, 10))
    : value;
}

/** Calendar date of an instant as seen in `timeZone`. */
export function toPlainDate(
  date: Date,
  timeZone?: string | null,
): Temporal.PlainDate {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime())
    .toZonedDateTimeISO(resolveTimeZone(timeZone))
    .toPlainDate();
}

/** `YYYY-MM-DD` of an instant as seen in `timeZone`. */
export function toYmd(date: Date, timeZone?: string | null): string {
  return toPlainDate(date, timeZone).toString();
}

export function todayPlainDate(timeZone?: string | null): Temporal.PlainDate {
  return Temporal.Now.plainDateISO(resolveTimeZone(timeZone));
}

export function todayYmd(timeZone?: string | null): string {
  return todayPlainDate(timeZone).toString();
}

/** UTC instant of `plainDate` at `time` (HH:mm[:ss]) local to `timeZone`. */
export function plainDateAtTime(
  plainDate: PlainDateInput,
  time: string,
  timeZone?: string | null,
): Date {
  const zoned = asPlainDate(plainDate).toZonedDateTime({
    timeZone: resolveTimeZone(timeZone),
    plainTime: Temporal.PlainTime.from(time),
  });
  return new Date(zoned.epochMilliseconds);
}

/** UTC instant of local midnight (start of day) in `timeZone`. */
export function startOfPlainDate(
  plainDate: PlainDateInput,
  timeZone?: string | null,
): Date {
  const zoned = asPlainDate(plainDate).toZonedDateTime({
    timeZone: resolveTimeZone(timeZone),
  });
  return new Date(zoned.epochMilliseconds);
}

/** Local business-day bounds: `start` inclusive, `end` = next local midnight (exclusive). */
export function getDayBounds(
  plainDate: PlainDateInput,
  timeZone?: string | null,
): { start: Date; end: Date } {
  const day = asPlainDate(plainDate);
  return {
    start: startOfPlainDate(day, timeZone),
    end: startOfPlainDate(day.add({ days: 1 }), timeZone),
  };
}

export function addDaysYmd(ymd: string, days: number): string {
  return asPlainDate(ymd).add({ days }).toString();
}

/** Signed number of local calendar days from `start` to `end`. */
export function diffCalendarDays(
  start: Date | PlainDateInput,
  end: Date | PlainDateInput,
  timeZone?: string | null,
): number {
  const from = start instanceof Date ? toPlainDate(start, timeZone) : asPlainDate(start);
  const to = end instanceof Date ? toPlainDate(end, timeZone) : asPlainDate(end);
  return from.until(to, { largestUnit: "days" }).days;
}

/** Inclusive list of `YYYY-MM-DD` from `startYmd` to `endYmd`. */
export function listYmdRange(startYmd: string, endYmd: string): string[] {
  const end = asPlainDate(endYmd);
  const result: string[] = [];
  let cursor = asPlainDate(startYmd);
  while (Temporal.PlainDate.compare(cursor, end) <= 0) {
    result.push(cursor.toString());
    cursor = cursor.add({ days: 1 });
  }
  return result;
}

/** `YYYY-MM-DD HH:mm:ss` of an instant as seen in `timeZone`. */
export function formatLocalDateTime(
  date: Date,
  timeZone?: string | null,
): string {
  const zoned = Temporal.Instant.fromEpochMilliseconds(
    date.getTime(),
  ).toZonedDateTimeISO(resolveTimeZone(timeZone));
  const time = zoned
    .toPlainTime()
    .toString({ smallestUnit: "second" });
  return `${zoned.toPlainDate().toString()} ${time}`;
}
