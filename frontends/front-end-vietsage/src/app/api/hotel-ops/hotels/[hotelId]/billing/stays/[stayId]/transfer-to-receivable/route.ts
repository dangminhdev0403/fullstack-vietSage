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

export async function POST(request: Request, context: Params) {
  const { hotelId, stayId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");
  if (!stayId) return validationErrorResponse("stayId is required");

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return validationErrorResponse("Invalid JSON body");
  }

  try {
    const data = await executeHotelOpsBackendRequest(
      "transfer stay to receivable",
      async (accessToken) => {
        return await hotelOpsService.transferStayToReceivable(hotelId, stayId, body, { accessToken });
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
