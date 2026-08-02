import { HttpError } from "@/core/http/http-error";
import { guestOsService } from "@/features/guest-os/service/guest-os-service-instance";
import { getBearerToken, getGuestLocaleCode, guestHttpErrorResponse, guestSuccessResponse, guestUnknownErrorResponse, guestValidationErrorResponse } from "../../_utils";

export async function POST(request: Request) {
  const token = getBearerToken(request);
  if (!token) return guestValidationErrorResponse("sessionToken is required");
  const payload = await request.json().catch(() => null);
  const readThroughMessageId = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as { readThroughMessageId?: unknown }).readThroughMessageId
    : null;
  if (typeof readThroughMessageId !== "string" || !readThroughMessageId.trim()) return guestValidationErrorResponse("readThroughMessageId là bắt buộc");
  try {
    const data = await guestOsService.markMessagesRead(token, readThroughMessageId, getGuestLocaleCode(request));
    return guestSuccessResponse({ status: 200, error: null, message: "OK", data });
  } catch (error) {
    return error instanceof HttpError ? guestHttpErrorResponse(error) : guestUnknownErrorResponse();
  }
}
