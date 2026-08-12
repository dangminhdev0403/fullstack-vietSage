import type { MarketplaceOrderStatus } from "@prisma/client";

const transitions: Record<MarketplaceOrderStatus, readonly MarketplaceOrderStatus[]> = {
  PENDING: ["ACCEPTED", "PREPARING", "CONFIRMED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "DELIVERING", "READY", "CONFIRMED", "COMPLETED", "CANCELLED"],
  PREPARING: ["DELIVERING", "READY", "CONFIRMED", "COMPLETED", "CANCELLED"],
  DELIVERING: ["COMPLETED", "CANCELLED"],
  READY: ["COMPLETED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionMarketplaceOrder(
  from: MarketplaceOrderStatus,
  to: MarketplaceOrderStatus,
) {
  return transitions[from]?.includes(to) ?? false;
}
