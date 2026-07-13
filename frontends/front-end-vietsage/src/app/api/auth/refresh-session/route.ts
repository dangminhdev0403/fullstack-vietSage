import { auth } from "@/auth";
import { type NextRequest, NextResponse } from "next/server";

import { refreshAndSaveSessionTokens } from "@/lib/auth-session-refresh";

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
  const callbackUrl = request.nextUrl.searchParams.get("callbackUrl");

  if (callbackUrl?.startsWith("/")) {
    return callbackUrl;
  }

  return "/admin/dashboard";
}

function buildLoginRedirect(request: NextRequest, callbackUrl: string): NextResponse {
  const loginUrl = new URL("/login", request.url);

  loginUrl.searchParams.set("reauth", "1");
  loginUrl.searchParams.set("callbackUrl", callbackUrl);

  return NextResponse.redirect(loginUrl);
}

export async function GET(request: NextRequest) {
  const callbackUrl = getCallbackUrl(request);
  const session = await auth();
  const refreshToken = session?.refreshToken ?? null;

  if (!refreshToken) {
    console.warn("[AUTH_REFRESH_GATE_FAILED]", {
      source: "refresh-session-route",
      reason: "no_refresh_token",
      callbackUrl,
      timestamp: Date.now(),
    });

    return buildLoginRedirect(request, callbackUrl);
  }

  try {
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
  const session = await auth();
  const refreshToken = session?.refreshToken ?? null;

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
    console.warn("[AUTH_REFRESH_GATE_FAILED]", {
      source: "refresh-session-route",
      errorMessage: error instanceof Error ? error.message : "Unknown refresh error",
      timestamp: Date.now(),
    });

    return serverErrorResponse();
  }
}
