import { type NextRequest, NextResponse } from "next/server";

import { AuthServiceError } from "@/features/auth/service/auth-service";
import { refreshAndSaveSessionTokens } from "@/libs/auth-session-refresh";
import { sanitizeInternalCallbackUrl } from "@/libs/rbac";
import { readServerSessionTokens } from "@/libs/server-session-tokens";

export const dynamic = "force-dynamic";

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
  const loginUrl = new URL("/login", request.url);

  loginUrl.searchParams.set("reauth", "1");
  loginUrl.searchParams.set("callbackUrl", sanitizeInternalCallbackUrl(callbackUrl));

  return NextResponse.redirect(loginUrl);
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

    console.info("[AUTH_REFRESH_GATE_SUCCESS]", {
      source: "refresh-session-route",
      callbackUrl,
      timestamp: Date.now(),
    });

    return NextResponse.redirect(new URL(callbackUrl, request.url));
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

    return NextResponse.json({
      ok: true,
      status: 200,
      message: "Session refreshed successfully",
      data: {
        accessTokenExpiresAt: refreshedTokens.accessTokenExpiresAt,
      },
    });
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
