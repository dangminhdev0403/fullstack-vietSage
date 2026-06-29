import { NextResponse } from "next/server";
import type { Session } from "next-auth";

import { auth } from "@/auth";
import { HttpError } from "@/core/http/http-error";
import { refreshAndSaveSessionTokens } from "@/lib/auth-session-refresh";
import { hasAppRole } from "@/lib/rbac";

type OwnerAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
};

type OwnerBackendRequest<T> = (accessToken: string) => Promise<T>;

const OWNER_API_REFRESH_EARLY_MS = 30_000;

function shouldRefreshOwnerSession(session: Session | null): session is Session & { refreshToken: string } {
  if (!session?.refreshToken) {
    return false;
  }

  if (!session.accessToken || session.authError) {
    return true;
  }

  if (typeof session.accessTokenExpiresAt !== "number") {
    return false;
  }

  return Date.now() >= session.accessTokenExpiresAt - OWNER_API_REFRESH_EARLY_MS;
}

async function getOwnerAuthTokens(): Promise<OwnerAuthTokens | NextResponse> {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      { status: 401, message: "UNAUTHORIZED", data: { detail: "Access token is required" } },
      { status: 401 },
    );
  }

  if (!hasAppRole(session.user.roles, "tenant_owner")) {
    return NextResponse.json(
      { status: 403, message: "FORBIDDEN", data: { detail: "Không có quyền truy cập." } },
      { status: 403 },
    );
  }

  if (shouldRefreshOwnerSession(session)) {
    try {
      const refreshedTokens = await refreshAndSaveSessionTokens(session.refreshToken);
      return {
        accessToken: refreshedTokens.accessToken,
        refreshToken: refreshedTokens.refreshToken,
      };
    } catch (error) {
      console.warn("[API_AUTH] owner_initial_refresh_failed", {
        errorMessage: error instanceof Error ? error.message : "Unknown refresh error",
      });
    }
  }

  if (!session.accessToken || session.authError) {
    return NextResponse.json(
      { status: 401, message: "UNAUTHORIZED", data: { detail: "Access token is required" } },
      { status: 401 },
    );
  }

  return { accessToken: session.accessToken, refreshToken: session.refreshToken ?? null };
}

export async function getOwnerAccessToken(): Promise<string | NextResponse> {
  const ownerAuth = await getOwnerAuthTokens();
  if (ownerAuth instanceof NextResponse) return ownerAuth;

  return ownerAuth.accessToken;
}

export async function executeOwnerBackendRequest<T>(
  _operationName: string,
  request: OwnerBackendRequest<T>,
): Promise<T | NextResponse> {
  const ownerAuth = await getOwnerAuthTokens();
  if (ownerAuth instanceof NextResponse) return ownerAuth;

  try {
    return await request(ownerAuth.accessToken);
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 401 || !ownerAuth.refreshToken) {
      throw error;
    }

    console.info("[API_AUTH] 401_owner_refresh_retry", { operationName: _operationName });

    try {
      const refreshedTokens = await refreshAndSaveSessionTokens(ownerAuth.refreshToken);
      return await request(refreshedTokens.accessToken);
    } catch (refreshError) {
      if (refreshError instanceof HttpError) {
        throw refreshError;
      }

      console.warn("[API_AUTH] 401_owner_refresh_failed", {
        operationName: _operationName,
        errorMessage: refreshError instanceof Error ? refreshError.message : "Unknown refresh error",
      });

      throw error;
    }
  }
}

export function validationErrorResponse(detail: string) {
  return NextResponse.json(
    { status: 400, message: "VALIDATION_ERROR", data: { detail } },
    { status: 400 },
  );
}

export function successResponse<TData>(data: TData, status = 200, message = "OK") {
  return NextResponse.json({ status, error: null, message, data }, { status });
}

export function ownerHttpErrorResponse(error: HttpError) {
  if (error.status === 403) {
    return NextResponse.json(
      { status: 403, message: "FORBIDDEN", data: { detail: "Không có quyền truy cập." } },
      { status: 403 },
    );
  }

  if (error.status === 404) {
    return NextResponse.json(
      {
        status: 404,
        message: "NOT_FOUND",
        data: { detail: "Không tìm thấy khách sạn hoặc bạn không có quyền truy cập." },
      },
      { status: 404 },
    );
  }

  return NextResponse.json(error.data ?? { status: error.status, message: error.message }, { status: error.status });
}

export function unknownServerErrorResponse() {
  return NextResponse.json({ status: 500, message: "INTERNAL_SERVER_ERROR" }, { status: 500 });
}
