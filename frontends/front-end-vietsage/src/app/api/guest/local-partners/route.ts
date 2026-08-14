import { HttpError } from "@/core/http/http-error";
import { guestOsService } from "@/features/guest-os/service/guest-os-service-instance";
import { normalizeGuestLocale } from "@/features/guest-os/i18n/config";
import type { LocalPartner } from "@/features/local-partners/types/local-partners-contract";
import { getBearerToken, guestHttpErrorResponse, guestSuccessResponse, guestUnknownErrorResponse, guestValidationErrorResponse } from "../_utils";

export async function GET(request: Request) {
  const token = getBearerToken(request);
  if (!token) return guestValidationErrorResponse("sessionToken is required");
  const categoryId = new URL(request.url).searchParams.get("categoryId") || undefined;
  try {
    const locale = normalizeGuestLocale(request.headers.get("x-lang") ?? request.headers.get("accept-language"));
    const data = await guestOsService.listNearbyPartners<LocalPartner[]>(token, categoryId, locale);
    return guestSuccessResponse({ status: 200, error: null, message: "OK", data });
  } catch (error) {
    return error instanceof HttpError ? guestHttpErrorResponse(error) : guestUnknownErrorResponse();
  }
}
