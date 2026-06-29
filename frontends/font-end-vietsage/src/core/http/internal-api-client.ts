"use client";

import { unwrapApiEnvelope, type ApiEnvelope } from "@/core/http/api-envelope";
import { HttpClient, type HttpMethod } from "@/core/http/http-client";

type InternalApiRequestOptions<TBody = unknown> = {
  method: HttpMethod;
  body?: TBody;
  headers?: Record<string, string | undefined>;
  signal?: AbortSignal;
};

let internalApiClient: HttpClient | null = null;

function getInternalApiClient(): HttpClient {
  internalApiClient ??= new HttpClient({
    baseUrl: globalThis.location.origin,
  });

  return internalApiClient;
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
  return getInternalApiClient().request<ApiEnvelope<TData>, TBody>({
    method: options.method,
    path,
    body: options.body,
    headers: options.headers,
    signal: options.signal,
    isPublic: true,
  });
}
