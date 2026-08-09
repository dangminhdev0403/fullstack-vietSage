import { HttpError } from "@/core/http/http-error";
import { guestOsService } from "@/features/guest-os/service/guest-os-service-instance";
import type { LocalPartnerCategory } from "@/features/local-partners/types/local-partners-contract";
import { getBearerToken, guestHttpErrorResponse, guestSuccessResponse, guestUnknownErrorResponse, guestValidationErrorResponse } from "../../_utils";

export async function GET(request: Request) {
  const token = getBearerToken(request);
  if (!token) return guestValidationErrorResponse("sessionToken is required");
  try {
    const data = await guestOsService.listNearbyCategories<LocalPartnerCategory[]>(token);
    return guestSuccessResponse({ status: 200, error: null, message: "OK", data });
  } catch (error) {
    return error instanceof HttpError ? guestHttpErrorResponse(error) : guestUnknownErrorResponse();
  }
}
