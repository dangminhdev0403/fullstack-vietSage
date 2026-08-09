import { executeHotelOpsBackendRequest, hotelOpsHttpErrorResponse, successResponse, unknownServerErrorResponse } from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";
import { localPartnersServerClient } from "@/features/local-partners/service/local-partners.client-instance";

type Params = { params: Promise<{ hotelId: string }> };
export async function GET(_request: Request, { params }: Params) {
  const { hotelId } = await params;
  try {
    const data = await executeHotelOpsBackendRequest("list local partner categories", (token) => localPartnersServerClient.categories(hotelId, token));
    return data instanceof Response ? data : successResponse(data);
  } catch (error) { return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse(); }
}
