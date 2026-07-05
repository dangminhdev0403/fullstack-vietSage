import "server-only";

import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { BACKEND_API_RETRY_ON_401, clampBackendApiLimit, getBackendApiBaseUrl } from "@/core/http/backend-api-config";
import { HttpError } from "@/core/http/http-error";
import type { HttpMethod, HttpQuery } from "@/core/http/http-client";
import { isPublicApiPath } from "@/core/http/public-api-paths";
import { refreshAndSaveSessionTokens } from "@/lib/auth-session-refresh";

type RequestHeaders = Record<string, string | undefined>;

export type HttpServerRequestConfig = {
  baseUrl?: string;
  headers?: RequestHeaders;
  query?: HttpQuery;
  isAuth?: boolean;
  isPublic?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;

function appendQuery(url: URL, query?: HttpQuery): void {
  if (!query) {
    return;
  }

  for (const [key, value] of Object.entries(query)) {
    const queryValue = key === "limit" ? clampBackendApiLimit(value) : value;

    if (queryValue === null || queryValue === undefined) {
      continue;
    }

    if (Array.isArray(queryValue)) {
      for (const item of queryValue) {
        if (item !== null && item !== undefined) {
          url.searchParams.append(key, String(item));
        }
      }
      continue;
    }

    url.searchParams.set(key, String(queryValue));
  }
}

function toHeaders(input: RequestHeaders = {}): Headers {
  const headers = new Headers();

  for (const [key, value] of Object.entries(input)) {
    if (value) {
      headers.set(key, value);
    }
  }

  return headers;
}

function createTimeoutController(timeoutMs: number): {
  controller: AbortController;
  clear: () => void;
} {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  return {
    controller,
    clear: () => clearTimeout(timeoutHandle),
  };
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    const text = await response.text();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

function isPublicRequest(
  pathname: string,
  options: HttpServerRequestConfig,
): boolean {
  return Boolean(options.isPublic) || isPublicApiPath(pathname);
}

async function getAuthorizedSession() {
  const session = await auth();
  const accessToken = session?.accessToken ?? null;
  const refreshToken = session?.refreshToken ?? null;

  if (!accessToken) {
    throw new HttpError({
      message: "Unauthorized: No access token found",
      status: 401,
      requestUrl: "auth-session",
      data: {
        status: 401,
        message: "UNAUTHORIZED",
        data: { detail: "Access token is required" },
      },
    });
  }

  return { accessToken, refreshToken };
}

async function sendRequest<TBody>(params: {
  method: HttpMethod;
  url: URL;
  body?: TBody;
  headers: Headers;
  signal?: AbortSignal;
}): Promise<{ response: Response; body: unknown }> {
  let requestBody: string | undefined;

  if (params.body !== undefined) {
    params.headers.set("Content-Type", "application/json");
    requestBody = JSON.stringify(params.body);
  }

  const response = await fetch(params.url, {
    method: params.method,
    headers: params.headers,
    body: requestBody,
    signal: params.signal,
  });

  return {
    response,
    body: await parseResponseBody(response),
  };
}

export async function request<TResponse, TBody = unknown>(
  method: HttpMethod,
  path: string,
  body?: TBody,
  options: HttpServerRequestConfig = {},
): Promise<TResponse> {
  const url = new URL(path, options.baseUrl ?? getBackendApiBaseUrl());
  appendQuery(url, options.query);

  const timeout = createTimeoutController(
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  const signals = [timeout.controller.signal, options.signal].filter(
    Boolean,
  ) as AbortSignal[];
  const requestSignal =
    signals.length > 1 ? AbortSignal.any(signals) : signals[0];
  const headers = toHeaders(options.headers);
  const authRequired =
    Boolean(options.isAuth) && !isPublicRequest(url.pathname, options);
  let authorizedSession: Awaited<ReturnType<typeof getAuthorizedSession>> | null = null;

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  if (authRequired) {
    authorizedSession = await getAuthorizedSession();
    headers.set("Authorization", `Bearer ${authorizedSession.accessToken}`);
  } else {
    headers.delete("Authorization");
  }

  try {
    const first = await sendRequest({
      method,
      url,
      body,
      headers,
      signal: requestSignal,
    });

    if (first.response.ok) {
      return first.body as TResponse;
    }

    if (BACKEND_API_RETRY_ON_401 && first.response.status === 401 && authRequired) {
      console.info("[API_AUTH] 401_http_server_refresh_retry", {
        method,
        path: url.pathname,
      });

      if (authorizedSession?.refreshToken) {
        try {
          const refreshedTokens = await refreshAndSaveSessionTokens(authorizedSession.refreshToken);
          headers.set("Authorization", `Bearer ${refreshedTokens.accessToken}`);

          const retry = await sendRequest({
            method,
            url,
            body,
            headers,
            signal: requestSignal,
          });

          if (retry.response.ok) {
            return retry.body as TResponse;
          }

          throw new HttpError({
            message: `Request failed with status ${retry.response.status}`,
            status: retry.response.status,
            requestUrl: url.toString(),
            data: retry.body,
          });
        } catch (refreshError) {
          if (refreshError instanceof HttpError) {
            throw refreshError;
          }

          console.warn("[API_AUTH] 401_http_server_refresh_failed", {
            method,
            path: url.pathname,
            errorMessage: refreshError instanceof Error ? refreshError.message : "Unknown refresh error",
          });
        }
      } else {
        console.warn("[API_AUTH] 401_http_server_refresh_skipped_no_refresh_token", {
          method,
          path: url.pathname,
        });
      }
    }

    if (method === "GET" && first.response.status === 403) {
      console.info("[API_AUTH] 403_get_server_not_found", {
        path: url.pathname,
        requestUrl: url.toString(),
      });
      notFound();
    }

    throw new HttpError({
      message: `Request failed with status ${first.response.status}`,
      status: first.response.status,
      requestUrl: url.toString(),
      data: first.body,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new HttpError({
        message: "Request timed out",
        status: 408,
        requestUrl: url.toString(),
        data: null,
      });
    }

    throw new HttpError({
      message: "Network request failed",
      status: 0,
      requestUrl: url.toString(),
      data: null,
    });
  } finally {
    timeout.clear();
  }
}

export const httpServer = {
  request,
  get: <TResponse>(path: string, options?: HttpServerRequestConfig) =>
    request<TResponse>("GET", path, undefined, options),
  post: <TResponse, TBody = unknown>(
    path: string,
    body?: TBody,
    options?: HttpServerRequestConfig,
  ) => request<TResponse, TBody>("POST", path, body, options),
  put: <TResponse, TBody = unknown>(
    path: string,
    body?: TBody,
    options?: HttpServerRequestConfig,
  ) => request<TResponse, TBody>("PUT", path, body, options),
  patch: <TResponse, TBody = unknown>(
    path: string,
    body?: TBody,
    options?: HttpServerRequestConfig,
  ) => request<TResponse, TBody>("PATCH", path, body, options),
  delete: <TResponse>(path: string, options?: HttpServerRequestConfig) =>
    request<TResponse>("DELETE", path, undefined, options),
};
