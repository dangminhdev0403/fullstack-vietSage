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

type Params = {
  params: Promise<{ requestId: string }>;
};

async function cancelGuestRequest(request: Request, context: Params) {
  const sessionToken = getBearerToken(request);
  if (!sessionToken) {
    return guestValidationErrorResponse("sessionToken is required");
  }

  const { requestId } = await context.params;
  const trimmedRequestId = requestId?.trim();
  if (!trimmedRequestId) {
    return guestValidationErrorResponse("requestId is required");
  }

  try {
    const data = await guestOsService.cancelRequest(sessionToken, trimmedRequestId, getGuestLocaleCode(request));
    return guestSuccessResponse({ status: 200, error: null, message: "OK", data });
  } catch (error) {
    if (error instanceof HttpError) {
      return guestHttpErrorResponse(error);
    }

    return guestUnknownErrorResponse();
  }
}

export async function PATCH(request: Request, context: Params) {
  return cancelGuestRequest(request, context);
}

export async function POST(request: Request, context: Params) {
  return cancelGuestRequest(request, context);
}
