import { NextResponse } from "next/server";
import type { Session } from "next-auth";

import { auth } from "@/auth";
import { HttpError } from "@/core/http/http-error";
import { refreshAndSaveSessionTokens } from "@/libs/auth-session-refresh";
import { readServerSessionTokens } from "@/libs/server-session-tokens";
import { resolveWorkspacePersona } from "@/features/workspace/config/workspace-registry";

type SessionTokenMetadata = {
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: number | null;
};

type AuthTokens = { accessToken: string; refreshToken: string | null };
type BackendRequest<T> = (accessToken: string) => Promise<T>;

const REFRESH_EARLY_MS = 30_000;

function shouldRefresh(tokens: SessionTokenMetadata, session: Session | null): boolean {
  if (!tokens.refreshToken) return false;
  if (!tokens.accessToken || session?.authError) return true;
  return typeof tokens.accessTokenExpiresAt === "number"
    ? Date.now() >= tokens.accessTokenExpiresAt - REFRESH_EARLY_MS
    : false;
}

async function getHotelOpsAuthTokens(): Promise<AuthTokens | NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { status: 401, message: "UNAUTHORIZED", data: { detail: "Access token is required" } },
      { status: 401 },
    );
  }

  const persona = session.activeRoleCode
    ? resolveWorkspacePersona(session.activeRoleCode)
    : null;
  if (!persona) {
    return NextResponse.json(
      { status: 403, message: "FORBIDDEN", data: { detail: "Không có quyền truy cập." } },
      { status: 403 },
    );
  }

  const tokens = await readServerSessionTokens();
  if (shouldRefresh(tokens, session)) {
    try {
      const refreshed = await refreshAndSaveSessionTokens(tokens.refreshToken!);
      return { accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken };
    } catch (error) {
      console.warn("[API_AUTH] hotel_ops_initial_refresh_failed", {
        errorMessage: error instanceof Error ? error.message : "Unknown refresh error",
      });
    }
  }

  if (!tokens.accessToken || session.authError) {
    return NextResponse.json(
      { status: 401, message: "UNAUTHORIZED", data: { detail: "Access token is required" } },
      { status: 401 },
    );
  }

  return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
}

export async function executeHotelOpsBackendRequest<T>(
  operationName: string,
  request: BackendRequest<T>,
): Promise<T | NextResponse> {
  const sessionTokens = await getHotelOpsAuthTokens();
  if (sessionTokens instanceof NextResponse) return sessionTokens;

  try {
    return await request(sessionTokens.accessToken);
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 401 || !sessionTokens.refreshToken) {
      throw error;
    }

    console.info("[API_AUTH] 401_hotel_ops_refresh_retry", { operationName });
    const refreshed = await refreshAndSaveSessionTokens(sessionTokens.refreshToken);
    return request(refreshed.accessToken);
  }
}

export function validationErrorResponse(detail: string) {
  return NextResponse.json(
    { status: 400, message: "VALIDATION_ERROR", data: { detail } },
    { status: 400 },
  );
}

export function successResponse<T>(data: T, status = 200, message = "OK") {
  return NextResponse.json({ status, error: null, message, data }, { status });
}

export function hotelOpsHttpErrorResponse(error: HttpError) {
  if (error.status === 403) {
    return NextResponse.json(
      { status: 403, message: "FORBIDDEN", data: { detail: "Không có quyền thực hiện thao tác này." } },
      { status: 403 },
    );
  }

  if (error.status === 404) {
    return NextResponse.json(
      { status: 404, message: "NOT_FOUND", data: { detail: "Không tìm thấy dữ liệu trong phạm vi khách sạn." } },
      { status: 404 },
    );
  }

  return NextResponse.json(
    error.data ?? { status: error.status, message: error.message },
    { status: error.status },
  );
}

export function unknownServerErrorResponse() {
  return NextResponse.json(
    { status: 500, message: "INTERNAL_SERVER_ERROR" },
    { status: 500 },
  );
}
