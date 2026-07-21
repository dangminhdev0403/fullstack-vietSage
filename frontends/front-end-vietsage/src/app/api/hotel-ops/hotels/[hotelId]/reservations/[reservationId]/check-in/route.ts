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

export async function POST(_request: Request, context: Params) {
  const { hotelId, reservationId } = await context.params;
  if (!hotelId || !reservationId) return validationErrorResponse("hotelId and reservationId are required");
  try {
    const data = await executeHotelOpsBackendRequest("check in reservation", (accessToken) =>
      hotelOpsService.checkInReservation(hotelId, reservationId, accessToken),
    );
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Đã check-in và kích hoạt QR phòng");
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
