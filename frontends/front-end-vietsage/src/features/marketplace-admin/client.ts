import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import { getBackendApiBaseUrl } from "@/core/http/backend-api-config";
import { HttpClient } from "@/core/http/http-client";
import type { MarketplaceCategory } from "@/features/marketplace/types/marketplace-contract";
const http = new HttpClient({ baseUrl: getBackendApiBaseUrl() });
const call = async <T, B = unknown>(token: string, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: B) => unwrapApiEnvelope<T>(await http.request<unknown, B>({ method, path, accessToken: token, body })).data;
export type ServiceTenant = { id: string; code: string; name: string; ownerEmail?: string | null; ownerFullName?: string | null; serviceProfile: { displayName: string; status: string; categoryId?: string | null; category?: MarketplaceCategory | null } | null };
export const marketplaceAdminClient = {
  categories: (token: string) => call<MarketplaceCategory[]>(token, "GET", "/admin/marketplace/categories"),
  tenants: (token: string) => call<ServiceTenant[]>(token, "GET", "/admin/marketplace/service-tenants"),
  category: (token: string, body: unknown) => call(token, "POST", "/admin/marketplace/categories", body),
  tenant: (token: string, body: unknown) => call(token, "POST", "/admin/marketplace/service-tenants", body),
  updateCategory: (token: string, id: string, body: unknown) => call(token, "PATCH", `/admin/marketplace/categories/${id}`, body),
  deleteCategory: (token: string, id: string) => call(token, "DELETE", `/admin/marketplace/categories/${id}`),
  updateTenant: (token: string, id: string, body: unknown) => call(token, "PATCH", `/admin/marketplace/service-tenants/${id}`, body),
  previewImport: (token: string, spreadsheetUrl: string) => call(token, "POST", "/admin/marketplace/categories/import/preview", { spreadsheetUrl }),
  commitImport: (token: string, spreadsheetUrl: string, expectedHash: string) => call(token, "POST", "/admin/marketplace/categories/import/commit", { spreadsheetUrl, expectedHash }),
  importTemplate: async (token: string) => {
    const response = await fetch(`${getBackendApiBaseUrl()}/admin/marketplace/categories/import/template`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    return response.text();
  },
};
