import { requestInternalApi } from "@/core/http/internal-api-client";
import type { DesktopCommand, PhoneCommand } from "../workstation/mobile-shift-security";
import type { MobileShiftView } from "../workstation/mobile-shift-store";
export type ShiftResult = MobileShiftView & { code?: string };
export class MobileApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export const mobileShiftRepository = {
  desk: (hotelId: string, deskId: string) => requestInternalApi<ShiftResult | { session: null }>(
    `/api/cccd-mobile/hotels/${encodeURIComponent(hotelId)}/sessions?deskId=${encodeURIComponent(deskId)}`, { method: "GET" }),
  command: (hotelId: string, command: DesktopCommand) => requestInternalApi<ShiftResult>(
    `/api/cccd-mobile/hotels/${encodeURIComponent(hotelId)}/sessions`, { method: "POST", body: command, signal: AbortSignal.timeout(10_000) }),
  // A scan-only cookie must never invoke full-account refresh/logout middleware. Payload never logged.
  async phone(command?: PhoneCommand): Promise<ShiftResult> {
    const response = await fetch("/api/cccd-mobile/sessions", {
      method: command ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
      headers: command ? { "Content-Type": "application/json" } : {},
      body: command ? JSON.stringify(command) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json();
    if (!response.ok) throw new MobileApiError(body.error ?? "Không thể kết nối phiên quét.", response.status);
    return body;
  },
};
