import { auth } from "@/auth";
import { NextResponse } from "next/server";

import { refreshAndSaveSessionTokens } from "@/libs/auth-session-refresh";
import { readServerSessionTokens } from "@/libs/server-session-tokens";

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

export async function POST() {
  const session = await auth();
  const tokens = await readServerSessionTokens();
  const refreshToken = tokens.refreshToken;

  if (!refreshToken) {
    return unauthorizedResponse();
  }

  try {
    console.info("[AUTH_REFRESH_BEFORE]", {
      saveLocation: "next-auth-jwt-session",
      accessTokenExpiresAt: session?.accessTokenExpiresAt ?? tokens.accessTokenExpiresAt,
      timestamp: Date.now(),
    });

    const refreshedTokens = await refreshAndSaveSessionTokens(refreshToken);

    console.info("[AUTH_REFRESH_AFTER]", {
      saveLocation: "next-auth-jwt-session",
      accessTokenExpiresAt: refreshedTokens.accessTokenExpiresAt,
      timestamp: Date.now(),
    });

    return NextResponse.json({
      status: 200,
      error: null,
      message: "Session refreshed successfully",
      data: {
        accessTokenExpiresAt: refreshedTokens.accessTokenExpiresAt,
      },
    });
  } catch (error) {
    console.warn("[AUTH_REFRESH_FAILED]", {
      errorMessage: error instanceof Error ? error.message : "Unknown refresh error",
      timestamp: Date.now(),
    });

    return serverErrorResponse();
  }
}
