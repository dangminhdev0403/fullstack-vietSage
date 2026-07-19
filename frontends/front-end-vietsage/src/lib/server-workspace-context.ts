import "server-only";

import { authService } from "@/features/auth/service/auth-service-instance";
import type { AuthIdentity } from "@/features/auth/service/auth-service";
import {
  redirectToLogin,
  requireRefreshableServerSession,
} from "@/lib/server-session-tokens";

export async function loadServerWorkspaceContext(
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

  return authService.getProfile(resolvedAccessToken);
}
