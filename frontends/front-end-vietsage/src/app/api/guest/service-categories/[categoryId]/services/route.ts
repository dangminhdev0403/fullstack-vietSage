import { HttpError } from "@/core/http/http-error";
import { guestOsService } from "@/features/guest-os/service/guest-os-service-instance";

import {
  getBearerToken,
  getGuestLocaleCode,
  guestHttpErrorResponse,
  guestSuccessResponse,
  guestUnknownErrorResponse,
  guestValidationErrorResponse,
} from "../../../_utils";

function toPositiveInteger(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export async function GET(request: Request, { params }: { params: Promise<{ categoryId: string }> }) {
  const sessionToken = getBearerToken(request);
  if (!sessionToken) {
    return guestValidationErrorResponse("sessionToken is required");
  }

  const { categoryId } = await params;
  const sanitizedCategoryId = categoryId.trim();
  if (!sanitizedCategoryId) {
    return guestValidationErrorResponse("categoryId is required");
  }

  const url = new URL(request.url);

  try {
    const data = await guestOsService.listServicesByCategory(sessionToken, sanitizedCategoryId, {
      page: toPositiveInteger(url.searchParams.get("page")),
      limit: toPositiveInteger(url.searchParams.get("limit")),
    }, getGuestLocaleCode(request));

    return guestSuccessResponse({ status: 200, error: null, message: "OK", data });
  } catch (error) {
    if (error instanceof HttpError) {
      return guestHttpErrorResponse(error);
    }

    return guestUnknownErrorResponse();
  }
}
