  import { HttpError } from "@/core/http/http-error";
import { guestOsService } from "@/features/guest-os/service/guest-os-service-instance";
import type { CreateGuestRequestInput, GuestPortalRequestStatus } from "@/features/guest-os/types/guest-os-contract";

import {
  getBearerToken,
  getGuestLocaleCode,
  guestHttpErrorResponse,
  guestSuccessResponse,
  guestUnknownErrorResponse,
  guestValidationErrorResponse,
  readJsonBody,
} from "../_utils";

function toPositiveInteger(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function isGuestRequestStatus(value: string | undefined): value is GuestPortalRequestStatus {
  return value === "CREATED" || value === "ACKNOWLEDGED" || value === "IN_PROGRESS" || value === "COMPLETED" || value === "CANCELLED" || value === "FAILED";
}

function normalizeGuestRequestStatus(value: string | undefined): GuestPortalRequestStatus | undefined {
  if (value === "CREATE") {
    return "CREATED";
  }

  return isGuestRequestStatus(value) ? value : undefined;
}

export async function GET(request: Request) {
  const sessionToken = getBearerToken(request);
  if (!sessionToken) {
    return guestValidationErrorResponse("sessionToken is required");
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status")?.trim() || undefined;

  const guestStatus = normalizeGuestRequestStatus(status);
  if (status && !guestStatus) {
    return guestValidationErrorResponse("status must be CREATE, CREATED, ACKNOWLEDGED, IN_PROGRESS, COMPLETED, CANCELLED, or FAILED");
  }

  try {
    const data = await guestOsService.listRequests(sessionToken, {
      page: toPositiveInteger(url.searchParams.get("page")),
      limit: toPositiveInteger(url.searchParams.get("limit")),
      ...(guestStatus ? { status: guestStatus } : {}),
    }, getGuestLocaleCode(request));
    return guestSuccessResponse({ status: 200, error: null, message: "OK", data });
  } catch (error) {
    if (error instanceof HttpError) {
      return guestHttpErrorResponse(error);
    }

    return guestUnknownErrorResponse();
  }
}

export async function POST(request: Request) {
  const sessionToken = getBearerToken(request);
  if (!sessionToken) {
    return guestValidationErrorResponse("sessionToken is required");
  }

  const payload = await readJsonBody(request);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return guestValidationErrorResponse("Request body must be valid JSON");
  }

  const requestPayload = payload as Partial<CreateGuestRequestInput> & Record<string, unknown>;
  if (typeof requestPayload.serviceItemId !== "string" || requestPayload.serviceItemId.trim().length === 0) {
    return guestValidationErrorResponse("serviceItemId is required");
  }

  if ("type" in requestPayload || "title" in requestPayload || "details" in requestPayload || "metadata" in requestPayload) {
    return guestValidationErrorResponse("Guest requests must be created from service items only");
  }

  try {
    const data = await guestOsService.createRequest(sessionToken, requestPayload as CreateGuestRequestInput, getGuestLocaleCode(request));
    return guestSuccessResponse({ status: 200, error: null, message: "OK", data });
  } catch (error) {
    if (error instanceof HttpError) {
      return guestHttpErrorResponse(error);
    }

    return guestUnknownErrorResponse();
  }
}
