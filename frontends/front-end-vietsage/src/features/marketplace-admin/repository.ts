import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type { MarketplaceAdminAction, MarketplaceAdminData } from "./types";

export const marketplaceAdminRepository = {
  data: async () => (await requestInternalApiEnvelope<MarketplaceAdminData>("/api/admin/marketplace", { method: "GET" })).data,
  mutate: async (action: MarketplaceAdminAction) => (await requestInternalApiEnvelope<unknown>("/api/admin/marketplace", { method: "POST", body: action })).data,
};
