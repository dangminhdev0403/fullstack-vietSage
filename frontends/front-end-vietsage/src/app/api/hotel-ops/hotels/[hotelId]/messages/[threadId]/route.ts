import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { executeHotelOpsBackendRequest, hotelOpsHttpErrorResponse, successResponse, unknownServerErrorResponse } from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";

type Params = { params: Promise<{ hotelId: string; threadId: string }> };

export async function GET(request: Request, context: Params) {
  const { hotelId, threadId } = await context.params;
  const { searchParams } = new URL(request.url);
  const before = searchParams.get("before") ?? undefined;
  const limitStr = searchParams.get("limit");
  const limit = limitStr ? Number(limitStr) : undefined;
  try { const data = await executeHotelOpsBackendRequest("get hotel message thread", (accessToken) => hotelOpsService.getMessageThread(hotelId, threadId, { query: { before, limit }, accessToken })); return data instanceof Response ? data : successResponse(data); } catch (error) { return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse(); }
}
