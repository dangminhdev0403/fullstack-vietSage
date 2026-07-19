import { type DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      roles: string[];
    };
    activeRoleCode: string | null;
    accessTokenExpiresAt: number | null;
    authError: string | null;
    canRefresh: boolean;
  }

  interface User {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: number;
    roles: string[];
    activeRoleCode: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    roles?: string[];
    activeRoleCode?: string;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpiresAt?: number;
    authError?: string;
  }
}
