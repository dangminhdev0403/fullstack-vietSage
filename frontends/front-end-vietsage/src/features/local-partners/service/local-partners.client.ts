import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import { HttpClient } from "@/core/http/http-client";
import type { HotelMarketplaceOrder, LocalPartner, LocalPartnerCategory, LocalPartnerInput, LocalPartnerStatus, NearbyServiceProvider } from "../types/local-partners-contract";

export class LocalPartnersClientService {
  constructor(private readonly http: HttpClient) {}

  private hotelPath(hotelId: string, suffix = "") {
    return `/hotels/${encodeURIComponent(hotelId)}/local-partners${suffix}`;
  }

  private marketplacePath(hotelId: string, suffix = "") {
    return `/hotels/${encodeURIComponent(hotelId)}/marketplace/providers${suffix}`;
  }

  async providers(hotelId: string, accessToken: string): Promise<NearbyServiceProvider[]> {
    return unwrapApiEnvelope<NearbyServiceProvider[]>(await this.http.request<unknown>({ method: "GET", path: this.marketplacePath(hotelId), accessToken })).data;
  }

  async marketplaceOrders(hotelId: string, accessToken: string): Promise<HotelMarketplaceOrder[]> {
    return unwrapApiEnvelope<HotelMarketplaceOrder[]>(await this.http.request<unknown>({ method: "GET", path: `/hotels/${encodeURIComponent(hotelId)}/marketplace/orders`, accessToken })).data;
  }

  async setProviderLink(hotelId: string, providerId: string, linked: boolean, accessToken: string) {
    return this.http.request({ method: linked ? "PUT" : "DELETE", path: this.marketplacePath(hotelId, `/${encodeURIComponent(providerId)}`), accessToken, ...(linked ? { body: { status: "ACTIVE", sortOrder: 0 } } : {}) });
  }

  async list(hotelId: string, accessToken: string): Promise<LocalPartner[]> {
    const response = await this.http.request<unknown>({ method: "GET", path: this.hotelPath(hotelId), accessToken });
    return unwrapApiEnvelope<LocalPartner[]>(response).data;
  }

  async categories(hotelId: string, accessToken: string): Promise<LocalPartnerCategory[]> {
    const response = await this.http.request<unknown>({ method: "GET", path: this.hotelPath(hotelId, "/categories"), accessToken });
    return unwrapApiEnvelope<LocalPartnerCategory[]>(response).data;
  }

  async create(hotelId: string, input: LocalPartnerInput, accessToken: string): Promise<LocalPartner> {
    const response = await this.http.request<unknown, LocalPartnerInput>({ method: "POST", path: this.hotelPath(hotelId), body: input, accessToken });
    return unwrapApiEnvelope<LocalPartner>(response).data;
  }

  async update(hotelId: string, partnerId: string, input: Partial<LocalPartnerInput>, accessToken: string): Promise<LocalPartner> {
    const response = await this.http.request<unknown, Partial<LocalPartnerInput>>({ method: "PATCH", path: this.hotelPath(hotelId, `/${encodeURIComponent(partnerId)}`), body: input, accessToken });
    return unwrapApiEnvelope<LocalPartner>(response).data;
  }

  async status(hotelId: string, partnerId: string, status: LocalPartnerStatus, accessToken: string): Promise<LocalPartner> {
    const response = await this.http.request<unknown, { status: LocalPartnerStatus }>({ method: "PATCH", path: this.hotelPath(hotelId, `/${encodeURIComponent(partnerId)}/status`), body: { status }, accessToken });
    return unwrapApiEnvelope<LocalPartner>(response).data;
  }
}
