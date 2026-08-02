import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import {
  executeHotelOpsBackendRequest,
  hotelOpsHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
} from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";

type Params = { params: Promise<{ hotelId: string }> };

export async function GET(_request: Request, context: Params) {
  const { hotelId } = await context.params;
  try {
    const data = await executeHotelOpsBackendRequest(
      "get hotel message unread summary",
      (accessToken) =>
        hotelOpsService.getMessageUnreadSummary(hotelId, { accessToken }),
    );
    return data instanceof Response ? data : successResponse(data);
  } catch (error) {
    return error instanceof HttpError
      ? hotelOpsHttpErrorResponse(error)
      : unknownServerErrorResponse();
  }
}
