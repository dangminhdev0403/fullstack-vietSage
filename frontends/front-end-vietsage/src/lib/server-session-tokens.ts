import "server-only";

import { getToken, type JWT } from "@auth/core/jwt";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type ServerSessionTokens = {
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: number | null;
  authError: string | null;
};

function authSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET or AUTH_SECRET is required to read server session tokens");
  }

  return secret;
}

function toSessionTokens(token: JWT | null): ServerSessionTokens {
  return {
    accessToken: typeof token?.accessToken === "string" ? token.accessToken : null,
    refreshToken: typeof token?.refreshToken === "string" ? token.refreshToken : null,
    accessTokenExpiresAt: typeof token?.accessTokenExpiresAt === "number" ? token.accessTokenExpiresAt : null,
    authError: typeof token?.authError === "string" ? token.authError : null,
  };
}

export async function readServerSessionTokens(): Promise<ServerSessionTokens> {
  const requestHeaders = await headers();
  const token = await getToken({
    req: { headers: requestHeaders },
    secret: authSecret(),
  });

  return toSessionTokens(token);
}

export async function requireRefreshableServerSession(
  callbackUrl: `/${string}`,
  source = "server-session-tokens",
): Promise<ServerSessionTokens & { refreshToken: string }> {
  const tokens = await readServerSessionTokens();

  if (tokens.authError) {
    redirectToLogin(callbackUrl, "auth_error", source);
  }

  if (!tokens.refreshToken) {
    redirectToLogin(callbackUrl, "no_refresh_token", source);
  }

  return { ...tokens, refreshToken: tokens.refreshToken };
}

export function redirectToLogin(callbackUrl: `/${string}`, reason: string, source: string): never {
  console.info("[AUTH_REDIRECT_LOGIN_SOURCE]", {
    source,
    reason,
    pathname: callbackUrl,
  });

  redirect(`/login?reauth=1&callbackUrl=${encodeURIComponent(callbackUrl)}`);
}
