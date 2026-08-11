import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type { HotelMarketplaceOrder, LocalPartner, LocalPartnerCategory, LocalPartnerInput, LocalPartnerStatus, NearbyServiceProvider } from "../types/local-partners-contract";

const path = (hotelId: string, suffix = "") => `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/local-partners${suffix}`;
export const localPartnersRepository = {
  providers: async (hotelId: string, signal?: AbortSignal) => (await requestInternalApiEnvelope<NearbyServiceProvider[]>(path(hotelId, "/providers"), { method: "GET", signal })).data,
  marketplaceOrders: async (hotelId: string, signal?: AbortSignal) => (await requestInternalApiEnvelope<HotelMarketplaceOrder[]>(path(hotelId, "/providers/orders"), { method: "GET", signal })).data,
  setProviderLink: async (hotelId: string, providerId: string, linked: boolean) => (await requestInternalApiEnvelope(path(hotelId, `/providers/${encodeURIComponent(providerId)}`), { method: linked ? "PUT" : "DELETE", ...(linked ? { body: { status: "ACTIVE", sortOrder: 0 } } : {}) })).data,
  list: async (hotelId: string, signal?: AbortSignal) => (await requestInternalApiEnvelope<LocalPartner[]>(path(hotelId), { method: "GET", signal })).data,
  categories: async (hotelId: string, signal?: AbortSignal) => (await requestInternalApiEnvelope<LocalPartnerCategory[]>(path(hotelId, "/categories"), { method: "GET", signal })).data,
  create: async (hotelId: string, input: LocalPartnerInput) => (await requestInternalApiEnvelope<LocalPartner>(path(hotelId), { method: "POST", body: JSON.stringify(input), headers: { "Content-Type": "application/json" } })).data,
  update: async (hotelId: string, partnerId: string, input: Partial<LocalPartnerInput>) => (await requestInternalApiEnvelope<LocalPartner>(path(hotelId, `/${encodeURIComponent(partnerId)}`), { method: "PATCH", body: JSON.stringify(input), headers: { "Content-Type": "application/json" } })).data,
  status: async (hotelId: string, partnerId: string, status: LocalPartnerStatus) => (await requestInternalApiEnvelope<LocalPartner>(path(hotelId, `/${encodeURIComponent(partnerId)}/status`), { method: "PATCH", body: JSON.stringify({ status }), headers: { "Content-Type": "application/json" } })).data,
};
