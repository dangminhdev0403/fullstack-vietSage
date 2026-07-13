import { z } from "zod";

import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";

import {
  executeOwnerBackendRequest,
  ownerHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../../../../_utils";

type Params = {
  params: Promise<{ hotelId: string; categoryId: string }>;
};


const translationSchema = z.object({ name: z.string().trim().min(1), description: z.string().trim().nullable().optional() }).strict();
const translationsSchema = z.object({ en: translationSchema.optional(), zh: translationSchema.optional(), ko: translationSchema.optional(), ru: translationSchema.optional(), hi: translationSchema.optional() }).strict().optional();

const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().nullable().optional(),
    id_group: z.string().trim().min(1).nullable().optional(),
    defaultPrice: z.number().min(0).nullable().optional(),
    currency: z.string().trim().min(1).optional(),
    priceUpdateMode: z.enum(["CATEGORY_ONLY", "OVERRIDE_ALL_ITEMS"]).optional(),
    sortOrder: z.number().optional(),
    status: z.enum(["ACTIVE", "DISABLED"]).optional(),
    translations: translationsSchema,
  })
  .strict();

export async function PATCH(request: Request, context: Params) {
  const { hotelId, categoryId } = await context.params;
  if (!hotelId || !categoryId) {
    return validationErrorResponse("hotelId and categoryId are required");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return validationErrorResponse("Request body must be valid JSON");
  }

  if (payload && typeof payload === "object" && !Array.isArray(payload) && "tenantId" in payload) {
    return validationErrorResponse("Không được gửi tenantId từ giao diện chủ khách sạn.");
  }

  const parsed = updateCategorySchema.safeParse(payload);
  if (!parsed.success) {
    return validationErrorResponse("Service category payload is invalid");
  }

  try {
    const data = await executeOwnerBackendRequest("update owner service category", (accessToken) => hotelOpsService.updateServiceCategory(hotelId, categoryId, parsed.data, accessToken));
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Owner service category updated successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return ownerHttpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}
