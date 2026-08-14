import { z } from "zod";

export const createMarketplaceOrderSchema = z.object({
  serviceId: z.string().trim().min(1).max(80),
  quantity: z.number().int().min(1).max(100),
  guestNote: z.string().trim().max(500).nullish(),
  idempotencyKey: z.string().trim().min(8).max(120),
});

export const checkoutCartSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(120),
  guestNote: z.string().trim().max(500).nullish(),
});

export const marketplaceOrderIdSchema = z.string().trim().min(1).max(80);

export const marketplaceTransitionSchema = z.object({
  toStatus: z.enum([
    "CONFIRMED",
    "ACCEPTED",
    "PREPARING",
    "DELIVERING",
    "READY",
    "COMPLETED",
    "CANCELLED",
  ]),
  note: z.string().trim().max(500).nullish(),
});

export const marketplaceRevenueQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    serviceTenantId: z.string().trim().min(1).max(80).optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, "from must be before to");

export const marketplaceSettlementStatusSchema = z.enum([
  "UNSETTLED",
  "READY_FOR_SETTLEMENT",
  "SETTLED",
]);

export const settlementIdSchema = z.string().trim().min(1).max(80);

export const partnerSettlementQuerySchema = z.object({
  status: marketplaceSettlementStatusSchema.optional(),
  serviceTenantId: z.string().trim().min(1).max(80).optional(),
});

export const batchSettleSchema = z.object({
  settlementIds: z.array(z.string().trim().min(1).max(80)).min(1).max(100),
});

export type CreateMarketplaceOrder = z.infer<typeof createMarketplaceOrderSchema>;
export type CheckoutCart = z.infer<typeof checkoutCartSchema>;
export type MarketplaceTransition = z.infer<typeof marketplaceTransitionSchema>;
