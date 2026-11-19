import { HttpError } from "@/core/http/http-error";
import { kbttErrorCode, kbttErrorMessage, sanitizeProviderDetail, sanitizeErrorMessage } from "../types/kbtt-contract";

export function connectionErrorText(code: string | null | undefined, fallbackMessage?: string | null): string {
  if (code === "KBTT_RETRY_PENDING") {
    return fallbackMessage?.trim() || "Đang thử kết nối lại sau 10 giây.";
  }
  if (code === "KBTT_TEMP_DISCONNECTED") {
    return fallbackMessage?.trim() || "Tạm ngắt kết nối BCA — đang chờ kết nối lại.";
  }
  if (code === "KBTT_SESSION_ENDED" || code === "KBTT_AUTH_FAILED") {
    return fallbackMessage?.trim() || "Cần đăng nhập lại BCA.";
  }
  if (code === "KBTT_FACILITY_CONFLICT") {
    return (
      fallbackMessage?.trim() ||
      "Tài khoản cơ sở BCA này đang được liên kết với một khách sạn khác trên hệ thống."
    );
  }
  if (fallbackMessage?.trim()) return fallbackMessage.trim();
  return kbttErrorMessage(code ?? null);
}

export function errorText(error: unknown): string {
  if (error instanceof HttpError) {
    const code = kbttErrorCode(error.data);
    if (code) return connectionErrorText(code);
    if (error.status >= 400 && error.status < 500) {
      const detail = sanitizeProviderDetail(error.data);
      if (detail && !/^(bad request|request failed.*|KBTT_AUTO_SUBMIT_ERROR)$/i.test(detail)) return sanitizeErrorMessage(detail);
    }
    if (error.status === 400) return "Yêu cầu không hợp lệ. Vui lòng kiểm tra dữ liệu và thử lại.";
    if (error.status === 403) return "Bạn không có quyền thực hiện thao tác này.";
    if (error.status === 404) return "Không tìm thấy khách sạn hoặc bạn không có quyền truy cập.";
    return kbttErrorMessage(kbttErrorCode(error.data));
  }
  return kbttErrorMessage(null);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Chưa cập nhật";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa xác định";
  const parts = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("hour")}:${get("minute")}:${get("second")} ${get("day")}/${get("month")}/${get("year")}`;
}

