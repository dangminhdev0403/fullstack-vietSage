import "server-only";

import { randomUUID } from "node:crypto";

import { unstable_update } from "@/auth";
import { authService } from "@/features/auth/service/auth-service-instance";
import { readServerSessionTokens } from "@/libs/server-session-tokens";

export type RefreshedSessionTokens = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
};

const refreshInFlightByToken = new Map<string, Promise<RefreshedSessionTokens>>();
const refreshIdempotencyByToken = new Map<
  string,
  { key: string; expiresAt: number }
>();
const REFRESH_IDEMPOTENCY_TTL_MS = 300_000;

function getRefreshIdempotencyKey(refreshToken: string): string {
  const now = Date.now();
  const existing = refreshIdempotencyByToken.get(refreshToken);
  if (existing && existing.expiresAt > now) {
    return existing.key;
  }

  const key = randomUUID();
  refreshIdempotencyByToken.set(refreshToken, {
    key,
    expiresAt: now + REFRESH_IDEMPOTENCY_TTL_MS,
  });

  for (const [token, entry] of refreshIdempotencyByToken) {
    if (entry.expiresAt <= now) {
      refreshIdempotencyByToken.delete(token);
    }
  }

  return key;
}

function tokenTail(token: string): string {
  return token.slice(-12);
}

function readCurrentSessionTokens(refreshToken: string): Promise<RefreshedSessionTokens | null> {
  return readServerSessionTokens().then((tokens) => {
    if (
      !tokens.accessToken ||
      !tokens.refreshToken ||
      typeof tokens.accessTokenExpiresAt !== "number" ||
      tokens.refreshToken === refreshToken
    ) {
      return null;
    }

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
    };
  });
}

export async function refreshSessionTokens(
  refreshToken: string,
): Promise<RefreshedSessionTokens> {
  const idempotencyKey = getRefreshIdempotencyKey(refreshToken);
  const refreshedTokens = await authService.refresh(refreshToken, idempotencyKey);

  console.info("[SESSION_REFRESH_SUCCESS]", {
    saveLocation: "none",
    accessTokenExpiresAt: refreshedTokens.accessTokenExpiresAt,
    accessTokenTail: tokenTail(refreshedTokens.accessToken),
    refreshTokenTail: tokenTail(refreshedTokens.refreshToken),
    timestamp: Date.now(),
  });

  return refreshedTokens;
}

export async function refreshAndSaveSessionTokens(
  refreshToken: string,
): Promise<RefreshedSessionTokens> {
  const existingRefresh = refreshInFlightByToken.get(refreshToken);
  if (existingRefresh) {
    console.info("[SESSION_REFRESH_WAIT_IN_FLIGHT]", {
      refreshTokenTail: tokenTail(refreshToken),
      timestamp: Date.now(),
    });
    return existingRefresh;
  }

  const refreshPromise = (async () => {
    try {
      const refreshedTokens = await refreshSessionTokens(refreshToken);

      await unstable_update({
        accessToken: refreshedTokens.accessToken,
        refreshToken: refreshedTokens.refreshToken,
        accessTokenExpiresAt: refreshedTokens.accessTokenExpiresAt,
        authError: null,
      } as never);
      refreshIdempotencyByToken.delete(refreshToken);
      const tokens = await readServerSessionTokens();

      console.info("[SESSION_REFRESH_SAVED]", {
        saveLocation: "next-auth-jwt-session",
        newAccessToken: tokens.accessToken ? "updated" : "set",
        refreshTokenTail: tokenTail(refreshedTokens.refreshToken),
        timestamp: Date.now(),
      });

      return refreshedTokens;
    } catch (error) {
      const currentSessionTokens = await readCurrentSessionTokens(refreshToken);
      if (currentSessionTokens) {
        console.info("[SESSION_REFRESH_REUSED_ROTATED_SESSION]", {
          oldRefreshTokenTail: tokenTail(refreshToken),
          currentRefreshTokenTail: tokenTail(currentSessionTokens.refreshToken),
          accessTokenExpiresAt: currentSessionTokens.accessTokenExpiresAt,
          timestamp: Date.now(),
        });
        return currentSessionTokens;
      }

      throw error;
    } finally {
      refreshInFlightByToken.delete(refreshToken);
    }
  })();

  refreshInFlightByToken.set(refreshToken, refreshPromise);
  return refreshPromise;
}
