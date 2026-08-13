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

function readInternalApiErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const p = payload as Record<string, unknown>;
    if (p.data && typeof p.data === "object" && !Array.isArray(p.data)) {
      const detail = (p.data as { detail?: unknown }).detail;
      if (typeof detail === "string" && detail.trim()) return detail.trim();
      const msg = (p.data as { message?: unknown }).message;
      if (typeof msg === "string" && msg.trim() && !/^[A-Z0-9_ -]+$/.test(msg.trim())) return msg.trim();
    }
    if (typeof p.detail === "string" && p.detail.trim()) return p.detail.trim();
    if (typeof p.message === "string" && p.message.trim() && !/^[A-Z0-9_ -]+$/.test(p.message.trim())) {
      return p.message.trim();
    }
  }
  if (status === 409) return "Thông tin đối tác hoặc danh mục đã tồn tại trên hệ thống (Lỗi trùng lặp).";
  if (status === 400) return "Thông tin nhập chưa đúng hoặc không hợp lệ.";
  if (status === 403) return "Bạn không có quyền thực hiện thao tác này.";
  if (status === 404) return "Không tìm thấy tài nguyên yêu cầu.";
  if (status === 401) return "Chưa đăng nhập hoặc phiên làm việc đã hết hạn.";
  return `Yêu cầu thất bại (${status}). Vui lòng thử lại.`;
}

async function fetchInternalApi<TData, TBody>(
  path: string,
  options: InternalApiRequestOptions<TBody>,
): Promise<ApiEnvelope<TData>> {
  const response = await fetch(path, createRequestInit(options));
  const payload = await parseResponseBody(response);

  if (!response.ok) {
    const message = readInternalApiErrorMessage(payload, response.status);
    console.error(`[INTERNAL_API_ERROR ${response.status}] ${options.method} ${path}:`, {
      status: response.status,
      message,
      payload,
    });
    throw new HttpError({
      message,
      status: response.status,
      requestUrl: path,
      data: payload,
      headers: response.headers,
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
