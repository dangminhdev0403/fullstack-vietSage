import { getDefaultPathForRoles } from "@/lib/rbac";
import { hasAppRole } from "@/features/auth/utils/auth-role";

import { resolveLandingAction } from "./landing-action-core";
import type { AccountAction, SessionSnapshot } from "./landing-action-core";

export type { AccountAction } from "./landing-action-core";

/**
 * Map a server-side session snapshot to the landing-page CTA action.
 *
 * Orchestrates the external dependencies (rbac, auth-role) and delegates
 * the decision to `resolveLandingAction`.
 *
 * Rules:
 *  - No session / expired / error → Sign in → /login
 *  - Guest session              → Open guest experience → /g/home
 *  - Admin/Owner/Staff session  → Go to dashboard → role's homePath
 */
export function getLandingAction(session: SessionSnapshot): AccountAction {
  if (!session || !session.canRefresh || session.authError || !session.activeRoleCode) {
    return resolveLandingAction(session, false, "");
  }

  const roles = [session.activeRoleCode];
  const isGuest = hasAppRole(roles, "guest");
  const defaultPath = getDefaultPathForRoles(roles);

  return resolveLandingAction(session, isGuest, defaultPath);
}
