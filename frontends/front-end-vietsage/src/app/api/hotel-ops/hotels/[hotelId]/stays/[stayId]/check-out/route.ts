import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import {
  executeHotelOpsBackendRequest,
  hotelOpsHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "@/app/api/hotel-ops/_utils";

type Params = { params: Promise<{ hotelId: string; stayId: string }> };

export async function POST(_request: Request, context: Params) {
  const { hotelId, stayId } = await context.params;
  if (!hotelId || !stayId) return validationErrorResponse("hotelId and stayId are required");

  try {
    const data = await executeHotelOpsBackendRequest("check out stay", (accessToken) =>
      hotelOpsService.checkOutStay(hotelId, stayId, accessToken),
    );
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Đã check-out lượt lưu trú thành công");
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
