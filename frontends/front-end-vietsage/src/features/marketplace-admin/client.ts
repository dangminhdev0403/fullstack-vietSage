import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import { getBackendApiBaseUrl } from "@/core/http/backend-api-config";
import { HttpClient } from "@/core/http/http-client";
import type { MarketplaceCategory } from "@/features/marketplace/types/marketplace-contract";
const http = new HttpClient({ baseUrl: getBackendApiBaseUrl() });
const call = async <T, B = unknown>(token: string, method: "GET" | "POST" | "PUT", path: string, body?: B) => unwrapApiEnvelope<T>(await http.request<unknown, B>({ method, path, accessToken: token, body })).data;
export type ServiceTenant = { id: string; code: string; name: string; serviceProfile: { displayName: string; status: string } | null };
export type HotelLink = { id: string; hotelId: string; serviceTenantId: string; status: string; sortOrder: number; serviceTenant: ServiceTenant };
export const marketplaceAdminClient = {
  categories: (token: string) => call<MarketplaceCategory[]>(token, "GET", "/admin/marketplace/categories"),
  tenants: (token: string) => call<ServiceTenant[]>(token, "GET", "/admin/marketplace/service-tenants"),
  links: (token: string, hotelId: string) => call<HotelLink[]>(token, "GET", `/admin/marketplace/hotel-links?hotelId=${encodeURIComponent(hotelId)}`),
  category: (token: string, body: unknown) => call(token, "POST", "/admin/marketplace/categories", body),
  tenant: (token: string, body: unknown) => call(token, "POST", "/admin/marketplace/service-tenants", body),
  link: (token: string, hotelId: string, tenantId: string) => call(token, "PUT", `/admin/marketplace/hotel-links/${encodeURIComponent(hotelId)}/${encodeURIComponent(tenantId)}`, { status: "ACTIVE", sortOrder: 0 }),
};
