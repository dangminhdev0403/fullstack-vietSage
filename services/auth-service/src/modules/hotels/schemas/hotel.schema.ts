import { HotelStatus } from "@prisma/client";
import { z } from "zod";
import { jsonRecordSchema } from "./shared.schema";

export const createHotelBodySchema = z
  .object({
    tenantId: z.string().max(80, "tenantId không được vượt quá 80 ký tự").optional(),
    name: z.string().trim().min(2).max(160),
    timezone: z.string().trim().min(1).max(80).optional(),
    brandSettings: jsonRecordSchema.optional(),
  })
  .strict();

export const listHotelsQuerySchema = z
  .object({
    tenantId: z.string().max(80).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    q: z.string().max(120).optional(),
  })
  .strict();

export const updateHotelBodySchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    timezone: z.string().trim().min(1).max(80).optional(),
    brandSettings: jsonRecordSchema.nullable().optional(),
    status: z.nativeEnum(HotelStatus).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Cần ít nhất một trường khách sạn",
  });

export type CreateHotelBodyInput = z.infer<typeof createHotelBodySchema>;
export type ListHotelsQueryInput = z.infer<typeof listHotelsQuerySchema>;
export type UpdateHotelBodyInput = z.infer<typeof updateHotelBodySchema>;
