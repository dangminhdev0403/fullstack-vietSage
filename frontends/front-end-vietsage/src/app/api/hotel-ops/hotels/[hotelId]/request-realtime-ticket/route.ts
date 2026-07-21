import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import {
  executeHotelOpsBackendRequest,
  hotelOpsHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "@/app/api/hotel-ops/_utils";

type Params = { params: Promise<{ hotelId: string }> };

export async function POST(_request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");
  try {
    const data = await executeHotelOpsBackendRequest("issue request realtime ticket", (accessToken) =>
      hotelOpsService.issueRequestRealtimeTicket(hotelId, accessToken),
    );
    if (data instanceof Response) return data;
    const response = successResponse(data);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
