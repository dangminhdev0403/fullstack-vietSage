import { NextResponse } from "next/server";

import { HttpError } from "@/core/http/http-error";
import { guestOsService } from "@/features/guest-os/service/guest-os-service-instance";
import type { GuestLocaleCode } from "@/features/guest-os/types/guest-os-contract";
import {
  GUEST_AI_FLOATING_CHAT,
  hasHotelFeature,
} from "@/features/hotel-features/hotel-features";
import {
  getBearerToken,
  guestHttpErrorResponse,
  guestUnknownErrorResponse,
  guestValidationErrorResponse,
  readJsonBody,
} from "../_utils";

const N8N_WEBHOOK_URL = process.env.LOCALMATE_N8N_WEBHOOK_URL?.trim();

const allowedLocales = new Set(["vi", "en", "zh", "ko", "ru", "hi"]);

type GuestChatPayload = {
  message?: unknown;
  destination?: unknown;
  language?: unknown;
};

export async function POST(request: Request) {
  const sessionToken = getBearerToken(request);
  if (!sessionToken) {
    return NextResponse.json(
      { status: 401, message: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const payload = (await readJsonBody(request)) as GuestChatPayload | null;
  const message =
    typeof payload?.message === "string" ? payload.message.trim() : "";
  if (!message || message.length > 2_000) {
    return guestValidationErrorResponse("Tin nhắn phải có từ 1 đến 2000 ký tự");
  }

  const destination =
    typeof payload?.destination === "string"
      ? payload.destination.trim().slice(0, 120)
      : "";
  const requestedLanguage =
    typeof payload?.language === "string"
      ? payload.language.trim().toLowerCase()
      : "";
  const language = allowedLocales.has(requestedLanguage)
    ? requestedLanguage
    : "vi";

  try {
    const current = await guestOsService.getCurrentSession(
      sessionToken,
      language as GuestLocaleCode,
    );

    if (
      !hasHotelFeature(
        current.session.hotel.enabledFeatures,
        GUEST_AI_FLOATING_CHAT,
      )
    ) {
      return NextResponse.json(
        {
          status: 403,
          message: "FEATURE_NOT_ENABLED",
          data: {
            detail: "Tính năng trợ lý AI chưa được kích hoạt cho khách sạn này",
          },
        },
        { status: 403 },
      );
    }

    const webhookSecret = process.env.LOCALMATE_N8N_WEBHOOK_SECRET?.trim();
    if (!N8N_WEBHOOK_URL || !webhookSecret) {
      return NextResponse.json(
        { status: 503, message: "CHAT_SERVICE_UNAVAILABLE" },
        { status: 503 },
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    try {
      const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-VietSage-Chat-Key": webhookSecret,
        },
        body: JSON.stringify({
          message,
          destination,
          hotelId: current.session.hotelId,
          hotelName: current.session.hotel.name,
          sessionId: current.session.id,
          language,
          radiusKm: 50,
          limit: 5,
        }),
        signal: controller.signal,
        cache: "no-store",
      });

      if (!n8nResponse.ok) {
        return NextResponse.json(
          { status: 502, message: "CHAT_UPSTREAM_ERROR" },
          { status: 502 },
        );
      }

      const data = (await n8nResponse.json()) as {
        status?: unknown;
        reply?: unknown;
        suggestions?: unknown;
        knowledgeVersion?: unknown;
        cached?: unknown;
      };
      if (typeof data.reply !== "string" || !data.reply.trim()) {
        return NextResponse.json(
          { status: 502, message: "CHAT_UPSTREAM_INVALID_RESPONSE" },
          { status: 502 },
        );
      }

      // Forward suggestions[] if agent provided them (array of {label, query})
      const suggestions = Array.isArray(data.suggestions)
        ? (data.suggestions as { label?: unknown; query?: unknown }[])
            .filter((s) => typeof s?.label === "string" && typeof s?.query === "string")
            .slice(0, 3)
            .map((s) => ({ label: (s.label as string).trim(), query: (s.query as string).trim() }))
        : [];

      return NextResponse.json({
        status: 200,
        reply: data.reply.trim(),
        suggestions,
        knowledgeVersion:
          typeof data.knowledgeVersion === "string" ? data.knowledgeVersion : "unknown",
        cached: data.cached === true,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    if (error instanceof HttpError) {
      return guestHttpErrorResponse(error);
    }
    return guestUnknownErrorResponse();
  }
}
