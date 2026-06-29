import { auth } from "@/auth";
import { NextResponse } from "next/server";

import { refreshAndSaveSessionTokens } from "@/lib/auth-session-refresh";

export const dynamic = "force-dynamic";

function unauthorizedResponse() {
  return NextResponse.json(
    {
      status: 401,
      error: null,
      message: "UNAUTHORIZED",
      data: { detail: "Refresh token is required" },
    },
    { status: 401 },
  );
}

function serverErrorResponse() {
  return NextResponse.json(
    {
      status: 500,
      error: null,
      message: "REFRESH_TOKEN_FAILED",
      data: { detail: "Unable to refresh session" },
    },
    { status: 500 },
  );
}

function tokenTail(token: string | null | undefined): string | null {
  return token ? token.slice(-12) : null;
}

export async function POST() {
  const session = await auth();
  const refreshToken = session?.refreshToken ?? null;

  if (!refreshToken) {
    return unauthorizedResponse();
  }

  try {
    console.info("[AUTH_REFRESH_BEFORE]", {
      saveLocation: "next-auth-jwt-session",
      accessTokenTail: tokenTail(session?.accessToken),
      refreshTokenTail: tokenTail(refreshToken),
      accessTokenExpiresAt: session?.accessTokenExpiresAt ?? null,
      timestamp: Date.now(),
    });

    const refreshedTokens = await refreshAndSaveSessionTokens(refreshToken);

    console.info("[AUTH_REFRESH_AFTER]", {
      saveLocation: "next-auth-jwt-session",
      accessTokenTail: tokenTail(refreshedTokens.accessToken),
      refreshTokenTail: tokenTail(refreshedTokens.refreshToken),
      accessTokenExpiresAt: refreshedTokens.accessTokenExpiresAt,
      timestamp: Date.now(),
    });

    return NextResponse.json({
      status: 200,
      error: null,
      message: "Token refreshed successfully",
      data: {
        accessToken: refreshedTokens.accessToken,
        refreshToken: refreshedTokens.refreshToken,
        accessTokenExpiresAt: refreshedTokens.accessTokenExpiresAt,
      },
    });
  } catch (error) {
    console.warn("[AUTH_REFRESH_FAILED]", {
      refreshTokenTail: tokenTail(refreshToken),
      errorMessage: error instanceof Error ? error.message : "Unknown refresh error",
      timestamp: Date.now(),
    });

    return serverErrorResponse();
  }
}
