import { z } from "zod";
import { executeHotelOpsBackendRequest, hotelOpsHttpErrorResponse, successResponse, unknownServerErrorResponse, validationErrorResponse } from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";
import { localPartnersServerClient } from "@/features/local-partners/service/local-partners.client-instance";

type Params = { params: Promise<{ hotelId: string; partnerId: string }> };
export async function PATCH(request: Request, { params }: Params) {
  const { hotelId, partnerId } = await params;
  const parsed = z.object({ status: z.enum(["ACTIVE", "DISABLED"]) }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse("Trạng thái không hợp lệ.");
  try {
    const data = await executeHotelOpsBackendRequest("update local partner status", (token) => localPartnersServerClient.status(hotelId, partnerId, parsed.data.status, token));
    return data instanceof Response ? data : successResponse(data);
  } catch (error) { return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse(); }
}
