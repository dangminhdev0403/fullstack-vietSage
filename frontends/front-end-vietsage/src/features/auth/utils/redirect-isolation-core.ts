/**
 * Pure redirect-isolation decision logic.
 *
 * Zero external dependencies — directly testable with Node's built-in test runner.
 * The production caller in the post-login route injects the real rbac functions.
 */

export type PostLoginRedirectInput = {
  activeRoleCode: string | null;
  callbackUrl: string | null;
  canAccess: (roles: readonly string[], path: string) => boolean;
  getDefaultPath: (roles: readonly string[]) => string;
};

/**
 * Decide the redirect destination after a successful login.
 *
 * Rules:
 *  1. No activeRoleCode → getDefaultPath([]) (guest fallback)
 *  2. callbackUrl is null/empty → getDefaultPath([activeRoleCode])
 *  3. callbackUrl is accessible by the new role → callbackUrl
 *  4. callbackUrl is NOT accessible → getDefaultPath([activeRoleCode])
 */
export function resolvePostLoginRedirect({
  activeRoleCode,
  callbackUrl,
  canAccess,
  getDefaultPath,
}: PostLoginRedirectInput): string {
  const roles = activeRoleCode ? [activeRoleCode] : [];

  if (!callbackUrl || callbackUrl.trim().length === 0) {
    return getDefaultPath(roles);
  }

  if (!canAccess(roles, callbackUrl)) {
    return getDefaultPath(roles);
  }

  return callbackUrl;
}
