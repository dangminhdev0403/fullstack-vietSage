"use client";

import { unwrapApiEnvelope, type ApiEnvelope } from "@/core/http/api-envelope";
import { HttpError } from "@/core/http/http-error";
import { type HttpMethod } from "@/core/http/http-client";
import {
  dispatchAuthLogoutRequired,
  refreshInternalSession,
} from "@/core/http/internal-session-refresh";

type InternalApiRequestOptions<TBody = unknown> = {
  method: HttpMethod;
  body?: TBody;
  headers?: Record<string, string | undefined>;
  signal?: AbortSignal;
};

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }

  const text = await response.text().catch(() => "");
  return text.length > 0 ? text : null;
}

function createRequestInit<TBody>(
  options: InternalApiRequestOptions<TBody>,
): RequestInit {
  const headers = new Headers();

  for (const [key, value] of Object.entries(options.headers ?? {})) {
    if (value) {
      headers.set(key, value);
    }
  }

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  let body: string | undefined;
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }

  return {
    method: options.method,
    headers,
    body,
    signal: options.signal,
    credentials: "same-origin",
    cache: "no-store",
  };
}

function assertInternalApiPath(path: string): void {
  if (!path.startsWith("/api/")) {
    throw new Error(`Internal API path must start with /api/: ${path}`);
  }
}

async function fetchInternalApi<TData, TBody>(
  path: string,
  options: InternalApiRequestOptions<TBody>,
): Promise<ApiEnvelope<TData>> {
  const response = await fetch(path, createRequestInit(options));
  const payload = await parseResponseBody(response);

  if (!response.ok) {
    throw new HttpError({
      message: `Internal API request failed with status ${response.status}`,
      status: response.status,
      requestUrl: path,
      data: payload,
    });
  }

  return payload as ApiEnvelope<TData>;
}

export async function requestInternalApi<TData, TBody = unknown>(
  path: string,
  options: InternalApiRequestOptions<TBody>,
): Promise<TData> {
  const payload = await requestInternalApiEnvelope<TData, TBody>(path, options);

  return unwrapApiEnvelope<TData>(payload).data;
}

export async function requestInternalApiEnvelope<TData, TBody = unknown>(
  path: string,
  options: InternalApiRequestOptions<TBody>,
): Promise<ApiEnvelope<TData>> {
  assertInternalApiPath(path);

  try {
    return await fetchInternalApi<TData, TBody>(path, options);
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 401 || path === "/api/auth/refresh-session") {
      throw error;
    }

    try {
      await refreshInternalSession();
      return await fetchInternalApi<TData, TBody>(path, options);
    } catch (retryError) {
      if (retryError instanceof HttpError && retryError.status === 401) {
        dispatchAuthLogoutRequired("internal_api_retry_401", globalThis.location.pathname);
      } else {
        dispatchAuthLogoutRequired("internal_api_refresh_failed", globalThis.location.pathname);
      }

      // Return a pending promise so the component stays in loading state while window.location redirects to /login
      return new Promise<never>(() => {});
    }
  }
}
