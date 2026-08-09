import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import { getBackendApiBaseUrl } from "@/core/http/backend-api-config";
import { HttpClient } from "@/core/http/http-client";
import type { ServiceItem, ServicePortalData, ServiceProfile } from "./types";
import type { MarketplaceCategory, MarketplaceOrder } from "@/features/marketplace/types/marketplace-contract";

const http = new HttpClient({ baseUrl: getBackendApiBaseUrl() });
const req = async <T, B = unknown>(token: string, method: "GET" | "POST" | "PATCH", path: string, body?: B) => unwrapApiEnvelope<T>(await http.request<unknown, B>({ method, path, accessToken: token, body })).data;
export const servicePortalClient = {
  data: async (token: string): Promise<ServicePortalData> => {
    const [profile, categories, services, orders] = await Promise.all([
      req<ServiceProfile>(token, "GET", "/service-portal/profile"), req<MarketplaceCategory[]>(token, "GET", "/service-portal/categories"), req<ServiceItem[]>(token, "GET", "/service-portal/services"), req<MarketplaceOrder[]>(token, "GET", "/service-portal/orders"),
    ]);
    return { profile, categories, services, orders };
  },
  profile: (token: string, body: Partial<ServiceProfile>) => req<ServiceProfile, Partial<ServiceProfile>>(token, "PATCH", "/service-portal/profile", body),
  create: (token: string, body: unknown) => req<ServiceItem, unknown>(token, "POST", "/service-portal/services", body),
  transition: (token: string, orderId: string, toStatus: string) => req<MarketplaceOrder, { toStatus: string }>(token, "POST", `/service-portal/orders/${encodeURIComponent(orderId)}/transitions`, { toStatus }),
};
