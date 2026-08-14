import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import { getBackendApiBaseUrl } from "@/core/http/backend-api-config";
import { HttpClient } from "@/core/http/http-client";
import type { ServiceItem, ServiceItemImportPreview, ServicePortalData, ServiceProfile } from "./types";
import type { MarketplaceOrder, MarketplaceSettlement, PartnerFinancialSummary } from "@/features/marketplace/types/marketplace-contract";
const http = new HttpClient({ baseUrl: getBackendApiBaseUrl() });
const req = async <T, B = unknown>(token: string, method: "GET" | "POST" | "PATCH", path: string, body?: B) => unwrapApiEnvelope<T>(await http.request<unknown, B>({ method, path, accessToken: token, body })).data;
const csvReq = async (token: string, path: string) => {
  const response = await fetch(`${getBackendApiBaseUrl()}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "text/csv" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
};
export const servicePortalClient = {
  data: async (token: string): Promise<ServicePortalData> => {
    const [profile, services, orders] = await Promise.all([
      req<ServiceProfile>(token, "GET", "/service-portal/profile"),
      req<ServiceItem[]>(token, "GET", "/service-portal/services"),
      req<MarketplaceOrder[]>(token, "GET", "/service-portal/orders"),
    ]);
    return { profile, services, orders };
  },
  profile: (token: string, body: Partial<ServiceProfile>) => req<ServiceProfile, Partial<ServiceProfile>>(token, "PATCH", "/service-portal/profile", body),
  create: (token: string, body: unknown) => req<ServiceItem, unknown>(token, "POST", "/service-portal/services", body),
  update: (token: string, serviceId: string, body: unknown) => req<ServiceItem, unknown>(token, "PATCH", `/service-portal/services/${encodeURIComponent(serviceId)}`, body),
  transition: (token: string, orderId: string, toStatus: string) => req<MarketplaceOrder, { toStatus: string }>(token, "POST", `/service-portal/orders/${encodeURIComponent(orderId)}/transitions`, { toStatus }),
  importPreview: (token: string, csv: string, fileName: string) => req<ServiceItemImportPreview, { csv: string; fileName: string }>(token, "POST", "/service-portal/services/import/preview", { csv, fileName }),
  importCommit: (token: string, csv: string, fileName: string, previewToken: string) => req(token, "POST", "/service-portal/services/import/commit", { csv, fileName, previewToken }),
  template: (token: string) => csvReq(token, "/service-portal/services/import/template"),
  export: (token: string) => csvReq(token, "/service-portal/services/export"),
  ticket: (token: string) => req<{ ticket: string; expiresAt: string }>(token, "POST", "/service-portal/request-realtime-ticket"),
  verifyVoucher: (token: string, code: string) => req<{ valid: boolean; status: string; voucherNumber: string; issuedAt?: string; expiresAt?: string; redeemedAt?: string; order: MarketplaceOrder }, { code: string }>(token, "POST", "/service-portal/vouchers/verify", { code }),
  redeemVoucher: (token: string, code: string) => req<{ status: string; voucherNumber: string; order: MarketplaceOrder }, { code: string }>(token, "POST", "/service-portal/vouchers/redeem", { code }),
  financialSummary: (token: string) => req<PartnerFinancialSummary>(token, "GET", "/service-portal/financial-summary"),
  settlements: (token: string, status?: string) => req<Array<MarketplaceSettlement & { order: MarketplaceOrder }>>(token, "GET", `/service-portal/settlements${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  hotelPartnerSettlements: (token: string, hotelId: string, status?: string) => req<Array<MarketplaceSettlement & { order: MarketplaceOrder }>>(token, "GET", `/hotels/${encodeURIComponent(hotelId)}/marketplace/settlements${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  settlePartnerOrder: (token: string, hotelId: string, settlementId: string) => req<MarketplaceSettlement>(token, "POST", `/hotels/${encodeURIComponent(hotelId)}/marketplace/settlements/${encodeURIComponent(settlementId)}/settle`),
  settlePartnerOrdersBatch: (token: string, hotelId: string, settlementIds: string[]) => req<{ settledCount: number; settlementIds: string[] }, { settlementIds: string[] }>(token, "POST", `/hotels/${encodeURIComponent(hotelId)}/marketplace/settlements/settle-batch`, { settlementIds }),
};
