import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { executeHotelOpsBackendRequest, hotelOpsHttpErrorResponse, successResponse, unknownServerErrorResponse, validationErrorResponse } from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";

type Params = { params: Promise<{ hotelId: string; threadId: string }> };
export async function POST(request: Request, context: Params) {
  const { hotelId, threadId } = await context.params;
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload.body !== "string") return validationErrorResponse("body is required");
  try { const data = await executeHotelOpsBackendRequest("reply hotel message thread", (accessToken) => hotelOpsService.replyMessageThread(hotelId, threadId, payload.body, accessToken)); return data instanceof Response ? data : successResponse(data); } catch (error) { return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse(); }
}
