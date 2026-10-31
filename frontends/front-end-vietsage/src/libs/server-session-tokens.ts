import "server-only";

import { getToken, type JWT } from "@auth/core/jwt";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { resolveSessionCookiePolicy } from "./auth-cookie-policy";
import { resolveAuthSecret } from "./auth-secret";
import { loginUrl } from "@/features/auth/utils/login-route";

export type ServerSessionTokens = {
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: number | null;
  authError: string | null;
};

function authSecret(): string {
  const secret = resolveAuthSecret();
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV !== "production") {
    return "vietsage-dev-session-secret-key-32-chars-long";
  }
  throw new Error("NEXTAUTH_SECRET or AUTH_SECRET is required to read server session tokens");
}

function toSessionTokens(token: JWT | null): ServerSessionTokens {
  return {
    accessToken: typeof token?.accessToken === "string" ? token.accessToken : null,
    refreshToken: typeof token?.refreshToken === "string" ? token.refreshToken : null,
    accessTokenExpiresAt: typeof token?.accessTokenExpiresAt === "number" ? token.accessTokenExpiresAt : null,
    authError: typeof token?.authError === "string" ? token.authError : null,
  };
}

import { cache } from "react";

const readServerSessionTokensCached = cache(async (): Promise<ServerSessionTokens> => {
  return readServerSessionTokensUncached();
});

async function readServerSessionTokensUncached(req?: Request | { headers: Headers }): Promise<ServerSessionTokens> {
  const requestHeaders = req ? req.headers : await headers();
  const cookieHeader = requestHeaders.get("cookie");
  const authHeader = requestHeaders.get("authorization");

  const headersMap: Record<string, string> = {};
  if (cookieHeader) {
    headersMap.cookie = cookieHeader;
  }
  if (authHeader) {
    headersMap.authorization = authHeader;
  }

  const cookiePolicy = resolveSessionCookiePolicy(requestHeaders);
  const token = await getToken({
    req: { headers: headersMap },
    secret: authSecret(),
    ...cookiePolicy,
  }).catch(() => null);

  return toSessionTokens(token);
}

export async function readServerSessionTokens(req?: Request | { headers: Headers }): Promise<ServerSessionTokens> {
  if (!req) {
    return readServerSessionTokensCached();
  }
  return readServerSessionTokensUncached(req);
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

  redirect(loginUrl(callbackUrl));
}
