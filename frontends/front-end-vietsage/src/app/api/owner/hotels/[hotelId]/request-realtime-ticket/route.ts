import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { executeOwnerBackendRequest, ownerHttpErrorResponse, successResponse, unknownServerErrorResponse, validationErrorResponse } from "../../../_utils";

type Params = { params: Promise<{ hotelId: string }> };

export async function POST(_request: Request, context: Params) {
  const hotelId = (await context.params).hotelId?.trim();
  if (!hotelId) return validationErrorResponse("hotelId is required");
  try {
    const data = await executeOwnerBackendRequest("issue owner request realtime ticket", (accessToken) => hotelOpsService.issueRequestRealtimeTicket(hotelId, accessToken));
    if (data instanceof Response) return data;
    const response = successResponse(data, 200, "Request realtime ticket issued");
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof HttpError) return ownerHttpErrorResponse(error);
    return unknownServerErrorResponse();
  }
}
