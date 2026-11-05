import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { executeHotelOpsBackendRequest, hotelOpsHttpErrorResponse, successResponse, unknownServerErrorResponse } from "@/app/api/hotel-ops/_utils";

export async function GET(_request: Request, context: { params: Promise<{ hotelId: string }> }) {
  const { hotelId } = await context.params;
  try {
    const data = await executeHotelOpsBackendRequest("get housekeeping scope", (accessToken) =>
      hotelOpsService.getHousekeepingScope(hotelId, { accessToken }),
    );
    if (data instanceof Response) return data;
    return successResponse(data);
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
