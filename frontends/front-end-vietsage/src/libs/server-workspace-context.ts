import "server-only";
import { cache } from "react";

import { authService } from "@/features/auth/service/auth-service-instance";
import { AuthServiceError, type AuthIdentity } from "@/features/auth/service/auth-service";
import {
  redirectToLogin,
  requireRefreshableServerSession,
} from "@/libs/server-session-tokens";

export const loadServerWorkspaceContext = cache(
  async function loadServerWorkspaceContext(
    callbackUrl: `/${string}`,
    accessToken?: string | null,
  ): Promise<AuthIdentity> {
    const resolvedAccessToken =
      accessToken ??
      (
        await requireRefreshableServerSession(
          callbackUrl,
          "server-workspace-context",
        )
      ).accessToken;

    if (!resolvedAccessToken) {
      redirectToLogin(callbackUrl, "no_access_token", "server-workspace-context");
    }

    try {
      return await authService.getProfile(resolvedAccessToken);
    } catch (error) {
      if (
        error instanceof AuthServiceError &&
        (error.code === "INVALID_CREDENTIALS" || error.code === "UNAUTHORIZED")
      ) {
        redirectToLogin(callbackUrl, "invalid_credentials", "server-workspace-context");
      }

      throw error;
    }
  }
);
