import { z } from "zod";

export const requestRealtimeTicketResponseSchema = z.object({
  ticket: z.string().min(1),
  expiresAt: z.string().datetime(),
});
