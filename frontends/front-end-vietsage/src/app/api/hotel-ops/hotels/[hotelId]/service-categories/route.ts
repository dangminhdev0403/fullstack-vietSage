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

type Params = { params: Promise<{ hotelId: string }> };

const translationSchema = z.object({ name: z.string().trim().min(1), description: z.string().trim().nullable().optional() }).strict();
const translationsSchema = z.object({ en: translationSchema.optional(), zh: translationSchema.optional(), ko: translationSchema.optional(), ru: translationSchema.optional(), hi: translationSchema.optional() }).strict().optional();
const createCategorySchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  id_group: z.string().trim().min(1).nullable().optional(),
  defaultPrice: z.number().min(0),
  currency: z.string().trim().min(1).optional(),
  sortOrder: z.number().optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  translations: translationsSchema,
}).strict();

export async function GET(_request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");

  try {
    const data = await executeHotelOpsBackendRequest("list hotel service categories", (accessToken) =>
      hotelOpsService.listServiceCategories(hotelId, { query: { page: 1, limit: 100 }, accessToken }),
    );
    return data instanceof Response ? data : successResponse(data);
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}

export async function POST(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");
  const parsed = createCategorySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse("Service category payload is invalid");

  try {
    const data = await executeHotelOpsBackendRequest("create hotel service category", (accessToken) =>
      hotelOpsService.createServiceCategory(hotelId, parsed.data, accessToken),
    );
    return data instanceof Response ? data : successResponse(data, 201);
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
