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

export async function GET(_request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("Thiếu mã khách sạn");
  try {
    const data = await executeHotelOpsBackendRequest("summarize housekeeping tasks", (accessToken) =>
      hotelOpsService.getHousekeepingTasksSummary(hotelId, { accessToken }),
    );
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Lấy tổng quan công việc buồng phòng thành công");
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
