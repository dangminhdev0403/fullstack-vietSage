import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type { BillingPage, FolioItem, FolioSummary } from "../types/billing-contract";

export const folioPreviewRepository = {
  async load(hotelId: string, folioId: string) {
    const base = `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/billing/folios/${encodeURIComponent(folioId)}`;
    const [summary, items] = await Promise.all([
      requestInternalApiEnvelope<FolioSummary>(`${base}/summary`, { method: "GET" }),
      requestInternalApiEnvelope<BillingPage<FolioItem>>(`${base}/items?page=1&limit=100`, { method: "GET" }),
    ]);
    return { summary: summary.data, items: items.data.items };
  },
};
