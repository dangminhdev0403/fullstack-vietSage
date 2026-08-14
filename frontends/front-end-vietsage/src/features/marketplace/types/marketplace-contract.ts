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
export type MarketplaceSettlement = {
  id: string;
  orderId: string;
  hotelId: string;
  serviceTenantId: string;
  grossAmount: string | number;
  commissionAmount: string | number;
  netAmount: string | number;
  currency: string;
  status: "UNSETTLED" | "READY_FOR_SETTLEMENT" | "SETTLED";
  settledAt?: string | null;
  settledBy?: string | null;
  settledAmount?: string | number | null;
  settlementReference?: string | null;
  createdAt: string;
  updatedAt: string;
};
export type PartnerFinancialSummary = {
  totalOrdersCount: number;
  completedOrdersCount: number;
  cancelledOrdersCount: number;
  grossSalesAmount: number;
  hotelCollectedAmount: number;
  totalNetPayable: number;
  settledAmount: number;
  outstandingAmount: number;
};
export type MarketplaceOrderItem = {
  id?: string;
  serviceId?: string;
  serviceName: string;
  quantity: number;
  unitPrice: string | number;
  pricingUnit?: string | null;
  totalAmount?: string | number;
  currency?: string;
  serviceTenantId?: string;
  serviceTenantName?: string;
  serviceMode?: "DELIVERY_TO_HOTEL" | "CUSTOMER_AT_SERVICE";
};

export type MarketplaceOrderFinancials = {
  partnerSubtotal: number;
  hotelFee: number;
  customerTotal: number;
  currency: string;
};

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
  settlement?: MarketplaceSettlement | null;
  items?: MarketplaceOrderItem[];
  partnerSubtotal?: string | number | null;
  hotelFee?: string | number | null;
  customerTotal?: string | number | null;
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
  serviceTenantId?: string;
  serviceTenant?: {
    id?: string;
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

export type MarketplaceCartItem = {
  id?: string;
  serviceId: string;
  serviceName?: string;
  unitPrice: number | string;
  quantity: number;
  subtotal?: number;
  currency?: string;
  guestNote?: string | null;
  unit?: string | null;
  pricingUnit?: string | null;
  mode?: "DELIVERY_TO_HOTEL" | "CUSTOMER_AT_SERVICE";
  serviceTenant?: {
    id?: string;
    serviceProfile?: {
      displayName?: string | null;
      address?: string | null;
      phone?: string | null;
    } | null;
  } | null;
  service?: MarketplaceServiceItem | null;
};

export type MarketplaceCart = {
  id?: string;
  stayId?: string;
  items: MarketplaceCartItem[];
  partnerSubtotal?: number;
  subtotal?: number;
  hotelServiceFee?: number;
  hotelServiceFeeRate?: number;
  customerTotal?: number;
  totalAmount?: number | string;
  currency: string;
  itemCount?: number;
  updatedAt?: string;
};

export type AddMarketplaceCartItemInput = {
  serviceId: string;
  quantity: number;
  guestNote?: string;
};

export type UpdateMarketplaceCartItemInput = {
  quantity: number;
  guestNote?: string;
};

export type SyncMarketplaceCartInput = {
  items: Array<{
    serviceId: string;
    quantity: number;
    guestNote?: string;
  }>;
};

export type CheckoutMarketplaceCartInput = {
  idempotencyKey?: string;
  guestNote?: string;
  generalNote?: string;
  items?: Array<{
    serviceId: string;
    quantity: number;
    guestNote?: string;
  }>;
};

export type CheckoutMarketplaceCartResult = {
  success?: boolean;
  order?: MarketplaceOrder;
  orders?: MarketplaceOrder[];
  primaryOrderId?: string;
  orderNumber?: string;
  totalAmount?: number | string;
  id?: string;
};

export type MarketplaceCartQuoteItem = MarketplaceCartItem;
export type MarketplaceCartQuote = MarketplaceCart;
export type ConfirmMarketplaceCartInput = CheckoutMarketplaceCartInput;
export type ConfirmMarketplaceCartResult = CheckoutMarketplaceCartResult;
