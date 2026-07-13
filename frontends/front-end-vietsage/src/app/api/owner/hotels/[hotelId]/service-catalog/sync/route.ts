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
  params: Promise<{ hotelId: string }>;
};

export async function POST(_request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");

  try {
    const result = await executeOwnerBackendRequest("sync owner service catalog from Google Sheets", (accessToken) =>
      hotelOpsService.syncServiceCatalogFromGoogleSheets(hotelId, { accessToken }),
    );

    if (result instanceof Response) return result;
    return successResponse(result, 200, "Owner service catalog synchronized successfully");
  } catch (error) {
    if (error instanceof HttpError) return ownerHttpErrorResponse(error);
    return unknownServerErrorResponse();
  }
}
