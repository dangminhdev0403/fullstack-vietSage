import { z } from "zod";

export const createReservationBodySchema = z
  .object({
    guestDisplayName: z.string().trim().min(2).max(120),
    guestPhone: z.string().trim().max(40).optional(),
    plannedCheckInAt: z.coerce.date(),
    plannedCheckOutAt: z.coerce.date(),
  })
  .strict()
  .refine((value) => value.plannedCheckOutAt > value.plannedCheckInAt, {
    message: "plannedCheckOutAt phải sau plannedCheckInAt",
    path: ["plannedCheckOutAt"],
  });

export const listArrivalsQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict()
  .refine((value) => value.to > value.from, {
    message: "to phải sau from",
    path: ["to"],
  });

export const assignReservationRoomBodySchema = z
  .object({ roomId: z.string().trim().min(1) })
  .strict();

export type CreateReservationBodyInput = z.infer<typeof createReservationBodySchema>;
export type ListArrivalsQueryInput = z.infer<typeof listArrivalsQuerySchema>;
export type AssignReservationRoomBodyInput = z.infer<typeof assignReservationRoomBodySchema>;
