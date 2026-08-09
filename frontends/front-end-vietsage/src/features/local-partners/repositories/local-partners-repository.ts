import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type { LocalPartner, LocalPartnerCategory, LocalPartnerInput, LocalPartnerStatus } from "../types/local-partners-contract";

const path = (hotelId: string, suffix = "") => `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/local-partners${suffix}`;
export const localPartnersRepository = {
  list: async (hotelId: string, signal?: AbortSignal) => (await requestInternalApiEnvelope<LocalPartner[]>(path(hotelId), { method: "GET", signal })).data,
  categories: async (hotelId: string, signal?: AbortSignal) => (await requestInternalApiEnvelope<LocalPartnerCategory[]>(path(hotelId, "/categories"), { method: "GET", signal })).data,
  create: async (hotelId: string, input: LocalPartnerInput) => (await requestInternalApiEnvelope<LocalPartner>(path(hotelId), { method: "POST", body: JSON.stringify(input), headers: { "Content-Type": "application/json" } })).data,
  update: async (hotelId: string, partnerId: string, input: Partial<LocalPartnerInput>) => (await requestInternalApiEnvelope<LocalPartner>(path(hotelId, `/${encodeURIComponent(partnerId)}`), { method: "PATCH", body: JSON.stringify(input), headers: { "Content-Type": "application/json" } })).data,
  status: async (hotelId: string, partnerId: string, status: LocalPartnerStatus) => (await requestInternalApiEnvelope<LocalPartner>(path(hotelId, `/${encodeURIComponent(partnerId)}/status`), { method: "PATCH", body: JSON.stringify({ status }), headers: { "Content-Type": "application/json" } })).data,
};
