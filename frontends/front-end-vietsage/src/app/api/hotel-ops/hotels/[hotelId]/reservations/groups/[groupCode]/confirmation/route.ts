import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import {
  executeHotelOpsBackendRequest,
  hotelOpsHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "@/app/api/hotel-ops/_utils";

type Params = { params: Promise<{ hotelId: string; groupCode: string }> };

export async function GET(request: Request, context: Params) {
  const { hotelId, groupCode } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");
  if (!groupCode) return validationErrorResponse("groupCode is required");

  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") || undefined;
  const decodedGroupCode = decodeURIComponent(groupCode);

  try {
    const data = await executeHotelOpsBackendRequest(
      "get group confirmation",
      async (accessToken) => {
        return await hotelOpsService.getGroupConfirmation(hotelId, decodedGroupCode, {
          accessToken,
          lang,
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
