function isCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function toIsoDate(str?: string): string {
  if (!str) return "";
  const t = str.trim();
  if (!t) return "";

  // 1. Standard ISO YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/.exec(t);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    if (isCalendarDate(year, month, day)) {
      return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // 2. Formats with separators: DD/MM/YYYY, D/M/YYYY, DD-MM-YYYY, DD.MM.YYYY
  // Also cleans accidental multi-slashes like 15//05/1995
  const cleanedSeps = t.replace(/[.\-]/g, "/").replace(/\/+/g, "/");
  const dmyMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(cleanedSeps);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const day = Number(d);
    const month = Number(m);
    const year = Number(y);
    if (isCalendarDate(year, month, day)) {
      return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // 3. Raw 8-digit strings: DDMMYYYY or YYYYMMDD
  const digits = /^\d+$/.test(t) ? t : "";
  if (digits.length === 8) {
    const d = Number(digits.slice(0, 2));
    const m = Number(digits.slice(2, 4));
    const y = Number(digits.slice(4, 8));
    if (isCalendarDate(y, m, d)) {
      return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
    const y2 = Number(digits.slice(0, 4));
    const m2 = Number(digits.slice(4, 6));
    const d2 = Number(digits.slice(6, 8));
    if (isCalendarDate(y2, m2, d2)) {
      return `${String(y2).padStart(4, "0")}-${String(m2).padStart(2, "0")}-${String(d2).padStart(2, "0")}`;
    }
  }

  return "";
}

/** Preserve birth-year precision; a missing day/month is never invented. */
export function normalizeCheckInBirthDate(raw?: string): string {
  const value = raw?.trim() || "";
  if (/^\d{4}$/.test(value) && Number(value) >= 1900) return value;
  return toIsoDate(value);
}

export function checkInBirthDateError(raw: string, hasIdentity: boolean, now = new Date()): string | undefined {
  if (!raw.trim()) return hasIdentity ? "Nhập ngày sinh khi có số giấy tờ." : undefined;
  const iso = normalizeCheckInBirthDate(raw);
  if (!iso) return "Ngày sinh không hợp lệ.";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return iso > (iso.length === 4 ? today.slice(0, 4) : today) ? "Ngày sinh không được ở tương lai." : undefined;
}
