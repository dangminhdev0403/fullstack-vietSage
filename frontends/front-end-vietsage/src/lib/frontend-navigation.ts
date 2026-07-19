import { HttpError } from "@/core/http/http-error";
import { getPrimaryAppRole } from "@/features/auth/utils/auth-role";
import type { UserRole } from "@/lib/auth";
import { getCurrentRoleMenus } from "@/lib/role-menus";

export type DashboardNavItem = {
  key: string;
  label: string;
  href: `/${string}`;
  icon: string;
};

type ResolveDashboardNavigationOptions = {
  userRole?: UserRole;
  roles?: readonly string[] | null;
  assignedRoles?: string[];
  permissions?: string[];
  accessToken?: string | null;
  accessTokenExpiresAt?: number | null;
  refreshToken?: string | null;
  authError?: string | null;
  rolesPayload?: unknown;
  roleMenus?: string[];
};

const NAV_ALLOWED_PREFIXES = [
  "/admin",
  "/owner",
  "/staff",
  "/g",
  "/hotels",
  "/hotel-users",
] as const;
const ACTIVE_ADMIN_NAV_HREFS = new Set<string>([
  "/admin/dashboard",
  "/admin/hotels",
  "/admin/users",
  "/admin/roles",
]);
const NAV_DEBUG_ENABLED = process.env.NODE_ENV !== "production";

function debugLog(event: string, payload: unknown): void {
  if (!NAV_DEBUG_ENABLED) {
    return;
  }

  console.info(`[RBAC_NAV] ${event}`, payload);
}

function normalizePath(path: string): `/${string}` | null {
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  if (/[[\]{}:]/.test(trimmed)) {
    return null;
  }

  const withoutTrailingSlash =
    trimmed.length > 1 ? trimmed.replace(/\/+$/, "") : trimmed;
  if (!withoutTrailingSlash.startsWith("/")) {
    return null;
  }

  if (
    !NAV_ALLOWED_PREFIXES.some(
      (prefix) =>
        withoutTrailingSlash === prefix ||
        withoutTrailingSlash.startsWith(`${prefix}/`),
    )
  ) {
    return null;
  }

  return withoutTrailingSlash as `/${string}`;
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === "qr") {
        return "QR";
      }

      return `${lower[0]?.toUpperCase() ?? ""}${lower.slice(1)}`;
    })
    .join(" ");
}

function labelFromMenuEntry(entry: string): string {
  const slug = entry
    .trim()
    .replace(/^\/+/, "")
    .split(/[/?#]/)[0]
    ?.replace(/[-_]/g, " ")
    .trim();

  if (!slug) {
    return "Mục";
  }

  return toTitleCase(slug);
}

function iconFromPath(path: string): string {
  const lowerPath = path.toLowerCase();

  if (lowerPath.includes("dashboard")) {
    return "dashboard";
  }

  if (lowerPath.includes("room")) {
    return "bed";
  }

  if (lowerPath.includes("stay")) {
    return "hotel";
  }

  if (lowerPath.includes("qr")) {
    return "qr_code";
  }

  if (lowerPath.includes("service")) {
    return "concierge";
  }

  if (lowerPath.includes("staff") || lowerPath.includes("user")) {
    return "group";
  }

  if (lowerPath.includes("setting")) {
    return "settings";
  }

  if (lowerPath.includes("role") || lowerPath.includes("permission")) {
    return "verified_user";
  }

  return "menu";
}

function getRoleRootPath(userRole: UserRole): "/admin" | "/owner" | "/staff" | "/g" {
  if (userRole === "admin") {
    return "/admin";
  }

  if (userRole === "tenant_owner") {
    return "/owner";
  }

  if (userRole === "staff") {
    return "/staff";
  }

  return "/g";
}

function resolveMenuEntryToHref(
  entry: string,
  userRole: UserRole,
): `/${string}` | null {
  const direct = normalizePath(entry);
  if (direct) {
    if (userRole === "tenant_owner" && direct === "/hotels") {
      return "/owner/hotels";
    }

    return direct;
  }

  const slug = entry
    .trim()
    .replace(/^\/+/, "")
    .split(/[/?#]/)[0]
    ?.trim()
    .toLowerCase();

  if (!slug) {
    return null;
  }

  if (userRole === "admin" && slug === "codes") {
    return null;
  }

  const roleRoot = getRoleRootPath(userRole);
  if (userRole === "guest" && (slug === "dashboard" || slug === "welcome" || slug === "services")) {
    return "/g/services";
  }

  if (userRole === "guest" && (slug === "tracking" || slug === "requests" || slug === "request-detail")) {
    return "/g/requests";
  }

  if (userRole === "guest") {
    return "/g/services";
  }

  if (
    slug === "dashboard" ||
    (userRole === "tenant_owner" && slug === "owner")
  ) {
    return `${roleRoot}/dashboard`;
  }

  if (userRole === "admin" && slug === "users") {
    return "/admin/users";
  }

  if (userRole === "admin" && slug === "hotels") {
    return "/admin/hotels";
  }

  if (userRole === "tenant_owner" && slug === "hotels") {
    return "/owner/hotels";
  }

  if (userRole === "tenant_owner" && (slug === "rooms" || slug === "room")) {
    return "/owner/rooms";
  }

  if (slug === "welcome") {
    return "/g/services";
  }

  if (slug === "services") {
    return "/g/services";
  }

  if (slug === "tracking") {
    return "/g/requests";
  }

  if (slug === "request-detail") {
    return "/g/requests";
  }

  const safeSlug = encodeURIComponent(slug);
  return `${roleRoot}/dashboard?tab=${safeSlug}`;
}

function canonicalizeAdminTabHref(href: `/${string}`): `/${string}` {
  try {
    const parsed = new URL(href, "https://vietsage.local");
    const tab = parsed.searchParams.get("tab")?.trim().toLowerCase();

    if (parsed.pathname === "/admin/dashboard" && tab === "codes") {
      return "/admin/dashboard";
    }

    if (
      parsed.pathname === "/admin/dashboard" &&
      (tab === "permissions" || tab === "roles")
    ) {
      return "/admin/roles";
    }

    if (parsed.pathname === "/admin/permissions") {
      return "/admin/roles";
    }

    if (parsed.pathname === "/hotel-users") {
      return "/admin/users";
    }

    if (parsed.pathname === "/hotels") {
      return "/admin/hotels";
    }

    const normalized = `${parsed.pathname}${parsed.search}`;
    return normalized as `/${string}`;
  } catch {
    return href;
  }
}

function isActiveAdminNavHref(href: `/${string}`): boolean {
  return ACTIVE_ADMIN_NAV_HREFS.has(canonicalizeAdminTabHref(href));
}

function sortNavigation(items: DashboardNavItem[]): DashboardNavItem[] {
  const withPriority = [...items];

  withPriority.sort((first, second) => {
    const firstPath = first.href.toLowerCase();
    const secondPath = second.href.toLowerCase();

    if (firstPath === "/admin/roles" && secondPath !== "/admin/roles") {
      return 1;
    }

    if (firstPath !== "/admin/roles" && secondPath === "/admin/roles") {
      return -1;
    }

    if (
      firstPath.endsWith("/dashboard") &&
      !secondPath.endsWith("/dashboard")
    ) {
      return -1;
    }

    if (
      !firstPath.endsWith("/dashboard") &&
      secondPath.endsWith("/dashboard")
    ) {
      return 1;
    }

    return first.label.localeCompare(second.label, "en", {
      sensitivity: "base",
    });
  });

  return withPriority;
}

function dedupeByPath(items: readonly DashboardNavItem[]): DashboardNavItem[] {
  const byPath = new Map<string, DashboardNavItem>();

  for (const item of items) {
    const normalizedHref = canonicalizeAdminTabHref(item.href);
    const isRolesNav = normalizedHref === "/admin/roles";
    const isUsersNav = normalizedHref === "/admin/users";
    const isHotelsNav = normalizedHref === "/admin/hotels";
    const isOwnerDashboardNav = normalizedHref === "/owner/dashboard";
    const isOwnerHotelsNav = normalizedHref === "/owner/hotels";
    const isOwnerRoomsNav = normalizedHref === "/owner/rooms";
    const normalizedItem: DashboardNavItem = {
      ...item,
      key: normalizedHref,
      href: normalizedHref,
      label: isRolesNav
        ? "Phân quyền"
        : isUsersNav
          ? "Người dùng"
          : isHotelsNav
            ? "Khách sạn"
            : isOwnerDashboardNav
              ? "Tổng quan"
              : isOwnerHotelsNav
                ? "Khách sạn"
                : item.label,
      icon: isRolesNav
        ? "verified_user"
        : isUsersNav
          ? "group"
          : isHotelsNav
            ? "hotel"
            : isOwnerDashboardNav
              ? "dashboard"
              : isOwnerHotelsNav
                ? "hotel"
                : item.icon,
    };

    if (isUsersNav) {
      normalizedItem.label = "Quản lý chủ sở hữu";
    }

    if (isOwnerRoomsNav) {
      normalizedItem.label = "Phòng";
      normalizedItem.icon = "bed";
    }

    if (!byPath.has(normalizedHref)) {
      byPath.set(normalizedHref, normalizedItem);
    }
  }

  return sortNavigation([...byPath.values()]);
}

function buildFromMenuEntries(
  menuEntries: readonly string[],
  userRole: UserRole,
): DashboardNavItem[] {
  const items: DashboardNavItem[] = [];

  for (const menuEntry of menuEntries) {
    const normalizedEntry = menuEntry.trim().replace(/^\/+/, "").toLowerCase();
    if (
      userRole === "admin" &&
      (normalizedEntry === "codes" ||
        normalizedEntry === "admin/dashboard?tab=codes" ||
        normalizedEntry === "admin/codes" ||
        normalizedEntry === "tenant-owners" ||
        normalizedEntry === "admin/dashboard?tab=tenant-owners")
    ) {
      continue;
    }

    const href = resolveMenuEntryToHref(menuEntry, userRole);
    if (!href || (userRole === "admin" && !isActiveAdminNavHref(href))) {
      continue;
    }

    items.push({
      key: href,
      href,
      label: labelFromMenuEntry(menuEntry),
      icon: iconFromPath(href),
    });
  }

  return dedupeByPath(items);
}

async function fetchRoleMenusForNavigation(options: {
  accessToken?: string | null;
  refreshToken?: string | null;
  authError?: string | null;
}): Promise<string[]> {
  if (options.authError) {
    debugLog("role_menus_skipped_auth_error", { authError: options.authError });
    return [];
  }

  if (!options.refreshToken) {
    debugLog("role_menus_skipped_no_refresh_token", {});
    return [];
  }

  if (!options.accessToken) {
    debugLog("role_menus_skipped_no_access_token", {});
    return [];
  }

  return getCurrentRoleMenus({
    accessToken: options.accessToken,
    refreshToken: options.refreshToken,
  });
}

export async function resolveDashboardNavigation(
  options: ResolveDashboardNavigationOptions,
): Promise<DashboardNavItem[]> {
  const userRole = options.userRole ?? getPrimaryAppRole(options.roles);

  try {
    const roleMenus =
      options.roleMenus ??
      (await fetchRoleMenusForNavigation({
        accessToken: options.accessToken,
        refreshToken: options.refreshToken,
        authError: options.authError,
      }));

    debugLog("role_menus_response", roleMenus);

    const menuFromRoleMenus = buildFromMenuEntries(roleMenus, userRole);
    if (menuFromRoleMenus.length > 0) {
      debugLog("menu_from_role_menus", menuFromRoleMenus);
      return menuFromRoleMenus;
    }

    debugLog("role_menus_generated_empty_menu", {
      userRole,
    });
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      debugLog("role_menus_unauthorized", error);
      return [];
    }

    debugLog("role_menus_request_failed", error);
    throw error;
  }

  return [];
}
