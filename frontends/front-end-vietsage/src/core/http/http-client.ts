import { clampBackendApiLimit } from "@/core/http/backend-api-config";
import { HttpError } from "@/core/http/http-error";
import { BACKEND_API_RETRY_ON_401 } from "@/core/http/backend-api-config";
import { isPublicApiPath } from "@/core/http/public-api-paths";

type Primitive = string | number | boolean;
type QueryValue = Primitive | null | undefined | Array<Primitive | null | undefined>;

type RequestHeaders = Record<string, string | undefined>;

export type HttpQuery = Record<string, QueryValue>;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type HttpClientOptions = {
  baseUrl: string;
  timeoutMs?: number;
  defaultHeaders?: RequestHeaders;
};

export type HttpRequestOptions<TBody = unknown> = {
  method: HttpMethod;
  path: string;
  body?: TBody;
  query?: HttpQuery;
  headers?: RequestHeaders;
  accessToken?: string;
  accessTokenExpiresAt?: number | null;
  isPublic?: boolean;
  skipAuthRefresh?: boolean;
  signal?: AbortSignal;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const CLIENT_REFRESH_EARLY_MS = 30_000;
const REFRESH_COOLDOWN_MS = 10_000;
const HTTP_RESPONSE_LOG_PREFIX = "[API_RES]";
const FORBIDDEN_GET_NOT_FOUND_PATH = "/404";
const MAX_LOG_STRING_LENGTH = 1_200;
const MAX_LOG_ARRAY_ITEMS = 20;
const MAX_LOG_OBJECT_KEYS = 20;
const MAX_LOG_DEPTH = 4;
const LOG_REDACTED_KEYS = new Set(["accessToken", "refreshToken"]);
const AUTH_LOGOUT_REQUIRED_EVENT = "vietsage:auth:logout-required";

type ClientRefreshResult = {
  accessTokenExpiresAt: number;
};

let clientAccessTokenExpiresAt: number | null = null;
let clientRefreshInFlight: Promise<ClientRefreshResult> | null = null;
let lastClientRefreshResult: ClientRefreshResult | null = null;
let lastClientRefreshAt = 0;

function isPublicRequest(pathname: string, isPublic?: boolean): boolean {
  return Boolean(isPublic) || isPublicApiPath(pathname);
}

function shouldAttachAuthorizationHeader(options: {
  accessToken?: string;
  isPublic?: boolean;
  pathname: string;
}): boolean {
  if (!options.accessToken) {
    return false;
  }

  if (isPublicRequest(options.pathname, options.isPublic)) {
    return false;
  }

  return true;
}

function isBrowserRuntime(): boolean {
  return typeof window !== "undefined";
}

function requestClientAuthLogout(reason: string, pathname: string): void {
  if (!isBrowserRuntime()) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(AUTH_LOGOUT_REQUIRED_EVENT, {
      detail: {
        reason,
        pathname,
        timestamp: Date.now(),
      },
    }),
  );
}

function renderNotFoundForForbiddenGet(options: {
  method: HttpMethod;
  status: number;
  requestUrl: string;
}): void {
  if (!isBrowserRuntime() || options.method !== "GET" || options.status !== 403) {
    return;
  }

  console.info("[API_AUTH] 403_get_client_not_found", {
    requestUrl: options.requestUrl,
    notFoundPath: FORBIDDEN_GET_NOT_FOUND_PATH,
  });

  if (window.location.pathname !== FORBIDDEN_GET_NOT_FOUND_PATH) {
    window.location.replace(FORBIDDEN_GET_NOT_FOUND_PATH);
  }
}

function isClientRefreshEligible(options: {
  pathname: string;
  isPublic?: boolean;
  accessToken?: string;
  accessTokenExpiresAt?: number | null;
}): boolean {
  if (!isBrowserRuntime()) {
    return false;
  }

  if (!options.accessToken) {
    return false;
  }

  if (isPublicRequest(options.pathname, options.isPublic)) {
    return false;
  }

  return typeof options.accessTokenExpiresAt === "number" || clientAccessTokenExpiresAt !== null;
}

function seedClientAuth(accessTokenExpiresAt?: number | null): void {
  if (typeof accessTokenExpiresAt !== "number") {
    return;
  }

  if (clientAccessTokenExpiresAt !== null && clientAccessTokenExpiresAt >= accessTokenExpiresAt) {
    return;
  }

  clientAccessTokenExpiresAt = accessTokenExpiresAt;
}

function getClientAccessToken(fallbackAccessToken?: string): string | undefined {
  return fallbackAccessToken;
}

function shouldRefreshClientAccessToken(): boolean {
  if (typeof clientAccessTokenExpiresAt !== "number") {
    return false;
  }

  return Date.now() >= clientAccessTokenExpiresAt - CLIENT_REFRESH_EARLY_MS;
}

function parseClientRefreshResult(payload: unknown): ClientRefreshResult | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  const result = data as Partial<ClientRefreshResult>;
  if (typeof result.accessTokenExpiresAt !== "number") {
    return null;
  }

  return {
    accessTokenExpiresAt: result.accessTokenExpiresAt,
  };
}

async function refreshClientAccessToken(): Promise<ClientRefreshResult> {
  const now = Date.now();
  if (lastClientRefreshResult && now - lastClientRefreshAt <= REFRESH_COOLDOWN_MS) {
    console.info("[AUTH_REFRESH_REUSE]", {
      accessTokenExpiresAt: lastClientRefreshResult.accessTokenExpiresAt,
      timestamp: now,
    });

    return lastClientRefreshResult;
  }

  if (clientRefreshInFlight) {
    console.info("[AUTH_REFRESH_WAIT]", {
      timestamp: now,
    });

    return clientRefreshInFlight;
  }

  console.info("[AUTH_REFRESH_START]", {
    timestamp: now,
  });

  clientRefreshInFlight = fetch("/api/auth/refresh-session", {
    method: "POST",
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    cache: "no-store",
  })
    .then(async (response) => {
      const payload = await parseResponseBody(response);
      if (!response.ok) {
        throw new Error(`Client refresh failed with status ${response.status}`);
      }

      const refreshedTokens = parseClientRefreshResult(payload);
      if (!refreshedTokens) {
        throw new Error("Client refresh response is invalid");
      }

      clientAccessTokenExpiresAt = refreshedTokens.accessTokenExpiresAt;
      lastClientRefreshResult = refreshedTokens;
      lastClientRefreshAt = Date.now();

      console.info("[AUTH_REFRESH_SUCCESS]", {
        accessTokenExpiresAt: refreshedTokens.accessTokenExpiresAt,
        timestamp: Date.now(),
      });

      return refreshedTokens;
    })
    .catch((error) => {
      console.warn("[AUTH_REFRESH_FAILED]", {
        errorMessage: error instanceof Error ? error.message : "Unknown refresh error",
        timestamp: Date.now(),
      });

      throw error;
    })
    .finally(() => {
      clientRefreshInFlight = null;
      console.info("[AUTH_REFRESH_RESET]", {
        timestamp: Date.now(),
      });
    });

  return clientRefreshInFlight;
}

async function refreshServerAccessToken(): Promise<ClientRefreshResult | null> {
  if (isBrowserRuntime()) {
    return null;
  }

  console.warn("[API_AUTH] 401_server_refresh_deferred_to_route_wrapper");
  return null;
}

async function refreshClientAccessTokenIfNeeded(options: {
  pathname: string;
  isPublic?: boolean;
  accessToken?: string;
  accessTokenExpiresAt?: number | null;
}): Promise<string | undefined> {
  if (!isClientRefreshEligible(options)) {
    return options.accessToken;
  }

  seedClientAuth(options.accessTokenExpiresAt);

  if (shouldRefreshClientAccessToken()) {
    try {
      await refreshClientAccessToken();
      return getClientAccessToken(options.accessToken);
    } catch (error) {
      console.warn("[CLIENT_AUTH_REFRESH_FAILED]", {
        errorMessage: error instanceof Error ? error.message : "Unknown refresh error",
        timestamp: Date.now(),
      });

      return getClientAccessToken(options.accessToken);
    }
  }

  return getClientAccessToken(options.accessToken);
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
        if (item === null || item === undefined) {
          continue;
        }

        url.searchParams.append(key, String(item));
      }

      continue;
    }

    url.searchParams.set(key, String(queryValue));
  }
}

function toHeaders(input: RequestHeaders = {}): Headers {
  const headers = new Headers();

  for (const [key, value] of Object.entries(input)) {
    if (!value) {
      continue;
    }

    headers.set(key, value);
  }

  return headers;
}

function createTimeoutController(timeoutMs: number): { controller: AbortController; clear: () => void } {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return {
    controller,
    clear: () => {
      clearTimeout(timeoutHandle);
    },
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

function toLogSafePayload(payload: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (payload === null || payload === undefined) {
    return payload;
  }

  if (typeof payload === "string") {
    if (payload.length <= MAX_LOG_STRING_LENGTH) {
      return payload;
    }

    return `${payload.slice(0, MAX_LOG_STRING_LENGTH)}...[trimmed ${payload.length - MAX_LOG_STRING_LENGTH} chars]`;
  }

  if (typeof payload !== "object") {
    return payload;
  }

  if (depth >= MAX_LOG_DEPTH) {
    return "[max-depth]";
  }

  if (seen.has(payload)) {
    return "[circular]";
  }

  seen.add(payload);

  if (Array.isArray(payload)) {
    const limitedItems = payload.slice(0, MAX_LOG_ARRAY_ITEMS).map((item) => toLogSafePayload(item, depth + 1, seen));

    if (payload.length > MAX_LOG_ARRAY_ITEMS) {
      limitedItems.push(`[+${payload.length - MAX_LOG_ARRAY_ITEMS} more items]`);
    }

    return limitedItems;
  }

  const entries = Object.entries(payload);
  const limitedEntries = entries.slice(0, MAX_LOG_OBJECT_KEYS).map(([key, value]) => [
    key,
    LOG_REDACTED_KEYS.has(key) ? "[redacted]" : toLogSafePayload(value, depth + 1, seen),
  ]);
  const result = Object.fromEntries(limitedEntries);

  if (entries.length > MAX_LOG_OBJECT_KEYS) {
    result.__truncatedKeys = `+${entries.length - MAX_LOG_OBJECT_KEYS} more keys`;
  }

  return result;
}

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
  console.info(HTTP_RESPONSE_LOG_PREFIX, {
    method: params.method,
    url: params.requestUrl,
    status: params.status,
    ok: params.ok,
    durationMs: params.durationMs,
    message: params.message ?? extractApiResponseMessage(params.responseBody),
    response: toLogSafePayload(params.responseBody),
  });
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly defaultHeaders: RequestHeaders;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.defaultHeaders = options.defaultHeaders ?? {};
  }

  async request<TResponse, TBody = unknown>(options: HttpRequestOptions<TBody>): Promise<TResponse> {
    const url = new URL(options.path, this.baseUrl);
    appendQuery(url, options.query);

    const timeout = createTimeoutController(this.timeoutMs);
    const headers = toHeaders(this.defaultHeaders);
    const requestStartedAt = Date.now();

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

    if (isPublicRequest(url.pathname, options.isPublic)) {
      headers.delete("Authorization");
    }

    const requestAccessToken = options.skipAuthRefresh
      ? options.accessToken
      : await refreshClientAccessTokenIfNeeded({
          pathname: url.pathname,
          isPublic: options.isPublic,
          accessToken: options.accessToken,
          accessTokenExpiresAt: options.accessTokenExpiresAt,
        });

    if (shouldAttachAuthorizationHeader({
      accessToken: requestAccessToken,
      isPublic: options.isPublic,
      pathname: url.pathname,
    })) {
      headers.set("Authorization", `Bearer ${requestAccessToken}`);
    }

    const signals = [timeout.controller.signal, options.signal].filter(Boolean) as AbortSignal[];
    const requestSignal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];

    try {
      const response = await fetch(url, {
        method: options.method,
        headers,
        body,
        signal: requestSignal,
      });

      const responseBody = await parseResponseBody(response);
      if (!response.ok) {
        if (
          BACKEND_API_RETRY_ON_401 &&
          !options.skipAuthRefresh &&
          response.status === 401 &&
          !isPublicRequest(url.pathname, options.isPublic)
        ) {
          try {
            const refreshedTokens = isBrowserRuntime() ? await refreshClientAccessToken() : await refreshServerAccessToken();

            if (refreshedTokens) {
              const retryResponse = await fetch(url, {
                method: options.method,
                headers,
                body,
                signal: requestSignal,
              });
              const retryResponseBody = await parseResponseBody(retryResponse);

              if (retryResponse.ok) {
                logApiResponse({
                  method: options.method,
                  requestUrl: url.toString(),
                  status: retryResponse.status,
                  ok: true,
                  durationMs: Date.now() - requestStartedAt,
                  responseBody: retryResponseBody,
                });

                return retryResponseBody as TResponse;
              }

              renderNotFoundForForbiddenGet({
                method: options.method,
                status: retryResponse.status,
                requestUrl: url.toString(),
              });

              if (retryResponse.status === 401) {
                requestClientAuthLogout("retry_401_after_refresh", url.pathname);
              }

              throw new HttpError({
                message: `Request failed with status ${retryResponse.status}`,
                status: retryResponse.status,
                requestUrl: url.toString(),
                data: retryResponseBody,
              });
            }
          } catch (refreshError) {
            if (refreshError instanceof HttpError) {
              throw refreshError;
            }

            console.warn(isBrowserRuntime() ? "[API_AUTH] 401_client_refresh_failed" : "[API_AUTH] 401_server_refresh_failed", {
              method: options.method,
              path: url.pathname,
              errorMessage: refreshError instanceof Error ? refreshError.message : "Unknown refresh error",
            });
          }

          console.warn(isBrowserRuntime() ? "[API_AUTH] 401_after_client_refresh" : "[API_AUTH] 401_after_server_refresh", {
            method: options.method,
            path: url.pathname,
          });

          requestClientAuthLogout("401_after_client_refresh", url.pathname);
        }

        renderNotFoundForForbiddenGet({
          method: options.method,
          status: response.status,
          requestUrl: url.toString(),
        });

        throw new HttpError({
          message: `Request failed with status ${response.status}`,
          status: response.status,
          requestUrl: url.toString(),
          data: responseBody,
        });
      }

      logApiResponse({
        method: options.method,
        requestUrl: url.toString(),
        status: response.status,
        ok: true,
        durationMs: Date.now() - requestStartedAt,
        responseBody,
      });

      return responseBody as TResponse;
    } catch (error) {
      if (error instanceof HttpError) {
        logApiResponse({
          method: options.method,
          requestUrl: error.requestUrl,
          status: error.status,
          ok: false,
          durationMs: Date.now() - requestStartedAt,
          responseBody: error.data,
          message: error.message,
        });

        throw error;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        const timeoutError = new HttpError({
          message: "Request timed out",
          status: 408,
          requestUrl: url.toString(),
          data: null,
        });

        logApiResponse({
          method: options.method,
          requestUrl: timeoutError.requestUrl,
          status: timeoutError.status,
          ok: false,
          durationMs: Date.now() - requestStartedAt,
          responseBody: timeoutError.data,
          message: timeoutError.message,
        });

        throw timeoutError;
      }

      const networkError = new HttpError({
        message: "Network request failed",
        status: 0,
        requestUrl: url.toString(),
        data: null,
      });

      logApiResponse({
        method: options.method,
        requestUrl: networkError.requestUrl,
        status: networkError.status,
        ok: false,
        durationMs: Date.now() - requestStartedAt,
        responseBody: networkError.data,
        message: networkError.message,
      });

      throw networkError;
    } finally {
      timeout.clear();
    }
  }
}








