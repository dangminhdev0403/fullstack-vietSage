import type { NextAuthConfig } from "next-auth";
import type { JWT } from "next-auth/jwt";

import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";

import { AuthServiceError } from "@/features/auth/service/auth-service";
import { authService } from "@/features/auth/service/auth-service-instance";

export type UserRole = "admin" | "tenant_owner" | "staff" | "guest";

type AuthorizedUser = {
  id: string;
  roles: string[];
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
};

type SessionTokenUpdate = {
  accessToken?: unknown;
  refreshToken?: unknown;
  accessTokenExpiresAt?: unknown;
  authError?: unknown;
};

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
});

function toMinimalJwtToken(token: JWT): JWT {
  const minimalToken: JWT = {};

  if (typeof token.sub === "string") {
    minimalToken.sub = token.sub;
  }

  if (typeof token.userId === "string") {
    minimalToken.userId = token.userId;
  }

  if (Array.isArray(token.roles)) {
    minimalToken.roles = token.roles;
  }

  if (typeof token.accessToken === "string") {
    minimalToken.accessToken = token.accessToken;
  }

  if (typeof token.refreshToken === "string") {
    minimalToken.refreshToken = token.refreshToken;
  }

  if (typeof token.accessTokenExpiresAt === "number") {
    minimalToken.accessTokenExpiresAt = token.accessTokenExpiresAt;
  }

  if (typeof token.authError === "string" && token.authError.length > 0) {
    minimalToken.authError = token.authError;
  }

  return minimalToken;
}

function returnJwtToken(token: JWT): JWT {
  return toMinimalJwtToken(token);
}

function applySessionTokenUpdate(token: JWT, update: SessionTokenUpdate): void {
  if (typeof update.accessToken === "string") {
    token.accessToken = update.accessToken;
  }

  if (typeof update.refreshToken === "string") {
    token.refreshToken = update.refreshToken;
  }

  if (typeof update.accessTokenExpiresAt === "number") {
    token.accessTokenExpiresAt = update.accessTokenExpiresAt;
  }

  if (typeof update.authError === "string" && update.authError.length > 0) {
    token.authError = update.authError;
  } else if (update.authError === null || update.authError === undefined) {
    token.authError = undefined;
  }
}

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  logger: {
    error: (message) => console.error("[NEXT_AUTH_ERROR]", message),
    warn: (message) => console.warn("[NEXT_AUTH_WARN]", message),
    debug: (message) => console.debug("[NEXT_AUTH_DEBUG]", message),
  },

  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        try {
          const result = await authService.login({
            email: parsed.data.email.toLowerCase(),
            password: parsed.data.password,
          });

          const user: AuthorizedUser = {
            id: result.identity.id,
            roles: result.identity.roles,
            accessToken: result.tokens.accessToken,
            refreshToken: result.tokens.refreshToken,
            accessTokenExpiresAt: result.tokens.accessTokenExpiresAt,
          };

          return user;
        } catch (error) {
          if (
            error instanceof AuthServiceError &&
            error.code === "INVALID_CREDENTIALS"
          ) {
            return null;
          }

          throw new Error("AUTH_SERVICE_UNAVAILABLE");
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        const authorizedUser = user as AuthorizedUser;

        token.sub = authorizedUser.id;
        token.userId = authorizedUser.id;
        token.roles = authorizedUser.roles;
        token.accessToken = authorizedUser.accessToken;
        token.refreshToken = authorizedUser.refreshToken;
        token.accessTokenExpiresAt = authorizedUser.accessTokenExpiresAt;
        token.authError = undefined;

        return returnJwtToken(token);
      }

      if (trigger === "update" && session && typeof session === "object") {
        applySessionTokenUpdate(token, session as SessionTokenUpdate);

        return returnJwtToken(token);
      }

      return returnJwtToken(token);
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id =
          typeof token.userId === "string" ? token.userId : (token.sub ?? "");
        session.user.roles = Array.isArray(token.roles)
          ? token.roles.filter((role): role is string => typeof role === "string")
          : [];
      }

      session.accessTokenExpiresAt =
        typeof token.accessTokenExpiresAt === "number"
          ? token.accessTokenExpiresAt
          : null;
      session.authError =
        typeof token.authError === "string" ? token.authError : null;
      session.canRefresh =
        typeof token.refreshToken === "string" && token.refreshToken.length > 0;

      return session;
    },
  },
  events: {
    async signOut(message) {
      const token = "token" in message ? message.token : null;
      const accessToken =
        typeof token?.accessToken === "string" ? token.accessToken : null;
      if (!accessToken) {
        return;
      }

      await authService.logout(accessToken);
    },
  },
} satisfies NextAuthConfig;
