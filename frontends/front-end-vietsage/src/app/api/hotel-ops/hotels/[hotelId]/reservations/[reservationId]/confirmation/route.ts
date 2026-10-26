import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import {
  executeHotelOpsBackendRequest,
  hotelOpsHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "@/app/api/hotel-ops/_utils";

type Params = { params: Promise<{ hotelId: string; reservationId: string }> };

export async function GET(_request: Request, context: Params) {
  const { hotelId, reservationId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");
  if (!reservationId) return validationErrorResponse("reservationId is required");

  try {
    const data = await executeHotelOpsBackendRequest(
      "get reservation confirmation",
      async (accessToken) => {
        return await hotelOpsService.getReservationConfirmation(hotelId, reservationId, {
          accessToken,
        });
      },
    );
    return successResponse(data);
  } catch (error) {
    if (error instanceof HttpError) {
      return hotelOpsHttpErrorResponse(error);
    }
    return unknownServerErrorResponse(error);
  }
}
