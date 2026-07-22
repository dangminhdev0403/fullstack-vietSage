import { executeHotelOpsBackendRequest, hotelOpsHttpErrorResponse, successResponse, unknownServerErrorResponse } from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";

type Params = { params: Promise<{ hotelId: string; threadId: string }> };

export async function POST(_: Request, context: Params) {
  const { hotelId, threadId } = await context.params;
  try {
    const data = await executeHotelOpsBackendRequest("mark hotel message thread read", (accessToken) =>
      hotelOpsService.markMessageThreadRead(hotelId, threadId, accessToken),
    );
    return data instanceof Response ? data : successResponse(data);
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
