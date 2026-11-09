import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { runtimeConsole } from "@/core/logging/runtime-console";
import { AuthServiceError } from "@/features/auth/service/auth-service";
import { LOGIN_PATH } from "@/features/auth/utils/login-route";
import { createRequestRedirectUrl } from "@/features/auth/utils/redirect-isolation-core";
import { refreshAndSaveSessionTokens } from "@/libs/auth-session-refresh";
import { sanitizeInternalCallbackUrl } from "@/libs/rbac";
import { readServerSessionTokens } from "@/libs/server-session-tokens";

export const dynamic = "force-dynamic";

const nextAuthCookiePrefixes = [
  "next-auth.",
  "__Secure-next-auth.",
  "__Host-next-auth.",
  "authjs.",
  "__Secure-authjs.",
  "__Host-authjs.",
] as const;

function isNextAuthCookie(cookieName: string): boolean {
  return nextAuthCookiePrefixes.some((prefix) => cookieName.startsWith(prefix));
}

function clearNextAuthCookies(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  const nextAuthCookieNames = request.cookies
    .getAll()
    .concat(response.cookies.getAll())
    .map((cookie) => cookie.name)
    .filter((cookieName) => isNextAuthCookie(cookieName));

  for (const cookieName of new Set(nextAuthCookieNames)) {
    const requiresSecureFlag =
      cookieName.startsWith("__Secure-") || cookieName.startsWith("__Host-");

    response.cookies.set({
      name: cookieName,
      value: "",
      path: "/",
      maxAge: 0,
      expires: new Date(0),
      secure: requiresSecureFlag,
    });
  }

  return response;
}

function unauthorizedResponse() {
  return NextResponse.json(
    {
      ok: false,
      status: 401,
      message: "UNAUTHORIZED",
      data: { detail: "Refresh token is required" },
    },
    { status: 401 },
  );
}

function refreshFailureResponse() {
  return NextResponse.json(
    {
      ok: false,
      status: 401,
      message: "REFRESH_TOKEN_FAILED",
      data: { detail: "Unable to refresh session" },
    },
    { status: 401 },
  );
}

function serverErrorResponse() {
  return NextResponse.json(
    {
      ok: false,
      status: 500,
      message: "REFRESH_TOKEN_FAILED",
      data: { detail: "Unable to refresh session" },
    },
    { status: 500 },
  );
}

function getCallbackUrl(request: NextRequest): string {
  return sanitizeInternalCallbackUrl(request.nextUrl.searchParams.get("callbackUrl"));
}

function buildLoginRedirect(request: NextRequest, callbackUrl: string): NextResponse {
  const loginUrl = createRequestRedirectUrl(LOGIN_PATH, request);

  loginUrl.searchParams.set("reauth", "1");
  loginUrl.searchParams.set("callbackUrl", sanitizeInternalCallbackUrl(callbackUrl));

  const response = NextResponse.redirect(loginUrl);
  return clearNextAuthCookies(request, response);
}

function isExpectedRefreshFailure(error: unknown): boolean {
  return error instanceof AuthServiceError && (
    error.code === "INVALID_CREDENTIALS" ||
    error.code === "UNAUTHORIZED"
  );
}

export async function GET(request: NextRequest) {
  const callbackUrl = getCallbackUrl(request);

  try {
    const tokens = await readServerSessionTokens(request);
    const refreshToken = tokens.refreshToken;

    if (!refreshToken) {
      console.warn("[AUTH_REFRESH_GATE_FAILED]", {
        source: "refresh-session-route",
        reason: "no_refresh_token",
        callbackUrl,
        timestamp: Date.now(),
      });

      return buildLoginRedirect(request, callbackUrl);
    }

    await refreshAndSaveSessionTokens(refreshToken);

    runtimeConsole.info("[AUTH_REFRESH_GATE_SUCCESS]", {
      source: "refresh-session-route",
      callbackUrl,
      timestamp: Date.now(),
    });

    const redirectUrl = createRequestRedirectUrl(callbackUrl, request);
    redirectUrl.searchParams.set("__refreshed", "1");

    const response = NextResponse.redirect(redirectUrl);

    response.cookies.set({
      name: "__vs_refresh_at",
      value: String(Date.now()),
      path: "/",
      maxAge: 15,
      sameSite: "lax",
    });

    const cookieStore = await cookies();
    for (const cookie of cookieStore.getAll()) {
      response.cookies.set(cookie);
    }

    return response;
  } catch (error) {
    console.warn("[AUTH_REFRESH_GATE_FAILED]", {
      source: "refresh-session-route",
      callbackUrl,
      errorMessage: error instanceof Error ? error.message : "Unknown refresh error",
      timestamp: Date.now(),
    });

    return buildLoginRedirect(request, callbackUrl);
  }
}

export async function POST() {
  const tokens = await readServerSessionTokens();
  const refreshToken = tokens.refreshToken;
  if (!refreshToken) {
    return unauthorizedResponse();
  }

  try {
    const refreshedTokens = await refreshAndSaveSessionTokens(refreshToken);

    const response = NextResponse.json({
      ok: true,
      status: 200,
      message: "Session refreshed successfully",
      data: {
        accessTokenExpiresAt: refreshedTokens.accessTokenExpiresAt,
      },
    });

    const cookieStore = await cookies();
    for (const cookie of cookieStore.getAll()) {
      response.cookies.set(cookie);
    }

    return response;
  } catch (error) {
    const expectedRefreshFailure = isExpectedRefreshFailure(error);
    console.warn("[AUTH_REFRESH_GATE_FAILED]", {
      source: "refresh-session-route",
      errorMessage: error instanceof Error ? error.message : "Unknown refresh error",
      expectedRefreshFailure,
      timestamp: Date.now(),
    });

    return expectedRefreshFailure ? refreshFailureResponse() : serverErrorResponse();
  }
}
