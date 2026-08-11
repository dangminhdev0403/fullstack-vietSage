import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type { MarketplaceAdminAction, MarketplaceAdminData, MarketplaceCategorySheetPreview } from "./types";

export const marketplaceAdminRepository = {
  data: async () => (await requestInternalApiEnvelope<MarketplaceAdminData>("/api/admin/marketplace", { method: "GET" })).data,
  mutate: async (action: MarketplaceAdminAction) => (await requestInternalApiEnvelope<unknown>("/api/admin/marketplace", { method: "POST", body: action })).data,
  previewImport: async (spreadsheetUrl: string) =>
    (await requestInternalApiEnvelope<MarketplaceCategorySheetPreview>("/api/admin/marketplace", {
      method: "POST",
      body: { action: "previewImport", spreadsheetUrl },
    })).data,
  commitImport: async (spreadsheetUrl: string, expectedHash: string) =>
    (await requestInternalApiEnvelope<{ summary: { creates: number; updates: number; unchanged: number; errors: number } }>("/api/admin/marketplace", {
      method: "POST",
      body: { action: "commitImport", spreadsheetUrl, expectedHash },
    })).data,
};
