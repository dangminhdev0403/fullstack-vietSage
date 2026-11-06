import { requestInternalApi } from "@/core/http/internal-api-client";
import type { MarketplaceOrder, MarketplaceSettlement } from "@/features/marketplace/types/marketplace-contract";

export type HotelPartnerSettlement = MarketplaceSettlement & { order: MarketplaceOrder };
export type HotelPartnerRevenue = { grossAmount: string | number; orderCount: number };
const basePath = (hotelId: string) => `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/marketplace`;

export const hotelPartnerSettlementsRepository = {
  list: (hotelId: string, signal?: AbortSignal) =>
    requestInternalApi<HotelPartnerSettlement[]>(`${basePath(hotelId)}/settlements`, { method: "GET", signal }),
  revenue: (hotelId: string, signal?: AbortSignal) =>
    requestInternalApi<HotelPartnerRevenue>(`${basePath(hotelId)}/revenue`, { method: "GET", signal }),
  settle: (hotelId: string, settlementId: string) =>
    requestInternalApi<unknown>(`${basePath(hotelId)}/settlements/${encodeURIComponent(settlementId)}/settle`, { method: "POST" }),
  settleBatch: (hotelId: string, settlementIds: string[]) =>
    requestInternalApi<{ settledCount?: number }>(`${basePath(hotelId)}/settlements/settle-batch`, {
      method: "POST",
      body: { settlementIds },
    }),
};
