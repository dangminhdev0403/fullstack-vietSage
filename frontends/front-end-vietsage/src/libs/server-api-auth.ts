import "server-only";

import type { Session } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { HttpError } from "@/core/http/http-error";
import { refreshAndSaveSessionTokens, type RefreshedSessionTokens } from "@/libs/auth-session-refresh";
import { readServerSessionTokens } from "@/libs/server-session-tokens";

type AuthorizedApiCall<T> = (accessToken?: string) => Promise<T>;

type AuthorizedApiExecutorOptions = {
  session: Session | null;
  callbackUrl: `/${string}`;
};

export type AuthorizedApiExecutor = <T>(operationName: string, call: AuthorizedApiCall<T>) => Promise<T>;

function logLoginRedirect(source: string, reason: string, pathname: string): void {
  console.info("[AUTH_REDIRECT_LOGIN_SOURCE]", { source, reason, pathname });
}

function redirectToLogin(callbackUrl: `/${string}`, reason: string): never {
  logLoginRedirect("server-api-auth", reason, callbackUrl);
  redirect(`/login?reauth=1&callbackUrl=${encodeURIComponent(callbackUrl)}`);
}

export function createAuthorizedApiExecutor(options: AuthorizedApiExecutorOptions): AuthorizedApiExecutor {
  if (!options.session?.user) {
    redirectToLogin(options.callbackUrl, "no_session");
  }

  if (options.session.authError) {
    redirectToLogin(options.callbackUrl, "auth_error");
  }

  const tokensPromise = readServerSessionTokens();
  let currentAccessToken: string | undefined;
  let currentRefreshToken: string | undefined;
  let refreshInFlight: Promise<RefreshedSessionTokens> | null = null;

  async function initializeExecutorTokens(): Promise<void> {
    if (currentAccessToken || currentRefreshToken) {
      return;
    }

    const tokens = await tokensPromise;
    currentAccessToken = tokens.accessToken ?? undefined;
    currentRefreshToken = tokens.refreshToken ?? undefined;

    if (!currentAccessToken) {
      redirectToLogin(options.callbackUrl, "no_access_token");
    }
  }

  async function refreshExecutorTokens(): Promise<RefreshedSessionTokens | null> {
    if (!currentRefreshToken) {
      return null;
    }

    refreshInFlight ??= refreshAndSaveSessionTokens(currentRefreshToken).finally(() => {
      refreshInFlight = null;
    });

    const refreshedTokens = await refreshInFlight;
    currentAccessToken = refreshedTokens.accessToken;
    currentRefreshToken = refreshedTokens.refreshToken;

    return refreshedTokens;
  }

  return async <T>(operationName: string, call: AuthorizedApiCall<T>): Promise<T> => {
    await initializeExecutorTokens();

    try {
      return await call(currentAccessToken);
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        if (currentRefreshToken) {
          try {
            console.info("[API_AUTH] 401_server_refresh_retry", {
              source: "server-api-auth",
              operationName,
              callbackUrl: options.callbackUrl,
            });

            const refreshedTokens = await refreshExecutorTokens();
            if (!refreshedTokens) {
              throw new Error("Refresh token is missing");
            }

            return await call(refreshedTokens.accessToken);
          } catch (refreshError) {
            console.warn("[API_AUTH] 401_server_refresh_failed", {
              source: "server-api-auth",
              operationName,
              callbackUrl: options.callbackUrl,
              errorMessage: refreshError instanceof Error ? refreshError.message : "Unknown refresh error",
            });
          }
        }

        console.info("[API_AUTH] 401_server_refresh_unavailable", {
          source: "server-api-auth",
          operationName,
          callbackUrl: options.callbackUrl,
        });
        redirectToLogin(options.callbackUrl, "backend_401_refresh_failed");
      }

      if (error instanceof HttpError && error.status === 403) {
        console.info("[API_AUTH] 403_server_not_found", {
          source: "server-api-auth",
          operationName,
          callbackUrl: options.callbackUrl,
          requestUrl: error.requestUrl,
        });
        notFound();
      }

      if (error instanceof HttpError) {
        console.warn("[API_AUTH] server_request_failed", {
          source: "server-api-auth",
          operationName,
          callbackUrl: options.callbackUrl,
          status: error.status,
          requestUrl: error.requestUrl,
        });
      }

      throw error;
    }
  };
}
