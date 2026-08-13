import { executeHotelOpsBackendRequest, hotelOpsHttpErrorResponse, successResponse, unknownServerErrorResponse } from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";
import { localPartnersServerClient } from "@/features/local-partners/service/local-partners.client-instance";

type Params = { params: Promise<{ hotelId: string; orderId: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { hotelId, orderId } = await params;
  try {
    const data = await executeHotelOpsBackendRequest("complete hotel marketplace order", (token) =>
      localPartnersServerClient.completeOrder(hotelId, orderId, token),
    );
    return data instanceof Response ? data : successResponse(data);
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
