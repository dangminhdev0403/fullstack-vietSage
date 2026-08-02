import { executeHotelOpsBackendRequest, hotelOpsHttpErrorResponse, successResponse, unknownServerErrorResponse } from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";

type Params = { params: Promise<{ hotelId: string; threadId: string }> };

export async function POST(request: Request, context: Params) {
  const { hotelId, threadId } = await context.params;
  const payload = await request.json().catch(() => null);
  const readThroughMessageId = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as { readThroughMessageId?: unknown }).readThroughMessageId
    : null;
  if (typeof readThroughMessageId !== "string" || !readThroughMessageId.trim()) {
    return new Response(JSON.stringify({ message: "readThroughMessageId là bắt buộc" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  try {
    const data = await executeHotelOpsBackendRequest("mark hotel message thread read", (accessToken) =>
      hotelOpsService.markMessageThreadRead(hotelId, threadId, readThroughMessageId, accessToken),
    );
    return data instanceof Response ? data : successResponse(data);
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
