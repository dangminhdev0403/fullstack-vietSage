import { executeHotelOpsBackendRequest, hotelOpsHttpErrorResponse, successResponse, unknownServerErrorResponse, validationErrorResponse } from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";
import { localPartnersServerClient } from "@/features/local-partners/service/local-partners.client-instance";
import type { LocalPartnerInput } from "@/features/local-partners/types/local-partners-contract";

type Params = { params: Promise<{ hotelId: string; partnerId: string }> };
export async function PATCH(request: Request, { params }: Params) {
  const { hotelId, partnerId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return validationErrorResponse("Thông tin đối tác không hợp lệ.");
  try {
    const data = await executeHotelOpsBackendRequest("update local partner", (token) => localPartnersServerClient.update(hotelId, partnerId, body as Partial<LocalPartnerInput>, token));
    return data instanceof Response ? data : successResponse(data);
  } catch (error) { return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse(); }
}
