import { getPrimaryAppRole, hasAppRole } from "@/features/auth/utils/auth-role";
import { type UserRole } from "@/lib/auth";

export type RoutePolicy = {
  prefix: `/${string}`;
  roles: readonly UserRole[];
};

export type RoleDefaultPathMap = Record<UserRole, `/${string}`>;

const LOCAL_ORIGIN = "http://localhost";

const routePolicies: readonly RoutePolicy[] = [
  { prefix: "/admin", roles: ["admin"] },
  { prefix: "/owner", roles: ["tenant_owner"] },
  { prefix: "/staff", roles: ["staff", "admin"] },
  { prefix: "/hotels", roles: ["staff", "admin"] },
  { prefix: "/g", roles: ["guest", "staff", "admin"] },
];

const roleDefaultPaths: RoleDefaultPathMap = {
  admin: "/admin/dashboard",
  tenant_owner: "/owner/dashboard",
  staff: "/staff",
  guest: "/",
};

export function isUserRole(role: unknown): role is UserRole {
  return role === "admin" || role === "tenant_owner" || role === "staff" || role === "guest";
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isKnownRedirectPath(pathname: string): boolean {
  return pathname === "/" || routePolicies.some((policy) => matchesPrefix(pathname, policy.prefix));
}

function normalizeInternalPath(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed) {
    return null;
  }

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return null;
  }

  try {
    const parsed = new URL(trimmed, LOCAL_ORIGIN);
    if (parsed.origin !== LOCAL_ORIGIN) {
      return null;
    }

    if (!parsed.pathname.startsWith("/")) {
      return null;
    }

    parsed.searchParams.delete("callbackUrl");

    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

export function getDefaultPathForRole(role: UserRole): `/${string}` {
  return roleDefaultPaths[role];
}

export function getDefaultPathForRoles(roles: readonly string[] | null | undefined): `/${string}` {
  return getDefaultPathForRole(getPrimaryAppRole(roles));
}

export function canAccessPath(role: UserRole, path: string): boolean {
  return canAccessPathByRoles([role], path);
}

export function canAccessPathByRoles(roles: readonly string[] | null | undefined, path: string): boolean {
  const normalized = normalizeInternalPath(path);
  if (!normalized) {
    return false;
  }

  const pathname = normalized.split("?")[0] ?? normalized;
  const matchedPolicy = routePolicies.find((policy) => matchesPrefix(pathname, policy.prefix));

  if (!matchedPolicy) {
    return true;
  }

  return matchedPolicy.roles.some((role) => hasAppRole(roles, role));
}

export function resolveSafeRedirect(role: UserRole | null | undefined, callbackUrl?: string | null): string {
  return resolveSafeRedirectByRoles(role && isUserRole(role) ? [role] : [], callbackUrl);
}

export function resolveSafeRedirectByRoles(roles: readonly string[] | null | undefined, callbackUrl?: string | null): string {
  const fallbackPath = getDefaultPathForRoles(roles);

  if (!callbackUrl) {
    return fallbackPath;
  }

  const normalizedCallback = normalizeInternalPath(callbackUrl);
  if (!normalizedCallback) {
    return fallbackPath;
  }

  const callbackPathname = normalizedCallback.split("?")[0] ?? normalizedCallback;
  if (!isKnownRedirectPath(callbackPathname)) {
    return fallbackPath;
  }

  return canAccessPathByRoles(roles, normalizedCallback) ? normalizedCallback : fallbackPath;
}

export function sanitizeInternalCallbackUrl(
  callbackUrl: string | null | undefined,
  fallbackPath: `/${string}` = "/admin/dashboard",
): `/${string}` {
  if (!callbackUrl) {
    return fallbackPath;
  }

  const normalizedCallback = normalizeInternalPath(callbackUrl);
  return normalizedCallback ? (normalizedCallback as `/${string}`) : fallbackPath;
}

export { getPrimaryAppRole, hasAppRole };
