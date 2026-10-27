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

export async function GET(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");

  const url = new URL(request.url);
  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (value) query[key] = value;
  }

  try {
    const data = await executeHotelOpsBackendRequest(
      "list booking payments",
      async (accessToken) => {
        return await hotelOpsService.listBookingPayments(hotelId, query, { accessToken });
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

export async function POST(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return validationErrorResponse("Invalid JSON body");
  }

  try {
    const data = await executeHotelOpsBackendRequest(
      "record booking payment",
      async (accessToken) => {
        return await hotelOpsService.recordBookingPayment(hotelId, body, { accessToken });
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
