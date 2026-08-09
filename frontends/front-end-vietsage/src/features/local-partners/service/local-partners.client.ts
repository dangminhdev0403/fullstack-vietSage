import { getBackendApiBaseUrl } from "@/core/http/backend-api-config";
import type {
  LocalPartner,
  LocalPartnerCategory,
  LocalPartnerBookingRequest,
  LocalPartnerAnalytics,
} from "../types/local-partners-contract";

export class LocalPartnersClientService {
  constructor(private readonly baseUrl: string = getBackendApiBaseUrl()) {}

  async getGuestCategories(): Promise<LocalPartnerCategory[]> {
    const res = await fetch(`${this.baseUrl}/guest/local-partners/categories`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    const body = await res.json();
    return body.data || [];
  }

  async getGuestPartners(
    hotelId: string,
    query?: { categoryId?: string; maxDistanceMeters?: number; q?: string },
  ): Promise<LocalPartner[]> {
    const params = new URLSearchParams();
    if (query?.categoryId) params.set("categoryId", query.categoryId);
    if (query?.maxDistanceMeters) params.set("maxDistanceMeters", String(query.maxDistanceMeters));
    if (query?.q) params.set("q", query.q);

    const queryString = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${this.baseUrl}/guest/local-partners/hotels/${hotelId}/partners${queryString}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    const body = await res.json();
    return body.data || [];
  }

  async getGuestPartnerDetail(hotelId: string, partnerId: string, stayId?: string): Promise<LocalPartner> {
    const queryString = stayId ? `?stayId=${stayId}` : "";
    const res = await fetch(
      `${this.baseUrl}/guest/local-partners/hotels/${hotelId}/partners/${partnerId}${queryString}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
    );
    const body = await res.json();
    return body.data;
  }

  async claimOffer(hotelId: string, partnerId: string, offerId: string, stayId?: string) {
    const queryString = stayId ? `?stayId=${stayId}` : "";
    const res = await fetch(
      `${this.baseUrl}/guest/local-partners/hotels/${hotelId}/partners/${partnerId}/offers/${offerId}/claim${queryString}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
    );
    const body = await res.json();
    return body.data;
  }

  async createBookingRequest(hotelId: string, payload: any, stayId?: string): Promise<LocalPartnerBookingRequest> {
    const queryString = stayId ? `?stayId=${stayId}` : "";
    const res = await fetch(`${this.baseUrl}/guest/local-partners/hotels/${hotelId}/booking-requests${queryString}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    return body.data;
  }

  async recordInteraction(hotelId: string, partnerId: string, actionType: string, stayId?: string) {
    const queryString = stayId ? `?stayId=${stayId}` : "";
    await fetch(`${this.baseUrl}/guest/local-partners/hotels/${hotelId}/interactions${queryString}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerId, actionType }),
    });
  }

  // Staff & Owner endpoints
  async getStaffPartners(hotelId: string, accessToken: string, categoryId?: string, q?: string): Promise<LocalPartner[]> {
    const params = new URLSearchParams();
    if (categoryId) params.set("categoryId", categoryId);
    if (q) params.set("q", q);

    const queryString = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${this.baseUrl}/hotels/${hotelId}/local-partners/partners${queryString}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const body = await res.json();
    return body.data || [];
  }

  async createPartner(hotelId: string, accessToken: string, payload: any): Promise<LocalPartner> {
    const res = await fetch(`${this.baseUrl}/hotels/${hotelId}/local-partners/partners`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    return body.data;
  }

  async updatePartner(hotelId: string, partnerId: string, accessToken: string, payload: any): Promise<LocalPartner> {
    const res = await fetch(`${this.baseUrl}/hotels/${hotelId}/local-partners/partners/${partnerId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    return body.data;
  }

  async deletePartner(hotelId: string, partnerId: string, accessToken: string): Promise<void> {
    await fetch(`${this.baseUrl}/hotels/${hotelId}/local-partners/partners/${partnerId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  async createOffer(hotelId: string, partnerId: string, accessToken: string, payload: any) {
    const res = await fetch(`${this.baseUrl}/hotels/${hotelId}/local-partners/partners/${partnerId}/offers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    return body.data;
  }

  async getStaffBookingRequests(hotelId: string, accessToken: string): Promise<LocalPartnerBookingRequest[]> {
    const res = await fetch(`${this.baseUrl}/hotels/${hotelId}/local-partners/booking-requests`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const body = await res.json();
    return body.data || [];
  }

  async updateBookingRequestStatus(
    hotelId: string,
    requestId: string,
    accessToken: string,
    status: string,
  ): Promise<LocalPartnerBookingRequest> {
    const res = await fetch(
      `${this.baseUrl}/hotels/${hotelId}/local-partners/booking-requests/${requestId}/status`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ status }),
      },
    );
    const body = await res.json();
    return body.data;
  }

  async getStaffAnalytics(hotelId: string, accessToken: string): Promise<LocalPartnerAnalytics> {
    const res = await fetch(`${this.baseUrl}/hotels/${hotelId}/local-partners/analytics`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const body = await res.json();
    return body.data;
  }
}

export const localPartnersClient = new LocalPartnersClientService();
