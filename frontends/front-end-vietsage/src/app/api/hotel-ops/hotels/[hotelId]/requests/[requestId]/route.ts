import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import {
  executeHotelOpsBackendRequest,
  hotelOpsHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "@/app/api/hotel-ops/_utils";

type Params = { params: Promise<{ hotelId: string; requestId: string }> };

export async function GET(_request: Request, context: Params) {
  const { hotelId, requestId } = await context.params;
  if (!hotelId || !requestId) return validationErrorResponse("hotelId and requestId are required");
  try {
    const data = await executeHotelOpsBackendRequest("get hotel request", (accessToken) =>
      hotelOpsService.getRequest(hotelId, requestId, accessToken),
    );
    if (data instanceof Response) return data;
    return successResponse(data);
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
