import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";

import {
  executeOwnerBackendRequest,
  ownerHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../../../../_utils";

type Params = {
  params: Promise<{ hotelId: string; requestId: string }>;
};

export async function GET(_request: Request, context: Params) {
  const { hotelId, requestId } = await context.params;
  if (!hotelId || !requestId) {
    return validationErrorResponse("hotelId and requestId are required");
  }

  try {
    const data = await executeOwnerBackendRequest("get owner hotel request", (accessToken) => hotelOpsService.getRequest(hotelId, requestId, accessToken));
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Owner hotel request fetched successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return ownerHttpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}
