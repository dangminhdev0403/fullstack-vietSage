import { HttpError } from "@/core/http/http-error";
import { guestOsService } from "@/features/guest-os/service/guest-os-service-instance";

import {
  getBearerToken,
  getGuestLocaleCode,
  guestHttpErrorResponse,
  guestSuccessResponse,
  guestUnknownErrorResponse,
  guestValidationErrorResponse,
} from "../_utils";

export async function GET(request: Request) {
  const sessionToken = getBearerToken(request);
  if (!sessionToken) {
    return guestValidationErrorResponse("sessionToken is required");
  }

  try {
    const data = await guestOsService.listServices(sessionToken, getGuestLocaleCode(request));
    return guestSuccessResponse({ status: 200, error: null, message: "OK", data });
  } catch (error) {
    if (error instanceof HttpError) {
      return guestHttpErrorResponse(error);
    }

    return guestUnknownErrorResponse();
  }
}
