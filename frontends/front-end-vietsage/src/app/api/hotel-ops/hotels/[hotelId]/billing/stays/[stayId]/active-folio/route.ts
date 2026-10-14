import { HttpError } from "@/core/http/http-error";
import { billingService } from "@/features/billing/service/billing-service-instance";
import {
  executeHotelOpsBackendRequest,
  hotelOpsHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "@/app/api/hotel-ops/_utils";

type Params = { params: Promise<{ hotelId: string; stayId: string }> };

export async function GET(_request: Request, context: Params) {
  const { hotelId, stayId } = await context.params;
  if (!hotelId || !stayId) return validationErrorResponse("hotelId and stayId are required");
  try {
    const data = await executeHotelOpsBackendRequest("get active folio by stay", (accessToken) =>
      billingService.getActiveFolioByStay(hotelId, stayId, { accessToken }),
    );
    if (data instanceof Response) return data;
    return successResponse(data);
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
