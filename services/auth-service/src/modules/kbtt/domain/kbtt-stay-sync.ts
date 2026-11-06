import { createHash } from "node:crypto";
import { z } from "zod";
import { formatLocalDateTime, plainDateAtTime, toYmd, VIETNAM_TIME_ZONE } from "../../../common/time/vietnam-temporal";
import { kbttDomesticDepartureChangeSchema, kbttForeignDepartureChangeSchema } from "./schemas/kbtt-departure.schema";

export type DeclarationKind = "VIETNAMESE" | "FOREIGN";
const guestObject = z.record(z.string(), z.unknown());

export function submittedGuest(payload: unknown): Record<string, unknown> | null {
  const parsed = guestObject.safeParse(Array.isArray(payload) ? payload[0] : payload);
  return parsed.success ? parsed.data : null;
}

export function providerIdentity(kind: DeclarationKind, guest: Record<string, unknown>) {
  const number = kind === "VIETNAMESE" ? guest.soGiayTo : guest.soHoChieu;
  const qualifier = kind === "VIETNAMESE" ? guest.loaiGiayTo : guest.quocTich;
  if (typeof number !== "string" || !number.trim() || qualifier == null) return null;
  const key = createHash("sha256")
    .update(JSON.stringify([kind, number.trim().toUpperCase(), String(qualifier).trim().toUpperCase()]))
    .digest("hex");
  return { key, number };
}

export function providerDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return null;
  try {
    return plainDateAtTime(value.slice(0, 10), value.slice(11), VIETNAM_TIME_ZONE);
  } catch {
    return null;
  }
}

// BCA lifecycle decisions use Vietnam calendar days; wire values retain their time.
export function providerDay(value: unknown): string | null {
  const date = providerDate(value);
  return date ? toYmd(date, VIETNAM_TIME_ZONE) : null;
}

export function departurePayload(
  kind: DeclarationKind,
  guest: Record<string, unknown>,
  action: "GH" | "TS",
  departure?: Date,
) {
  const time = action === "GH" && departure
    ? formatLocalDateTime(departure, VIETNAM_TIME_ZONE)
    : undefined;
  const payload = kind === "VIETNAMESE"
    ? kbttDomesticDepartureChangeSchema.safeParse({
        loai: action, soGiayTo: guest.soGiayTo, loaiGiayTo: guest.loaiGiayTo,
        ...(time ? { thoiGianStr: time } : {}),
      })
    : kbttForeignDepartureChangeSchema.safeParse({
        loai: action, soHc: guest.soHoChieu, quocTich: guest.quocTich,
        ...(time ? { thoiGianStr: time, thoiHanTamTruVnStr: guest.thoiHanTamTruStr } : {}),
      });
  return payload.success ? payload.data : null;
}

export function sanitizedStayResult(message: string): string {
  return message
    .replace(/(?:bearer|basic)\s+\S+/gi, "[REDACTED]")
    .replace(/(?:password|token|secret|access_token|refresh_token)\s*[:=]\s*\S+/gi, "[REDACTED]")
    .replace(/[A-Z0-9]{6,}/gi, "[REDACTED]")
    .slice(0, 500);
}
