import { collectCatalogPages } from "@/features/owner/utils/owner-settings";
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
    id_group: z.string().trim().min(1).nullable().optional(),
    defaultPrice: z.number().min(0),
    currency: z.string().trim().min(1).optional(),
    sortOrder: z.number().optional(),
    status: z.enum(["ACTIVE", "DISABLED"]).optional(),
    translations: translationsSchema,
  })
  .strict();

export async function GET(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) {
    return validationErrorResponse("hotelId is required");
  }

  const { searchParams } = new URL(request.url);
  const pageParam = searchParams.get("page");
  const limitParam = searchParams.get("limit");
  const pagination = z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }).safeParse({ page: pageParam ?? undefined, limit: limitParam ?? undefined });
  if (!pagination.success) return validationErrorResponse("Phân trang danh mục không hợp lệ.");

  try {
    const data = await executeOwnerBackendRequest(
      "list owner service categories",
      async (accessToken) => {
        if (pageParam || limitParam) {
          const page = pagination.data.page ?? 1;
          const limit = pagination.data.limit ?? 100;
          return hotelOpsService.listServiceCategories(hotelId, {
            query: { page, limit },
            accessToken,
          });
        }
        const items = await collectCatalogPages((page) => hotelOpsService.listServiceCategories(hotelId, { query: { page, limit: 100 }, accessToken }));
        return {
          items,
          total: items.length,
          page: 1,
          limit: Math.max(1, items.length),
        };
      },
    );
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
