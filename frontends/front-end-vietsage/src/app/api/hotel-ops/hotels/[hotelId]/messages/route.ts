import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { executeHotelOpsBackendRequest, hotelOpsHttpErrorResponse, successResponse, unknownServerErrorResponse } from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";

type Params = { params: Promise<{ hotelId: string }> };

export async function GET(request: Request, context: Params) {
  const { hotelId } = await context.params;
  const params = new URL(request.url).searchParams;
  try {
    const data = await executeHotelOpsBackendRequest("list hotel message threads", (accessToken) => hotelOpsService.listMessageThreads(hotelId, { accessToken, query: { page: Number(params.get("page")) || 1, limit: Number(params.get("limit")) || 30, q: params.get("q") || undefined } }));
    return data instanceof Response ? data : successResponse(data);
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
