import type { UserRole } from "@/lib/auth";

export const APP_ROLE_PRIORITY: UserRole[] = ["admin", "tenant_owner", "staff", "guest"];

function normalizeRole(raw: string): string {
  return raw.trim().toLowerCase();
}

function isRoleMatch(source: string, expected: UserRole): boolean {
  if (expected === "admin") {
    return source === "admin" || source === "super_admin" || source.endsWith("_admin") || source.endsWith(":admin");
  }

  if (expected === "tenant_owner") {
    return (
      source === "tenant_owner" ||
      source === "hotel_owner" ||
      source.endsWith("_tenant_owner") ||
      source.endsWith(":tenant_owner") ||
      source.endsWith("_hotel_owner") ||
      source.endsWith(":hotel_owner") ||
      source.includes("tenant_owner") ||
      source.includes("hotel_owner")
    );
  }

  if (expected === "staff") {
    return (
      source === "staff" ||
      source === "hotel_manager" ||
      source === "hotel_frontdesk" ||
      source === "receptionist" ||
      source === "housekeeping" ||
      source === "hotel_housekeeping" ||
      source === "maintenance" ||
      source === "hotel_maintenance" ||
      source === "finance" ||
      source === "hotel_finance" ||
      source.endsWith("_staff") ||
      source.endsWith(":staff")
    );
  }

  if (source === expected) {
    return true;
  }

  if (source.endsWith(`_${expected}`) || source.endsWith(`:${expected}`)) {
    return true;
  }

  return source.includes(expected);
}

export function hasAppRole(roles: readonly string[] | null | undefined, expected: UserRole): boolean {
  const normalized = (roles ?? []).map(normalizeRole).filter((value) => value.length > 0);

  if (expected === "guest") {
    return normalized.length === 0 || normalized.some((role) => isRoleMatch(role, expected));
  }

  return normalized.some((role) => isRoleMatch(role, expected));
}

export function getPrimaryAppRole(roles: readonly string[] | null | undefined): UserRole {
  for (const candidate of APP_ROLE_PRIORITY) {
    if (hasAppRole(roles, candidate)) {
      return candidate;
    }
  }

  return "guest";
}

export const mapBackendRolesToUserRole = getPrimaryAppRole;
