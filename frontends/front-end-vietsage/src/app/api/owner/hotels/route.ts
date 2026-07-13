import { BACKEND_API_MAX_LIMIT } from "@/core/http/backend-api-config";
import { HttpError } from "@/core/http/http-error";
import { adminService } from "@/features/admin/service/admin-service-instance";

import { executeOwnerBackendRequest, ownerHttpErrorResponse, successResponse, unknownServerErrorResponse } from "../_utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const requestedLimit = Number(url.searchParams.get("limit") ?? String(BACKEND_API_MAX_LIMIT));
  const limit = Number.isFinite(requestedLimit) ? Math.min(requestedLimit, BACKEND_API_MAX_LIMIT) : BACKEND_API_MAX_LIMIT;
  const q = url.searchParams.get("q")?.trim() || undefined;

  try {
    const data = await executeOwnerBackendRequest("list owner hotels", (accessToken) => adminService.listHotels({
      query: {
        page: Number.isFinite(page) ? page : 1,
        limit,
        ...(q ? { q } : {}),
      },
      accessToken,
    }));
    if (data instanceof Response) return data;

    return successResponse(data, 200, "Owner hotels fetched successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return ownerHttpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}
