import { HttpError } from "@/core/http/http-error";
import { guestOsService } from "@/features/guest-os/service/guest-os-service-instance";
import type { CreateGuestEmergencyCallInput } from "@/features/guest-os/types/guest-os-contract";

import {
  getBearerToken,
  getGuestLocaleCode,
  guestHttpErrorResponse,
  guestSuccessResponse,
  guestUnknownErrorResponse,
  guestValidationErrorResponse,
  readJsonBody,
} from "../../_utils";

export async function POST(request: Request) {
  const sessionToken = getBearerToken(request);
  if (!sessionToken) {
    return guestValidationErrorResponse("sessionToken is required");
  }

  const payload = await readJsonBody(request);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return guestValidationErrorResponse("Request body must be valid JSON");
  }

  const emergencyPayload = payload as Partial<CreateGuestEmergencyCallInput>;
  if (typeof emergencyPayload.dialedNumber !== "string" || emergencyPayload.dialedNumber.trim().length === 0) {
    return guestValidationErrorResponse("dialedNumber is required");
  }

  try {
    const data = await guestOsService.createEmergencyCall(
      sessionToken,
      emergencyPayload as CreateGuestEmergencyCallInput,
      getGuestLocaleCode(request),
    );
    return guestSuccessResponse({ status: 200, error: null, message: "OK", data });
  } catch (error) {
    if (error instanceof HttpError) {
      return guestHttpErrorResponse(error);
    }

    return guestUnknownErrorResponse();
  }
}
