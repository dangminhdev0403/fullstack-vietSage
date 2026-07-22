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

export type PostLoginRedirectUrlInput = {
  path: string;
  requestUrl: string;
  configuredUrl?: string | null;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
};

function firstForwardedValue(value?: string | null): string {
  return value?.split(",", 1)[0]?.trim() ?? "";
}

function resolveForwardedOrigin(hostValue?: string | null, protoValue?: string | null): string | null {
  const host = firstForwardedValue(hostValue);
  const protocol = firstForwardedValue(protoValue).toLowerCase();

  if (!host || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) return null;
  if (protocol !== "http" && protocol !== "https") return null;

  return `${protocol}://${host}`;
}

export function resolvePostLoginRedirectUrl({
  path,
  requestUrl,
  configuredUrl,
  forwardedHost,
  forwardedProto,
}: PostLoginRedirectUrlInput): string {
  const configuredOrigin = configuredUrl?.trim();
  const forwardedOrigin = resolveForwardedOrigin(forwardedHost, forwardedProto);
  const fallbackOrigin = new URL(requestUrl).origin;
  const origin = configuredOrigin || forwardedOrigin || fallbackOrigin;

  return new URL(path, origin).toString();
}

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
