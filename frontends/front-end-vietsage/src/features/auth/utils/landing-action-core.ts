export type AccountAction = { label: string; href: string };

export type SessionSnapshot = {
  activeRoleCode: string | null;
  canRefresh: boolean;
  authError: string | null;
} | null;

const SIGN_IN_ACTION: AccountAction = { label: "Sign in", href: "/login" };
const GUEST_ACTION: AccountAction = { label: "Open guest experience", href: "/g/home" };

/**
 * Pure decision core — maps a session snapshot to a landing-page CTA.
 *
 * This function has zero external dependencies and is directly testable
 * with Node's built-in test runner.
 *
 * @param session   The session snapshot (null = not authenticated)
 * @param isGuest   Whether the active role maps to the guest app surface
 * @param defaultPath  The resolved homePath for the active role
 */
export function resolveLandingAction(
  session: SessionSnapshot,
  isGuest: boolean,
  defaultPath: string,
): AccountAction {
  if (!session || !session.canRefresh || session.authError || !session.activeRoleCode) {
    return SIGN_IN_ACTION;
  }

  if (isGuest) {
    return GUEST_ACTION;
  }

  return { label: "Go to dashboard", href: defaultPath };
}
