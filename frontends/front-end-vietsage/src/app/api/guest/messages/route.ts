import { HttpError } from "@/core/http/http-error";
import { guestOsService } from "@/features/guest-os/service/guest-os-service-instance";
import { getBearerToken, getGuestLocaleCode, guestHttpErrorResponse, guestSuccessResponse, guestUnknownErrorResponse, guestValidationErrorResponse, readJsonBody } from "../_utils";

export async function GET(request: Request) {
  const token = getBearerToken(request);
  if (!token) return guestValidationErrorResponse("sessionToken is required");
  const { searchParams } = new URL(request.url);
  const before = searchParams.get("before") ?? undefined;
  const limitStr = searchParams.get("limit");
  const limit = limitStr ? Number(limitStr) : undefined;
  try {
    const data = await guestOsService.listMessages(token, { before, limit }, getGuestLocaleCode(request));
    return guestSuccessResponse({ status: 200, error: null, message: "OK", data });
  } catch (error) {
    return error instanceof HttpError ? guestHttpErrorResponse(error) : guestUnknownErrorResponse();
  }
}

export async function POST(request: Request) {
  const token = getBearerToken(request);
  if (!token) return guestValidationErrorResponse("sessionToken is required");
  const payload = await readJsonBody(request);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || typeof (payload as { body?: unknown }).body !== "string") return guestValidationErrorResponse("body is required");
  try {
    const data = await guestOsService.sendMessage(token, (payload as { body: string }).body, getGuestLocaleCode(request));
    return guestSuccessResponse({ status: 201, error: null, message: "OK", data });
  } catch (error) {
    return error instanceof HttpError ? guestHttpErrorResponse(error) : guestUnknownErrorResponse();
  }
}
