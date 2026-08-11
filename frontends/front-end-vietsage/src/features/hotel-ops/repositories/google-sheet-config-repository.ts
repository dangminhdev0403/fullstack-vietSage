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

  async sync(hotelId: string, body?: { spreadsheetUrl?: string; mode?: string }): Promise<ServiceCatalogSyncResult> {
    const payload = await requestInternalApiEnvelope<ServiceCatalogSyncResult>(
      `/api/owner/hotels/${encodeURIComponent(hotelId)}/service-catalog/sync`,
      { method: "POST", body },
    );
    return payload.data;
  },

  async preview(hotelId: string, body: { spreadsheetUrl: string; mode?: string }) {
    const payload = await requestInternalApiEnvelope<{
      workbookHash: string;
      summary: { create: number; update: number; disable: number; unchanged: number; errors: number; warnings: number };
      validation: Array<{ severity: string; message: string }>;
      diff: Array<{ entityType: string; action: string; label: string }>;
    }>(
      `/api/owner/hotels/${encodeURIComponent(hotelId)}/service-catalog/import/preview`,
      { method: "POST", body },
    );
    return payload.data;
  },

  async commit(hotelId: string, body: { spreadsheetUrl: string; expectedHash: string; mode?: string }) {
    const payload = await requestInternalApiEnvelope<{
      summary: { create: number; update: number; disable: number; unchanged: number; errors: number; warnings: number };
    }>(
      `/api/owner/hotels/${encodeURIComponent(hotelId)}/service-catalog/import/commit`,
      { method: "POST", body },
    );
    return payload.data;
  },
};
