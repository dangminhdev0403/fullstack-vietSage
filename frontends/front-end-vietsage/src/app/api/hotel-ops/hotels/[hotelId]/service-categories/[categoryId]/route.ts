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

type Params = { params: Promise<{ hotelId: string; categoryId: string }> };

const translationSchema = z.object({ name: z.string().trim().min(1), description: z.string().trim().nullable().optional() }).strict();
const translationsSchema = z.object({ en: translationSchema.optional(), zh: translationSchema.optional(), ko: translationSchema.optional(), ru: translationSchema.optional(), hi: translationSchema.optional() }).strict().optional();
const updateCategorySchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().nullable().optional(),
  id_group: z.string().trim().min(1).nullable().optional(),
  defaultPrice: z.number().min(0).nullable().optional(),
  currency: z.string().trim().min(1).optional(),
  priceUpdateMode: z.enum(["CATEGORY_ONLY", "OVERRIDE_ALL_ITEMS"]).optional(),
  sortOrder: z.number().optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  translations: translationsSchema,
}).strict();

export async function PATCH(request: Request, context: Params) {
  const { hotelId, categoryId } = await context.params;
  if (!hotelId || !categoryId) return validationErrorResponse("hotelId and categoryId are required");
  const parsed = updateCategorySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse("Service category payload is invalid");

  try {
    const data = await executeHotelOpsBackendRequest("update hotel service category", (accessToken) =>
      hotelOpsService.updateServiceCategory(hotelId, categoryId, parsed.data, accessToken),
    );
    return data instanceof Response ? data : successResponse(data);
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
