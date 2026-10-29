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
  if (!hotelId) return validationErrorResponse("hotelId is required");

  try {
    const data = await executeHotelOpsBackendRequest(
      "get hotel confirmation template",
      async (accessToken) => {
        return await hotelOpsService.getConfirmationTemplate(hotelId, {
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

export async function PUT(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");

  try {
    const body = await request.json();
    const data = await executeHotelOpsBackendRequest(
      "upsert hotel confirmation template",
      async (accessToken) => {
        return await hotelOpsService.upsertConfirmationTemplate(hotelId, body, {
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
