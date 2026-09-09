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
  async sendDocument(requestId: string, transferId: string, file: File): Promise<ShiftResult> {
    const response = await fetch("/api/cccd-mobile/sessions", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": file.type, "X-Scan-Request": requestId, "X-Transfer-Id": transferId },
      body: file, signal: AbortSignal.timeout(30_000),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new MobileApiError(body?.error ?? "Không thể gửi ảnh hộ chiếu.", response.status);
    return body;
  },
  async document(hotelId: string, deskId: string, sessionId: string, requestId: string) {
    const query = new URLSearchParams({ deskId, sessionId, requestId });
    const response = await fetch(`/api/cccd-mobile/hotels/${encodeURIComponent(hotelId)}/sessions?${query}`, {
      credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new MobileApiError(body?.error ?? "Không thể nhận ảnh hộ chiếu.", response.status);
    }
    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    return {
      file: new File([await response.blob()], `passport.${extension}`, { type: contentType }),
      transferId: response.headers.get("x-transfer-id") ?? "",
    };
  },
};
