import { NextResponse } from "next/server";

import { HttpError } from "@/core/http/http-error";
import type { GuestLocaleCode } from "@/features/guest-os/types/guest-os-contract";

const guestLocaleCodes = new Set<GuestLocaleCode>(["vi", "en", "zh", "ko", "ru", "hi"]);

export function guestSuccessResponse(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status });
}

export function guestValidationErrorResponse(detail: string) {
  return NextResponse.json(
    { status: 400, message: "VALIDATION_ERROR", data: { detail } },
    { status: 400 },
  );
}

export function guestHttpErrorResponse(error: HttpError) {
  return NextResponse.json(
    error.data ?? { status: error.status, message: error.message },
    { status: error.status || 500 },
  );
}

export function guestUnknownErrorResponse() {
  return NextResponse.json(
    { status: 500, message: "INTERNAL_SERVER_ERROR" },
    { status: 500 },
  );
}

export function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(/\s+/, 2);

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export function getGuestLocaleCode(request: Request): GuestLocaleCode | undefined {
  const url = new URL(request.url);
  const rawLocale =
    request.headers.get("x-lang") ??
    request.headers.get("accept-language")?.split(",", 1)[0] ??
    url.searchParams.get("lang");
  const normalized = rawLocale?.trim().toLowerCase().replace("_", "-") ?? "";
  const code = normalized.split("-", 1)[0] as GuestLocaleCode;

  return guestLocaleCodes.has(code) ? code : undefined;
}

export async function readJsonBody(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
