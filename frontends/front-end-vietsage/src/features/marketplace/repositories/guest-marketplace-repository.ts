import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import type { CreateMarketplaceOrderInput, MarketplaceCategory, MarketplaceOrder, MarketplaceServicesPage } from "../types/marketplace-contract";

async function request<T>(sessionToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}`, ...init?.headers } });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error("Marketplace request failed");
  return unwrapApiEnvelope<T>(payload).data;
}

export const guestMarketplaceRepository = {
  categories: (token: string) => request<MarketplaceCategory[]>(token, "/api/guest/marketplace/categories"),
  services: (token: string, categoryId?: string) => request<MarketplaceServicesPage>(token, `/api/guest/marketplace/services${categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : ""}`),
  order: (token: string, input: CreateMarketplaceOrderInput) => request<MarketplaceOrder>(token, "/api/guest/marketplace/orders", { method: "POST", body: JSON.stringify(input) }),
};
