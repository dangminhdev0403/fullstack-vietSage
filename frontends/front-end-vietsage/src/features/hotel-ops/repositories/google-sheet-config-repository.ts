import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type { Hotel, UpdateHotelInput } from "@/features/admin/types/admin-contract";

export const googleSheetConfigRepository = {
  async update(
    hotelId: string,
    input: UpdateHotelInput,
  ): Promise<Hotel> {
    const payload = await requestInternalApiEnvelope<Hotel>(
      `/api/admin/hotels/${encodeURIComponent(hotelId)}`,
      {
      method: "PATCH",
      body: input,
      },
    );
    return payload.data;
  },

  async sync(hotelId: string): Promise<void> {
    await requestInternalApiEnvelope(
      `/api/owner/hotels/${encodeURIComponent(hotelId)}/service-catalog/sync`,
      { method: "POST" },
    );
  },
};
