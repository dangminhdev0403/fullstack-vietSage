import { executeHotelOpsBackendRequest, hotelOpsHttpErrorResponse, successResponse, unknownServerErrorResponse } from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";
import { servicePortalClient } from "@/features/service-portal/service-client";

type Params = { params: Promise<{ hotelId: string; settlementId: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { hotelId, settlementId } = await params;
  try {
    const data = await executeHotelOpsBackendRequest("settle partner order", (token) =>
      servicePortalClient.settlePartnerOrder(token, hotelId, settlementId),
    );
    return data instanceof Response ? data : successResponse(data);
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
