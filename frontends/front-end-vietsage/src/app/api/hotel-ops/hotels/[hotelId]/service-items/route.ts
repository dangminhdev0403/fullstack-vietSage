import { z } from "zod";

import {
  executeHotelOpsBackendRequest,
  hotelOpsHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import type { CreateServiceItemInput } from "@/features/hotel-ops/types/hotel-ops-contract";

type Params = { params: Promise<{ hotelId: string }> };

const translationSchema = z.object({ name: z.string().trim().min(1), description: z.string().trim().nullable().optional() }).strict();
const translationsSchema = z.object({ en: translationSchema.optional(), zh: translationSchema.optional(), ko: translationSchema.optional(), ru: translationSchema.optional(), hi: translationSchema.optional() }).strict().optional();
const createItemSchema = z.object({
  categoryId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  priceOverride: z.number().nullable().optional(),
  quantityEnabled: z.boolean().optional(),
  minQuantity: z.number().int().min(1).optional(),
  maxQuantity: z.number().int().min(1).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  sortOrder: z.number().optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  translations: translationsSchema,
}).strict();

export async function GET(_request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");

  try {
    const data = await executeHotelOpsBackendRequest("list hotel service items", (accessToken) =>
      hotelOpsService.listServiceItems(hotelId, { query: { page: 1, limit: 100 }, accessToken }),
    );
    return data instanceof Response ? data : successResponse(data);
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}

export async function POST(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");
  const parsed = createItemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse("Service item payload is invalid");

  try {
    const data = await executeHotelOpsBackendRequest("create hotel service item", (accessToken) =>
      hotelOpsService.createServiceItem(hotelId, parsed.data satisfies CreateServiceItemInput, accessToken),
    );
    return data instanceof Response ? data : successResponse(data, 201);
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
