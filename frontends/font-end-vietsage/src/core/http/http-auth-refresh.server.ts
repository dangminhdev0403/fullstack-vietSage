import "server-only";

import { auth } from "@/auth";
import { refreshAndSaveSessionTokens } from "@/lib/auth-session-refresh";

export type ServerAuthRefreshResult = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
};

export async function refreshServerSessionAccessToken(): Promise<ServerAuthRefreshResult | null> {
  const session = await auth();
  const refreshToken = session?.refreshToken ?? null;

  if (!refreshToken) {
    return null;
  }

  return refreshAndSaveSessionTokens(refreshToken);
}
