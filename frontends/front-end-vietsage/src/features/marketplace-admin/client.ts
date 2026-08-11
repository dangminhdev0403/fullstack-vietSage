import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import { getBackendApiBaseUrl } from "@/core/http/backend-api-config";
import { HttpClient } from "@/core/http/http-client";
import type { MarketplaceCategory } from "@/features/marketplace/types/marketplace-contract";
const http = new HttpClient({ baseUrl: getBackendApiBaseUrl() });
const call = async <T, B = unknown>(token: string, method: "GET" | "POST" | "PUT" | "PATCH", path: string, body?: B) => unwrapApiEnvelope<T>(await http.request<unknown, B>({ method, path, accessToken: token, body })).data;
export type ServiceTenant = { id: string; code: string; name: string; ownerEmail?: string | null; serviceProfile: { displayName: string; status: string } | null };
export const marketplaceAdminClient = {
  categories: (token: string) => call<MarketplaceCategory[]>(token, "GET", "/admin/marketplace/categories"),
  tenants: (token: string) => call<ServiceTenant[]>(token, "GET", "/admin/marketplace/service-tenants"),
  category: (token: string, body: unknown) => call(token, "POST", "/admin/marketplace/categories", body),
  tenant: (token: string, body: unknown) => call(token, "POST", "/admin/marketplace/service-tenants", body),
  updateCategory: (token: string, id: string, body: unknown) => call(token, "PATCH", `/admin/marketplace/categories/${id}`, body),
  updateTenant: (token: string, id: string, body: unknown) => call(token, "PATCH", `/admin/marketplace/service-tenants/${id}`, body),
};
