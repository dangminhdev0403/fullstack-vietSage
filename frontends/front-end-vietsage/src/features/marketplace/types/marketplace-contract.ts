export type MarketplaceCategoryTranslation = { locale: string; name: string };
export type MarketplaceCategory = { id: string; code: string; nameVi: string; name?: string; isActive?: boolean; translations?: MarketplaceCategoryTranslation[] };
export type MarketplaceServiceItem = {
  id: string;
  name: string;
  description?: string | null;
  unitPrice: string | number;
  currency: string;
  unit?: string | null;
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
export type MarketplaceOrder = {
  id: string;
  orderNumber: string;
  status: string;
  hotelCoordinationStatus?: string | null;
  voucher?: {
    voucherNumber: string;
    verificationCode?: string;
    qrTokenHash?: string;
    status: string;
    issuedAt?: string;
    expiresAt?: string;
  } | null;
  quantity: number;
  unitPriceSnapshot?: string | number | null;
  unitSnapshot?: string | null;
  pricingUnitSnapshot?: string | null;
  pricingUnit?: string | null;
  totalAmount: string | number;
  currency: string;
  serviceNameSnapshot: string;
  serviceModeSnapshot: "DELIVERY_TO_HOTEL" | "CUSTOMER_AT_SERVICE";
  guestNote?: string | null;
  createdAt: string;
  serviceTenant?: {
    serviceProfile?: {
      displayName?: string | null;
    } | null;
  } | null;
  stay?: {
    guestDisplayName?: string | null;
    room?: {
      roomNumber?: string | null;
    } | null;
  } | null;
  hotel?: {
    name?: string | null;
  } | null;
};
