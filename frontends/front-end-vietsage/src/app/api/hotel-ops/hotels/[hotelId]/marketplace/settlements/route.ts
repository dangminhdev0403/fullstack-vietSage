import { executeHotelOpsBackendRequest, hotelOpsHttpErrorResponse, successResponse, unknownServerErrorResponse } from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";
import { servicePortalClient } from "@/features/service-portal/service-client";

type Params = { params: Promise<{ hotelId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { hotelId } = await params;
  const status = new URL(request.url).searchParams.get("status") ?? undefined;
  try {
    const data = await executeHotelOpsBackendRequest("hotel partner settlements", (token) =>
      servicePortalClient.hotelPartnerSettlements(token, hotelId, status),
    );
    return data instanceof Response ? data : successResponse(data);
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
