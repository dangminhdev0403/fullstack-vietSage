import { z } from "zod";

export const createMarketplaceOrderSchema = z.object({
  serviceId: z.string().trim().min(1).max(80),
  quantity: z.number().int().min(1).max(100),
  guestNote: z.string().trim().max(500).nullish(),
  idempotencyKey: z.string().trim().min(8).max(120),
});
export const marketplaceOrderIdSchema = z.string().trim().min(1).max(80);
export const marketplaceTransitionSchema = z.object({
  toStatus: z.enum(["ACCEPTED", "PREPARING", "DELIVERING", "READY", "COMPLETED", "CANCELLED"]),
  note: z.string().trim().max(500).nullish(),
});
export type CreateMarketplaceOrder = z.infer<typeof createMarketplaceOrderSchema>;
export type MarketplaceTransition = z.infer<typeof marketplaceTransitionSchema>;
