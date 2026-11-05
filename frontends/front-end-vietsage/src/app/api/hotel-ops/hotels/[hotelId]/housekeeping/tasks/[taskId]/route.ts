import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import {
  executeHotelOpsBackendRequest,
  hotelOpsHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "@/app/api/hotel-ops/_utils";

type Params = { params: Promise<{ hotelId: string; taskId: string }> };

export async function GET(_request: Request, context: Params) {
  const { hotelId, taskId } = await context.params;
  if (!hotelId || !taskId) return validationErrorResponse("Thiếu mã khách sạn hoặc mã công việc");
  try {
    const data = await executeHotelOpsBackendRequest("get housekeeping task", (accessToken) =>
      hotelOpsService.getHousekeepingTask(hotelId, taskId, accessToken),
    );
    if (data instanceof Response) return data;
    return successResponse(data);
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
