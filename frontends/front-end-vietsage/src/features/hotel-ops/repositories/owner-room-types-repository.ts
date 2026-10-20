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
  async create(hotelId: string, body: { name: string; basePrice: number; maxOccupancy?: number | null }) {
    const response = await requestInternalApiEnvelope<HotelRoomType>(
      path(hotelId), { method: "POST", body },
    );
    return response.data;
  },
  async updatePrice(hotelId: string, body: { roomTypeId: string; basePrice?: number; maxOccupancy?: number | null }) {
    const response = await requestInternalApiEnvelope<HotelRoomType>(
      `${path(hotelId)}/${encodeURIComponent(body.roomTypeId)}/price`,
      { method: "PATCH", body: {
        ...(body.basePrice !== undefined ? { basePrice: body.basePrice } : {}),
        ...(body.maxOccupancy !== undefined ? { maxOccupancy: body.maxOccupancy } : {}),
      } },
    );
    return response.data;
  },
};
