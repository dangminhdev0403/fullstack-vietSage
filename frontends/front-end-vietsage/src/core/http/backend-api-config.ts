const DEFAULT_BACKEND_API_BASE_URL = "http://localhost:8080";

type BackendApiEnvironment = {
  AUTH_API_BASE_URL?: string;
  NEXT_PUBLIC_AUTH_API_BASE_URL?: string;
};

export function resolveConfiguredBackendApiBaseUrl(environment: BackendApiEnvironment): string {
  return environment.AUTH_API_BASE_URL ?? environment.NEXT_PUBLIC_AUTH_API_BASE_URL ?? DEFAULT_BACKEND_API_BASE_URL;
}

function getConfiguredBackendApiBaseUrl(): string {
  return resolveConfiguredBackendApiBaseUrl({
    AUTH_API_BASE_URL: process.env.AUTH_API_BASE_URL,
    NEXT_PUBLIC_AUTH_API_BASE_URL: process.env.NEXT_PUBLIC_AUTH_API_BASE_URL,
  });
}

export function resolveBrowserReachableBackendUrl(baseUrl: string): string {
  if (typeof window === "undefined") {
    return baseUrl;
  }

  try {
    const parsed = new URL(baseUrl);
    const frontendHost = window.location.hostname;
    const frontendProtocol = window.location.protocol;
    const isLocalBackendHost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    const isRemoteFrontendHost = frontendHost !== "localhost" && frontendHost !== "127.0.0.1";

    if (isLocalBackendHost && isRemoteFrontendHost) {
      parsed.hostname = frontendHost;
      parsed.protocol = frontendProtocol;
      parsed.port = "";
    } else if (frontendProtocol === "https:" && parsed.protocol === "http:") {
      parsed.protocol = "https:";
      if (parsed.port === "80" || parsed.port === "8080") {
        parsed.port = "";
      }
    }

    return parsed.toString().replace(/\/$/, "");
  } catch {
    return baseUrl;
  }
}

export function getBackendApiBaseUrl(): string {
  return getConfiguredBackendApiBaseUrl();
}

export function getBrowserBackendApiBaseUrl(): string {
  return resolveBrowserReachableBackendUrl(getConfiguredBackendApiBaseUrl());
}

export const BACKEND_API_MAX_LIMIT = 100;

type BackendApiLimitValue = string | number | boolean | null | undefined;
type BackendApiLimitQueryValue = BackendApiLimitValue | BackendApiLimitValue[];

export function clampBackendApiLimit(value: BackendApiLimitQueryValue): BackendApiLimitQueryValue {
  if (Array.isArray(value)) {
    return value.map((item) => clampBackendApiLimitValue(item));
  }

  return clampBackendApiLimitValue(value);
}

function clampBackendApiLimitValue(value: BackendApiLimitValue): BackendApiLimitValue {
  const numericValue = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;

  if (!Number.isFinite(numericValue) || numericValue <= BACKEND_API_MAX_LIMIT) {
    return value;
  }

  return BACKEND_API_MAX_LIMIT;
}
