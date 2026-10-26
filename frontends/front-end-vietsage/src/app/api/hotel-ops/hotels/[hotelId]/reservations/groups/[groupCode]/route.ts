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

export async function GET(_request: Request, context: Params) {
  const { hotelId, groupCode } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");
  if (!groupCode) return validationErrorResponse("groupCode is required");

  const decodedGroupCode = decodeURIComponent(groupCode);

  try {
    const data = await executeHotelOpsBackendRequest(
      "get group reservation details",
      async (accessToken) => {
        return await hotelOpsService.getGroupDetails(hotelId, decodedGroupCode, {
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

export async function PATCH(request: Request, context: Params) {
  const { hotelId, groupCode } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");
  if (!groupCode) return validationErrorResponse("groupCode is required");

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return validationErrorResponse("Invalid JSON body");
  }

  const decodedGroupCode = decodeURIComponent(groupCode);

  try {
    const data = await executeHotelOpsBackendRequest(
      "update group shared fields",
      async (accessToken) => {
        return await hotelOpsService.updateGroupSharedFields(
          hotelId,
          decodedGroupCode,
          body,
          { accessToken },
        );
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
