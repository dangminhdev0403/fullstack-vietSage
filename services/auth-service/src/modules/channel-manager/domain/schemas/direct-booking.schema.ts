import { z } from "zod";

export const createHoldSchema = z
  .object({
    hotel_id: z.string().min(1, "hotel_id là bắt buộc"),
    room_type_id: z.string().min(1, "room_type_id là bắt buộc"),
    check_in_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "check_in_date phải có định dạng YYYY-MM-DD"),
    check_out_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "check_out_date phải có định dạng YYYY-MM-DD"),
    rooms_count: z.coerce.number().int().min(1).default(1).optional(),
    guest: z
      .object({
        name: z.string().optional(),
        email: z.string().email().or(z.literal("")).optional(),
        phone: z.string().optional(),
      })
      .optional(),
    ttl_minutes: z.coerce.number().int().min(1).max(1440).default(30).optional(),
    idempotency_key: z.string().optional(),
    operation_key: z.string().optional(),
  })
  .refine((data) => data.check_in_date < data.check_out_date, {
    message: "check_out_date phải sau check_in_date",
    path: ["check_out_date"],
  });

export type CreateHoldDto = z.infer<typeof createHoldSchema>;

export const confirmHoldSchema = z.object({
  hold_id: z.string().min(1).optional(),
  booking_id: z.string().min(1, "booking_id là bắt buộc"),
  idempotency_key: z.string().optional(),
  operation_key: z.string().optional(),
  // Fallback booking metadata — used to reconstruct hold on-the-fly when hold_id is not found in memory
  hotel_id: z.string().optional(),
  room_type_id: z.string().optional(),
  check_in_date: z.string().optional(),
  check_out_date: z.string().optional(),
  guest: z
    .object({
      name: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
    })
    .optional(),
  amount: z.coerce.number().optional(),
  currency: z.string().optional(),
});

export type ConfirmHoldDto = z.infer<typeof confirmHoldSchema>;

export const releaseHoldSchema = z.object({
  hold_id: z.string().min(1).optional(),
  reason: z.string().optional(),
  idempotency_key: z.string().optional(),
});

export type ReleaseHoldDto = z.infer<typeof releaseHoldSchema>;

export const directBookingStatusQuerySchema = z.object({
  operation_key: z.string().optional(),
  booking_id: z.string().optional(),
  hold_id: z.string().optional(),
});

export type DirectBookingStatusQueryDto = z.infer<typeof directBookingStatusQuerySchema>;

export const catalogExportSchema = z.object({
  hotel_id: z.string().min(1, "hotel_id là bắt buộc"),
  partner_email: z.string().optional(),
});

export type CatalogExportDto = z.infer<typeof catalogExportSchema>;
