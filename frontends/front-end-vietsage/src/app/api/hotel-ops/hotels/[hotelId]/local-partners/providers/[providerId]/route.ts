import { executeHotelOpsBackendRequest, hotelOpsHttpErrorResponse, successResponse, unknownServerErrorResponse } from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";
import { localPartnersServerClient } from "@/features/local-partners/service/local-partners.client-instance";

type Params = { params: Promise<{ hotelId: string; providerId: string }> };
async function mutate(linked: boolean, { params }: Params) {
  const { hotelId, providerId } = await params;
  try {
    const data = await executeHotelOpsBackendRequest("set provider link", (token) => localPartnersServerClient.setProviderLink(hotelId, providerId, linked, token));
    return data instanceof Response ? data : successResponse(data);
  } catch (error) { return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse(); }
}
export async function PUT(_request: Request, context: Params) { return mutate(true, context); }
export async function DELETE(_request: Request, context: Params) { return mutate(false, context); }