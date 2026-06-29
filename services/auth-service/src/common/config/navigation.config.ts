// Centralized frontend navigation mapping derived from RBAC permissions.
// Keep this file as the single source of truth for menu visibility/order rules.
export const DEFAULT_NAVIGATION_MENU = "/dashboard";

export const GLOBAL_MENU_ORDER = [
  "/dashboard",
  "/hotels",
  "/users",
  "/roles",
  "/bookings",
] as const;

export const MENU_PATH_ALIASES: Record<string, string> = {
  "/hotel-users": "/users",
};

export const HIDDEN_NAVIGATION_MENU_PATHS = new Set<string>(["/auth", "/roles/menus"]);
