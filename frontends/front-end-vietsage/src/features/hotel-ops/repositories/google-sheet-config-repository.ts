import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type {
  Hotel,
  UpdateHotelInput,
} from "@/features/admin/types/admin-contract";
import type { ServiceCatalogSyncResult } from "@/features/hotel-ops/service/service-catalog-sync-response";

export const googleSheetConfigRepository = {
  async update(hotelId: string, input: UpdateHotelInput): Promise<Hotel> {
    const payload = await requestInternalApiEnvelope<Hotel>(
      `/api/admin/hotels/${encodeURIComponent(hotelId)}`,
      {
        method: "PATCH",
        body: input,
      },
    );
    return payload.data;
  },

  async sync(hotelId: string): Promise<ServiceCatalogSyncResult> {
    const payload = await requestInternalApiEnvelope<ServiceCatalogSyncResult>(
      `/api/owner/hotels/${encodeURIComponent(hotelId)}/service-catalog/sync`,
      { method: "POST" },
    );
    return payload.data;
  },
};
