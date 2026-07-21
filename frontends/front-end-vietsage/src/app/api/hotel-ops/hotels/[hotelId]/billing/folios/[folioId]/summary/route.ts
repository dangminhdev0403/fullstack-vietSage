import { HttpError } from "@/core/http/http-error";
import { billingService } from "@/features/billing/service/billing-service-instance";
import {
  executeHotelOpsBackendRequest,
  hotelOpsHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "@/app/api/hotel-ops/_utils";

type Params = { params: Promise<{ hotelId: string; folioId: string }> };

export async function GET(_request: Request, context: Params) {
  const { hotelId, folioId } = await context.params;
  if (!hotelId || !folioId) return validationErrorResponse("hotelId and folioId are required");
  try {
    const data = await executeHotelOpsBackendRequest("get billing folio summary", (accessToken) =>
      billingService.getFolioSummary(hotelId, folioId, { accessToken }),
    );
    if (data instanceof Response) return data;
    return successResponse(data);
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
