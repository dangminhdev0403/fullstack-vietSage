import { requestInternalApi } from "@/core/http/internal-api-client";
import { HttpError } from "@/core/http/http-error";
import type { HttpMethod } from "@/core/http/http-client";
import type { ServiceItemImportPreview, ServicePortalData, ServiceProfile } from "./types";
import type { MarketplaceOrder, MarketplaceSettlement, PartnerFinancialSummary } from "@/features/marketplace/types/marketplace-contract";

export type VoucherVerification = {
  valid?: boolean;
  order?: MarketplaceOrder;
  message?: string;
};

const call = <T>(method: HttpMethod, body?: unknown, action?: string, status?: string, signal?: AbortSignal) => {
  const queryParams = new URLSearchParams();
  if (action) queryParams.set("action", action);
  if (status) queryParams.set("status", status);
  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : "";
  return requestInternalApi<T>(`/api/service-portal${queryString}`, { method, body, signal });
};

export const servicePortalRepository = {
  data: (signal?: AbortSignal) => call<ServicePortalData>("GET", undefined, undefined, undefined, signal),
  financialSummary: (signal?: AbortSignal) => call<PartnerFinancialSummary>("GET", undefined, "financialSummary", undefined, signal),
  settlements: (status?: string, signal?: AbortSignal) =>
    call<Array<MarketplaceSettlement & { order: MarketplaceOrder }>>(
      "GET",
      undefined,
      "settlements",
      status,
      signal,
    ),
  profile: (input: Partial<ServiceProfile>) => call<ServiceProfile>("PATCH", input),
  update: (input: { serviceId: string; data: unknown }) =>
    call("POST", { action: "update", ...input }),
  transition: (input: { orderId: string; toStatus: string }) =>
    call("POST", { action: "transition", ...input }),
  importPreview: (input: { csv: string; fileName: string }) =>
    call<ServiceItemImportPreview>("POST", { action: "importPreview", ...input }),
  importCommit: (input: { csv: string; fileName: string; previewToken: string }) =>
    call("POST", { action: "importCommit", ...input }),
  async fetchSheetCsv(): Promise<string> {
    const response = await fetch("/api/service-portal?file=sheet", { cache: "no-store" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        data?: { detail?: string };
      } | null;
      const detailMsg =
        payload?.data?.detail && payload.data.detail !== "VALIDATION_ERROR"
          ? payload.data.detail
          : payload?.message && payload.message !== "VALIDATION_ERROR"
          ? payload.message
          : "Không thể truy cập Google Sheets / Excel Online đã lưu. Vui lòng liên hệ Quản trị nền tảng.";
      throw new Error(detailMsg);
    }
    const text = await response.text();
    if (!text || text.includes("<!DOCTYPE html") || text.includes("<html")) {
      throw new Error(
        "Bảng tính Google Sheets / Excel Online chưa được mở quyền truy cập công khai. Vui lòng chọn 'Chia sẻ' -> 'Bất kỳ ai có liên kết'.",
      );
    }
    return text;
  },
  async verifyVoucher(input: { code: string }): Promise<VoucherVerification | null> {
    try {
      return await requestInternalApi<VoucherVerification | null>("/api/service-portal/vouchers/verify", {
        method: "POST", body: input,
      });
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      // A rejected code is a validation result; network errors still reach the caller.
      const payload = error.data;
      const body = payload && typeof payload === "object" && "data" in payload ? payload.data ?? payload : payload;
      const message = body && typeof body === "object" && "message" in body && typeof body.message === "string"
        ? body.message : undefined;
      return { valid: false, message };
    }
  },
};

