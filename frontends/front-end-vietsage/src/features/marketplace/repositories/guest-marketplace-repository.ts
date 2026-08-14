import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import type {
  AddMarketplaceCartItemInput,
  CheckoutMarketplaceCartInput,
  CheckoutMarketplaceCartResult,
  ConfirmMarketplaceCartInput,
  ConfirmMarketplaceCartResult,
  CreateMarketplaceOrderInput,
  MarketplaceCart,
  MarketplaceCategory,
  MarketplaceOrder,
  MarketplaceServiceItem,
  MarketplaceServicesPage,
  SyncMarketplaceCartInput,
  UpdateMarketplaceCartItemInput,
} from "../types/marketplace-contract";

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
  categories: (token: string, locale?: string) =>
    request<MarketplaceCategory[]>(token, "/api/guest/marketplace/categories", undefined, locale),
  services: (token: string, categoryId?: string, locale?: string) =>
    request<MarketplaceServicesPage>(token, `/api/guest/marketplace/services${categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : ""}`, undefined, locale),
  serviceDetail: (token: string, serviceId: string, locale?: string) =>
    request<MarketplaceServiceItem>(token, `/api/guest/marketplace/services/${encodeURIComponent(serviceId)}`, undefined, locale),
  order: (token: string, input: CreateMarketplaceOrderInput, locale?: string) =>
    request<MarketplaceOrder>(token, "/api/guest/marketplace/orders", { method: "POST", body: JSON.stringify(input) }, locale),
  orders: (token: string, locale?: string) =>
    request<MarketplaceOrder[]>(token, "/api/guest/marketplace/orders", undefined, locale),
  orderDetail: (token: string, orderId: string, locale?: string) =>
    request<MarketplaceOrder>(token, `/api/guest/marketplace/orders/${encodeURIComponent(orderId)}`, undefined, locale),
  cart: (token: string, locale?: string) =>
    request<MarketplaceCart>(token, "/api/guest/marketplace/cart", undefined, locale),
  checkoutCart: (token: string, input: CheckoutMarketplaceCartInput, locale?: string) =>
    request<CheckoutMarketplaceCartResult>(token, "/api/guest/marketplace/cart/checkout", { method: "POST", body: JSON.stringify(input) }, locale),
  confirmCart: (token: string, input: ConfirmMarketplaceCartInput, locale?: string) =>
    request<ConfirmMarketplaceCartResult>(token, "/api/guest/marketplace/cart/checkout", { method: "POST", body: JSON.stringify(input) }, locale),
  addCartItem: (token: string, input: AddMarketplaceCartItemInput, locale?: string) =>
    request<MarketplaceCart>(token, "/api/guest/marketplace/cart/items", { method: "POST", body: JSON.stringify(input) }, locale),
  updateCartItem: (token: string, itemId: string, input: UpdateMarketplaceCartItemInput, locale?: string) =>
    request<MarketplaceCart>(token, `/api/guest/marketplace/cart/items/${encodeURIComponent(itemId)}`, { method: "PATCH", body: JSON.stringify(input) }, locale),
  removeCartItem: (token: string, itemId: string, locale?: string) =>
    request<MarketplaceCart>(token, `/api/guest/marketplace/cart/items/${encodeURIComponent(itemId)}`, { method: "DELETE" }, locale),
  clearCart: (token: string, locale?: string) =>
    request<MarketplaceCart | { success: boolean }>(token, "/api/guest/marketplace/cart", { method: "DELETE" }, locale),
  syncCart: (token: string, input: SyncMarketplaceCartInput, locale?: string) =>
    request<MarketplaceCart>(token, "/api/guest/marketplace/cart", { method: "PUT", body: JSON.stringify(input) }, locale),
};
