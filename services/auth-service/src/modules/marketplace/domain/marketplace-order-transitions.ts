import type { MarketplaceOrderStatus } from "@prisma/client";

const transitions: Record<MarketplaceOrderStatus, readonly MarketplaceOrderStatus[]> = {
  PENDING: ["ACKNOWLEDGED", "COMPLETED", "CANCELLED", "REJECTED"],
  ACKNOWLEDGED: ["COMPLETED", "CANCELLED", "REJECTED"],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
};

export function canTransitionMarketplaceOrder(
  from: MarketplaceOrderStatus,
  to: MarketplaceOrderStatus,
) {
  return transitions[from]?.includes(to) ?? false;
}
