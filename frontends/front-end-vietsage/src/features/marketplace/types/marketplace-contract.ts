export type MarketplaceCategory = { id: string; code: string; nameVi: string; nameEn: string; icon?: string | null };
export type MarketplaceServiceItem = {
  id: string;
  name: string;
  description?: string | null;
  unitPrice: string | number;
  currency: string;
  imageUrls: string[];
  mode: "DELIVERY_TO_HOTEL" | "CUSTOMER_AT_SERVICE";
  capacityAvailable?: number | null;
  waitingMinutes: number;
  distanceMeters: number | null;
  category: MarketplaceCategory;
  serviceTenant: { id: string; serviceProfile: { displayName: string; address?: string | null; phone?: string | null; googleMapsUrl?: string | null } | null };
};
export type MarketplaceServicesPage = { page: number; limit: number; total: number; items: MarketplaceServiceItem[] };
export type CreateMarketplaceOrderInput = { serviceId: string; quantity: number; guestNote?: string; idempotencyKey: string };
export type MarketplaceOrder = { id: string; orderNumber: string; status: string; quantity: number; totalAmount: string | number; currency: string; serviceNameSnapshot: string; serviceModeSnapshot: "DELIVERY_TO_HOTEL" | "CUSTOMER_AT_SERVICE"; createdAt: string };
