import { HttpError } from "@/core/http/http-error";
import { guestOsService } from "@/features/guest-os/service/guest-os-service-instance";
import { normalizeGuestLocale } from "@/features/guest-os/i18n/config";
import type { LocalPartnerCategory } from "@/features/local-partners/types/local-partners-contract";
import { getBearerToken, guestHttpErrorResponse, guestSuccessResponse, guestUnknownErrorResponse, guestValidationErrorResponse } from "../../_utils";

export async function GET(request: Request) {
  const token = getBearerToken(request);
  if (!token) return guestValidationErrorResponse("sessionToken is required");
  try {
    const locale = normalizeGuestLocale(request.headers.get("x-lang") ?? request.headers.get("accept-language"));
    const data = await guestOsService.listNearbyCategories<LocalPartnerCategory[]>(token, locale);
    return guestSuccessResponse({ status: 200, error: null, message: "OK", data });
  } catch (error) {
    return error instanceof HttpError ? guestHttpErrorResponse(error) : guestUnknownErrorResponse();
  }
}
