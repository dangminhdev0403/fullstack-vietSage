import "server-only";

import { clampBackendApiLimit, getBackendApiBaseUrl } from "@/core/http/backend-api-config";
import { HttpError } from "@/core/http/http-error";
import { toLogSafePayload } from "@/core/http/http-log-redactor";
import type { HttpMethod, HttpQuery } from "@/core/http/http-client";
import { isPublicApiPath } from "@/core/http/public-api-paths";
import { HTTP_HEADER_TENANT_ID } from "@/core/http/tenant-scope";
import { runtimeConsole } from "@/core/logging/runtime-console";

type RequestHeaders = Record<string, string | undefined>;

export type HttpServerRequestConfig = {
  baseUrl?: string;
  headers?: RequestHeaders;
  query?: HttpQuery;
  accessToken?: string | null;
  tenantId?: string | null;
  isAuth?: boolean;
  isPublic?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number | false;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const HTTP_RESPONSE_LOG_PREFIX = "[API_RES]";

function extractApiResponseMessage(responseBody: unknown): string | undefined {
  if (!responseBody || typeof responseBody !== "object" || Array.isArray(responseBody)) {
    return undefined;
  }

  const message = (responseBody as { message?: unknown }).message;
  if (typeof message !== "string") {
    return undefined;
  }

  const trimmed = message.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function logApiResponse(params: {
  method: HttpMethod;
  requestUrl: string;
  status: number;
  ok: boolean;
  durationMs: number;
  responseBody: unknown;
  message?: string;
}): void {
  const isServerError = params.status >= 500 || params.status === 0;
  const level = params.ok ? "info" : isServerError ? "error" : "warn";
  if (!runtimeConsole.enabled(level)) return;

  let pathname = params.requestUrl;
  try {
    const url = new URL(params.requestUrl);
    pathname = url.pathname;
  } catch {
    // Keep raw url if not a valid full URL
  }

  const metadata = {
    method: params.method,
    url: pathname,
    status: params.status,
    ok: params.ok,
    durationMs: params.durationMs,
    message: params.message ?? extractApiResponseMessage(params.responseBody),
  };

  const log = params.ok
    ? runtimeConsole.info
    : isServerError
      ? runtimeConsole.error
      : runtimeConsole.warn;

  if (process.env.NODE_ENV === "production") {
    if (!params.ok) {
      log(HTTP_RESPONSE_LOG_PREFIX, metadata);
    }
    return;
  }

  log(HTTP_RESPONSE_LOG_PREFIX, {
    ...metadata,
    response: toLogSafePayload(params.responseBody),
  });
}

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

  const timeout =
    options.timeoutMs === false
      ? null
      : createTimeoutController(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signals = [timeout?.controller.signal, options.signal].filter(
    Boolean,
  ) as AbortSignal[];
  const requestSignal =
    signals.length > 1 ? AbortSignal.any(signals) : signals[0];
  const headers = toHeaders(options.headers);
  const requestStartedAt = Date.now();

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  if (isPublicRequest(url.pathname, options)) {
    headers.delete("Authorization");
  } else if (options.accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${options.accessToken}`);
  }

  if (options.tenantId) {
    headers.set(HTTP_HEADER_TENANT_ID, options.tenantId);
  }

  try {
    const first = await sendRequest({
      method,
      url,
      body,
      headers,
      signal: requestSignal,
    });

    logApiResponse({
      method,
      requestUrl: url.toString(),
      status: first.response.status,
      ok: first.response.ok,
      durationMs: Date.now() - requestStartedAt,
      responseBody: first.body,
    });

    if (first.response.ok) {
      return first.body as TResponse;
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
      logApiResponse({
        method,
        requestUrl: url.toString(),
        status: 408,
        ok: false,
        durationMs: Date.now() - requestStartedAt,
        responseBody: null,
        message: "Request timed out",
      });
      throw new HttpError({
        message: "Request timed out",
        status: 408,
        requestUrl: url.toString(),
        data: null,
      });
    }

    logApiResponse({
      method,
      requestUrl: url.toString(),
      status: 0,
      ok: false,
      durationMs: Date.now() - requestStartedAt,
      responseBody: null,
      message: "Network request failed",
    });
    throw new HttpError({
      message: "Network request failed",
      status: 0,
      requestUrl: url.toString(),
      data: null,
    });
  } finally {
    timeout?.clear();
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
