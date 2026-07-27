import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type { Hotel, UpdateHotelInput } from "@/features/admin/types/admin-contract";

export type GoogleSheetConfigScope = {
  hotelId: string;
  surface: "admin" | "owner";
};

function hotelEndpoint(scope: GoogleSheetConfigScope): string {
  return `/api/${scope.surface}/hotels/${encodeURIComponent(scope.hotelId)}`;
}

export const googleSheetConfigRepository = {
  async update(
    scope: GoogleSheetConfigScope,
    input: UpdateHotelInput,
  ): Promise<Hotel> {
    const payload = await requestInternalApiEnvelope<Hotel>(hotelEndpoint(scope), {
      method: "PATCH",
      body: input,
    });
    return payload.data;
  },

  async sync(scope: GoogleSheetConfigScope): Promise<void> {
    await requestInternalApiEnvelope(
      `/api/owner/hotels/${encodeURIComponent(scope.hotelId)}/service-catalog/sync`,
      { method: "POST" },
    );
  },
};
