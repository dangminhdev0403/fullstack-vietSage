import { z } from "zod";

import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";

import {
  executeOwnerBackendRequest,
  ownerHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../../../_utils";

type Params = {
  params: Promise<{ hotelId: string }>;
};


const translationSchema = z.object({ name: z.string().trim().min(1), description: z.string().trim().nullable().optional() }).strict();
const translationsSchema = z.object({ en: translationSchema.optional(), zh: translationSchema.optional(), ko: translationSchema.optional(), ru: translationSchema.optional(), hi: translationSchema.optional() }).strict().optional();

const createCategorySchema = z
  .object({
    name: z.string().trim().min(1),
    description: z.string().trim().optional(),
    defaultPrice: z.number().min(0),
    currency: z.string().trim().min(1).optional(),
    sortOrder: z.number().optional(),
    status: z.enum(["ACTIVE", "DISABLED"]).optional(),
    translations: translationsSchema,
  })
  .strict();

export async function GET(_request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) {
    return validationErrorResponse("hotelId is required");
  }

  try {
    const data = await executeOwnerBackendRequest("list owner service categories", (accessToken) => hotelOpsService.listServiceCategories(hotelId, {
      query: { page: 1, limit: 100 },
      accessToken,
    }));
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Owner service categories fetched successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return ownerHttpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}

export async function POST(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) {
    return validationErrorResponse("hotelId is required");
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

  const parsed = createCategorySchema.safeParse(payload);
  if (!parsed.success) {
    return validationErrorResponse("Service category payload is invalid");
  }

  try {
    const data = await executeOwnerBackendRequest("create owner service category", (accessToken) => hotelOpsService.createServiceCategory(hotelId, parsed.data, accessToken));
    if (data instanceof Response) return data;
    return successResponse(data, 201, "Owner service category created successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return ownerHttpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}
