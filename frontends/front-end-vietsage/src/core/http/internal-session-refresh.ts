"use client";

export type InternalSessionRefreshMetadata = {
  accessTokenExpiresAt: number;
};

const AUTH_LOGOUT_REQUIRED_EVENT = "vietsage:auth:logout-required";

let refreshInFlight: Promise<InternalSessionRefreshMetadata> | null = null;
let logoutSignalDispatched = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRefreshMetadata(payload: unknown): InternalSessionRefreshMetadata {
  if (!isRecord(payload)) {
    throw new Error("Invalid refresh-session response");
  }

  const data = payload.data;
  if (!isRecord(data) || typeof data.accessTokenExpiresAt !== "number") {
    throw new Error("Invalid refresh-session metadata");
  }

  return { accessTokenExpiresAt: data.accessTokenExpiresAt };
}

export function dispatchAuthLogoutRequired(reason: string, pathname: string): void {
  if (typeof window === "undefined" || logoutSignalDispatched) {
    return;
  }

  logoutSignalDispatched = true;
  const targetUrl = `/login?reauth=1&callbackUrl=${encodeURIComponent(pathname)}`;
  console.warn("[AUTH_LOGOUT_REQUIRED]", { reason, pathname, targetUrl, timestamp: Date.now() });

  if (window.location.pathname !== "/login") {
    window.location.href = targetUrl;
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

export function refreshInternalSession(): Promise<InternalSessionRefreshMetadata> {
  if (refreshInFlight) {
    console.info("[AUTH_REFRESH_WAIT]", { source: "internal-api", timestamp: Date.now() });
    return refreshInFlight;
  }

  console.info("[AUTH_REFRESH_START]", { source: "internal-api", timestamp: Date.now() });

  refreshInFlight = fetch("/api/auth/refresh-session", {
    method: "POST",
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    cache: "no-store",
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(`Session refresh failed with status ${response.status}`);
      }

      const metadata = parseRefreshMetadata(payload);
      console.info("[AUTH_REFRESH_SUCCESS]", {
        source: "internal-api",
        accessTokenExpiresAt: metadata.accessTokenExpiresAt,
        timestamp: Date.now(),
      });

      return metadata;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

export const AUTH_LOGOUT_REQUIRED_EVENT_NAME = AUTH_LOGOUT_REQUIRED_EVENT;
