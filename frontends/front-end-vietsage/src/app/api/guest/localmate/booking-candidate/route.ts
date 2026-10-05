import { NextResponse } from "next/server";

import { resolveChatAction } from "@/app/api/guest/chat/chat-action";
import { parsePublicChatAction } from "@/app/api/localmate/public-chat/public-chat-action";
import { HttpError } from "@/core/http/http-error";
import { guestOsService } from "@/features/guest-os/service/guest-os-service-instance";
import {
  getBearerToken,
  getGuestLocaleCode,
  guestHttpErrorResponse,
  guestUnknownErrorResponse,
  guestValidationErrorResponse,
} from "../../_utils";

export async function GET(request: Request) {
  const sessionToken = getBearerToken(request);
  if (!sessionToken) return guestValidationErrorResponse("sessionToken is required");

  const action = parsePublicChatAction({
    type: "LOCALMATE_BOOKING",
    candidateKey: new URL(request.url).searchParams.get("candidateKey"),
  });
  if (!action) return guestValidationErrorResponse("candidateKey is invalid");

  try {
    const current = await guestOsService.getCurrentSession(sessionToken, getGuestLocaleCode(request));
    const resolved = await resolveChatAction(action, current.session.hotelId);
    if (!resolved) {
      return NextResponse.json({ status: 503, message: "BOOKING_CANDIDATE_UNAVAILABLE" }, { status: 503 });
    }
    return NextResponse.json({ status: 200, action: resolved });
  } catch (error) {
    return error instanceof HttpError ? guestHttpErrorResponse(error) : guestUnknownErrorResponse();
  }
}