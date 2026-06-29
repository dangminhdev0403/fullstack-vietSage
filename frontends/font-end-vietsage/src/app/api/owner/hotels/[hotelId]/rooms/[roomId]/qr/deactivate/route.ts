import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";

import { executeOwnerBackendRequest, ownerHttpErrorResponse, successResponse, unknownServerErrorResponse, validationErrorResponse } from "../../../../../../_utils";

type Params = { params: Promise<{ hotelId: string; roomId: string }> };

export async function POST(_request: Request, context: Params) {
  const { hotelId, roomId } = await context.params;
  if (!hotelId || !roomId) return validationErrorResponse("hotelId and roomId are required");

  try {
    const data = await executeOwnerBackendRequest("deactivate owner room qr", (accessToken) => hotelOpsService.setRoomQrActive(hotelId, roomId, false, accessToken));
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Owner room QR deactivated successfully");
  } catch (error) {
    if (error instanceof HttpError) return ownerHttpErrorResponse(error);
    return unknownServerErrorResponse();
  }
}
