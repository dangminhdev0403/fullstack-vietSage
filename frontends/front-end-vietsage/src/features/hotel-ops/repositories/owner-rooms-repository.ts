import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type {
  HotelOpsPage,
  HotelRoomSummary,
} from "@/features/hotel-ops/types/hotel-ops-contract";

export const ownerRoomsRepository = {
  async list(
    hotelId: string,
    signal?: AbortSignal,
  ): Promise<HotelOpsPage<HotelRoomSummary>> {
    const response = await requestInternalApiEnvelope<HotelOpsPage<HotelRoomSummary>>(
      `/api/owner/hotels/${encodeURIComponent(hotelId)}/rooms`,
      { method: "GET", signal },
    );
    return response.data;
  },
};
