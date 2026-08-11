import type { MarketplaceOrderStatus, MarketplaceServiceMode } from "@prisma/client";

const transitions: Record<MarketplaceOrderStatus, readonly MarketplaceOrderStatus[]> = {
  PENDING: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["DELIVERING", "READY", "CANCELLED"],
  DELIVERING: ["COMPLETED", "CANCELLED"],
  READY: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionMarketplaceOrder(
  from: MarketplaceOrderStatus,
  to: MarketplaceOrderStatus,
  mode: MarketplaceServiceMode,
) {
  return (
    transitions[from].includes(to) &&
    (to !== "DELIVERING" || mode === "DELIVERY_TO_HOTEL") &&
    (to !== "READY" || mode === "CUSTOMER_AT_SERVICE")
  );
}
