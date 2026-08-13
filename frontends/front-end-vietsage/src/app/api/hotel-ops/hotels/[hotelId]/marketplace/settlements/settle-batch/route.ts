import { executeHotelOpsBackendRequest, hotelOpsHttpErrorResponse, successResponse, unknownServerErrorResponse, validationErrorResponse } from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";
import { servicePortalClient } from "@/features/service-portal/service-client";

type Params = { params: Promise<{ hotelId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { hotelId } = await params;
  const body = (await request.json().catch(() => null)) as { settlementIds?: string[] } | null;
  if (!body?.settlementIds || !Array.isArray(body.settlementIds)) {
    return validationErrorResponse("Danh sách ID quyết toán không hợp lệ");
  }
  try {
    const data = await executeHotelOpsBackendRequest("settle partner orders batch", (token) =>
      servicePortalClient.settlePartnerOrdersBatch(token, hotelId, body.settlementIds ?? []),
    );
    return data instanceof Response ? data : successResponse(data);
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
