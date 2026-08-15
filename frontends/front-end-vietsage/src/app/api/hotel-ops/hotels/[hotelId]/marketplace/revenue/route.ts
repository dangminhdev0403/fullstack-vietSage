import { executeHotelOpsBackendRequest, hotelOpsHttpErrorResponse, successResponse, unknownServerErrorResponse } from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";
import { servicePortalClient } from "@/features/service-portal/service-client";

type Params = { params: Promise<{ hotelId: string }> };

export async function GET(_: Request, { params }: Params) {
  const { hotelId } = await params;
  try {
    const data = await executeHotelOpsBackendRequest("hotel marketplace revenue", (token) =>
      servicePortalClient.hotelMarketplaceRevenue(token, hotelId),
    );
    return data instanceof Response ? data : successResponse(data);
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
