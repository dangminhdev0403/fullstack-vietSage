import "server-only";

import type { Session } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { HttpError } from "@/core/http/http-error";
import { refreshAndSaveSessionTokens, type RefreshedSessionTokens } from "@/lib/auth-session-refresh";

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

  let currentAccessToken = options.session.accessToken ?? undefined;
  let currentRefreshToken = options.session.refreshToken ?? undefined;
  let refreshInFlight: Promise<RefreshedSessionTokens> | null = null;

  if (!currentAccessToken) {
    redirectToLogin(options.callbackUrl, "no_access_token");
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
