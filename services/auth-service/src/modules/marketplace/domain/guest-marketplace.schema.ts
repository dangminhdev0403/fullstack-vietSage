import { z } from "zod";

export const guestMarketplaceQuerySchema = z.object({
  categoryId: z.string().trim().min(1).max(80).optional(),
  serviceTenantId: z.string().trim().min(1).max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const guestMarketplaceIdSchema = z.string().trim().min(1).max(80);

export const addCartItemSchema = z.object({
  serviceId: z.string().trim().min(1).max(80),
  quantity: z.number().int().min(1).max(100).default(1),
  guestNote: z.string().trim().max(500).nullish(),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(0).max(100),
  guestNote: z.string().trim().max(500).nullish(),
});

export const cartItemIdSchema = z.string().trim().min(1).max(80);
export const syncCartSchema = z.object({ items: z.array(addCartItemSchema).max(50) });

export const checkoutCartSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(120),
  guestNote: z.string().trim().max(500).nullish(),
});

export type GuestMarketplaceQuery = z.infer<typeof guestMarketplaceQuerySchema>;
export type AddCartItem = z.infer<typeof addCartItemSchema>;
export type UpdateCartItem = z.infer<typeof updateCartItemSchema>;
export type SyncCart = z.infer<typeof syncCartSchema>;
export type CheckoutCart = z.infer<typeof checkoutCartSchema>;
