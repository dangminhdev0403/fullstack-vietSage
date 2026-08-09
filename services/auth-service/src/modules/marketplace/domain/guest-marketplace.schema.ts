import { z } from "zod";

export const guestMarketplaceQuerySchema = z.object({
  categoryId: z.string().trim().min(1).max(80).optional(),
  serviceTenantId: z.string().trim().min(1).max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const guestMarketplaceIdSchema = z.string().trim().min(1).max(80);
export type GuestMarketplaceQuery = z.infer<typeof guestMarketplaceQuerySchema>;
