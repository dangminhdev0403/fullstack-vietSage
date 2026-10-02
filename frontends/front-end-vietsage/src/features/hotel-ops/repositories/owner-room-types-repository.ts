import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type { HotelRoomType } from "../types/hotel-ops-contract";

const path = (hotelId: string) => `/api/owner/hotels/${encodeURIComponent(hotelId)}/room-types`;

export const ownerRoomTypesRepository = {
  async list(hotelId: string, signal?: AbortSignal) {
    const response = await requestInternalApiEnvelope<{ items: HotelRoomType[] }>(
      path(hotelId), { method: "GET", signal },
    );
    return response.data;
  },
  async create(hotelId: string, body: { name: string; basePrice: number }) {
    const response = await requestInternalApiEnvelope<HotelRoomType>(
      path(hotelId), { method: "POST", body },
    );
    return response.data;
  },
  async updatePrice(hotelId: string, body: { roomTypeId: string; basePrice: number }) {
    const response = await requestInternalApiEnvelope<HotelRoomType>(
      `${path(hotelId)}/${encodeURIComponent(body.roomTypeId)}/price`,
      { method: "PATCH", body: { basePrice: body.basePrice } },
    );
    return response.data;
  },
};
