import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import type { CreateMarketplaceOrderInput, MarketplaceCategory, MarketplaceOrder, MarketplaceServicesPage } from "../types/marketplace-contract";

async function request<T>(sessionToken: string, path: string, init?: RequestInit, locale?: string): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${sessionToken}`,
    ...(locale ? { "Accept-Language": locale, "x-lang": locale } : {}),
    ...(init?.headers as Record<string, string>),
  };
  const response = await fetch(path, { ...init, headers });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error("Marketplace request failed");
  return unwrapApiEnvelope<T>(payload).data;
}

export const guestMarketplaceRepository = {
  categories: (token: string, locale?: string) => request<MarketplaceCategory[]>(token, "/api/guest/marketplace/categories", undefined, locale),
  services: (token: string, categoryId?: string, locale?: string) => request<MarketplaceServicesPage>(token, `/api/guest/marketplace/services${categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : ""}`, undefined, locale),
  order: (token: string, input: CreateMarketplaceOrderInput, locale?: string) => request<MarketplaceOrder>(token, "/api/guest/marketplace/orders", { method: "POST", body: JSON.stringify(input) }, locale),
  orders: (token: string, locale?: string) => request<MarketplaceOrder[]>(token, "/api/guest/marketplace/orders", undefined, locale),
};
