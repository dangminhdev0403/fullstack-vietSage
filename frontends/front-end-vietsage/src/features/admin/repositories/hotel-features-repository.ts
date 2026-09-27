import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type {
  HotelFeatureItem,
  UpdateHotelFeatureStatusPayload,
} from "@/features/admin/types/admin-contract";

export const hotelFeaturesRepository = {
  async list(hotelId: string, signal?: AbortSignal): Promise<HotelFeatureItem[]> {
    const payload = await requestInternalApiEnvelope<HotelFeatureItem[]>(
      `/api/admin/hotels/${encodeURIComponent(hotelId)}/features`,
      {
        method: "GET",
        signal,
      },
    );
    return payload.data;
  },

  async updateStatus(
    hotelId: string,
    featureKey: string,
    body: UpdateHotelFeatureStatusPayload,
  ): Promise<HotelFeatureItem> {
    const payload = await requestInternalApiEnvelope<HotelFeatureItem, UpdateHotelFeatureStatusPayload>(
      `/api/admin/hotels/${encodeURIComponent(hotelId)}/features/${encodeURIComponent(featureKey)}`,
      {
        method: "PUT",
        body,
      },
    );
    return payload.data;
  },
};
