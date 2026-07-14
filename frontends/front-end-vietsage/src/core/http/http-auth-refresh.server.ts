import "server-only";

import { refreshAndSaveSessionTokens } from "@/lib/auth-session-refresh";
import { readServerSessionTokens } from "@/lib/server-session-tokens";

export type ServerAuthRefreshResult = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
};

export async function refreshServerSessionAccessToken(): Promise<ServerAuthRefreshResult | null> {
  const tokens = await readServerSessionTokens();
  const refreshToken = tokens.refreshToken;

  if (!refreshToken) {
    return null;
  }

  return refreshAndSaveSessionTokens(refreshToken);
}
