import "server-only";

import { auth, unstable_update } from "@/auth";
import { authService } from "@/features/auth/service/auth-service-instance";

export type RefreshedSessionTokens = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
};

const refreshInFlightByToken = new Map<string, Promise<RefreshedSessionTokens>>();

function tokenTail(token: string): string {
  return token.slice(-12);
}

function readCurrentSessionTokens(refreshToken: string): Promise<RefreshedSessionTokens | null> {
  return auth().then((session) => {
    if (
      !session?.accessToken ||
      !session.refreshToken ||
      typeof session.accessTokenExpiresAt !== "number" ||
      session.refreshToken === refreshToken
    ) {
      return null;
    }

    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      accessTokenExpiresAt: session.accessTokenExpiresAt,
    };
  });
}

export async function refreshSessionTokens(
  refreshToken: string,
): Promise<RefreshedSessionTokens> {
  const refreshedTokens = await authService.refresh(refreshToken);

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
      });
      const session = await auth();

      console.info("[SESSION_REFRESH_SAVED]", {
        saveLocation: "next-auth-jwt-session",
        newAccessToken: session?.accessToken ? "updated" : "set",
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
