import {
  GLOBAL_MENU_ORDER,
  HIDDEN_NAVIGATION_MENU_PATHS,
  MENU_PATH_ALIASES,
} from "./navigation.config";

export function resolvePermissionRootPath(path: string): string {
  const segments = path
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return "/";
  }

  if (/^v\d+$/i.test(segments[0]) && segments[1]) {
    return `/${segments[1].toLowerCase()}`;
  }

  return `/${segments[0].toLowerCase()}`;
}

export function mapPermissionRootPathToMenu(rootPath: string): string | null {
  if (rootPath === "/") {
    return null;
  }

  return MENU_PATH_ALIASES[rootPath] ?? rootPath;
}

export function resolvePermissionMenuPath(path: string): string | null {
  if (isHiddenNavigationPath(path)) {
    return null;
  }

  const rootPath = resolvePermissionRootPath(path);
  return mapPermissionRootPathToMenu(rootPath);
}

export function isHiddenNavigationPath(path: string): boolean {
  const normalizedPath = normalizePermissionPathForNavigation(path);

  if (HIDDEN_NAVIGATION_MENU_PATHS.has(normalizedPath)) {
    return true;
  }

  const rootPath = resolvePermissionRootPath(normalizedPath);
  const menuPath = mapPermissionRootPathToMenu(rootPath);

  return menuPath !== null && HIDDEN_NAVIGATION_MENU_PATHS.has(menuPath);
}

export function resolveModuleKeyFromMenuPath(menuPath: string): string {
  const normalized = menuPath.trim().replace(/^\/+/, "");

  if (!normalized) {
    return "root";
  }

  return sanitizeModuleKey(normalized);
}

export function resolveModuleKeyFromPath(path: string): string {
  const rootPath = resolvePermissionRootPath(path);
  const menuPath = mapPermissionRootPathToMenu(rootPath);

  if (!menuPath) {
    return "root";
  }

  return resolveModuleKeyFromMenuPath(menuPath);
}

export function humanizeModuleName(moduleKey: string): string {
  const translatedName = MODULE_NAME_TRANSLATIONS[moduleKey.trim().toLowerCase()];
  if (translatedName) {
    return translatedName;
  }

  return moduleKey
    .split(/[-_.\s]+/)
    .filter((token) => token.length > 0)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

const MODULE_NAME_TRANSLATIONS: Record<string, string> = {
  auth: "Xác thực",
  bookings: "Đặt phòng",
  guest: "Khách lưu trú",
  health: "Kiểm tra hệ thống",
  hotels: "Khách sạn",
  "hotel-users": "Người dùng",
  permissions: "Quyền",
  roles: "Vai trò",
  root: "Hệ thống",
  "tenant-owners": "Chủ đơn vị",
  users: "Người dùng",
};

export function moduleKeyToMenuPath(moduleKey: string): string {
  const normalized = sanitizeModuleKey(moduleKey);

  if (normalized === "root") {
    return "/";
  }

  return `/${normalized}`;
}

export function isHiddenModuleKey(moduleKey: string): boolean {
  const menuPath = moduleKeyToMenuPath(moduleKey);
  return HIDDEN_NAVIGATION_MENU_PATHS.has(menuPath);
}

export function compareModuleKeysByNavigationOrder(moduleKeyA: string, moduleKeyB: string): number {
  const orderByModule = new Map<string, number>(
    GLOBAL_MENU_ORDER.map((menuPath, index) => [resolveModuleKeyFromMenuPath(menuPath), index]),
  );

  const orderA = orderByModule.get(moduleKeyA);
  const orderB = orderByModule.get(moduleKeyB);

  if (orderA !== undefined && orderB !== undefined) {
    return orderA - orderB;
  }

  if (orderA !== undefined) {
    return -1;
  }

  if (orderB !== undefined) {
    return 1;
  }

  return moduleKeyA.localeCompare(moduleKeyB);
}

export function sortMenuPathsByNavigationOrder(menuPaths: string[]): string[] {
  const orderByMenu = new Map<string, number>(
    GLOBAL_MENU_ORDER.map((menuPath, index) => [menuPath, index]),
  );

  return menuPaths.sort((a, b) => {
    const orderA = orderByMenu.get(a);
    const orderB = orderByMenu.get(b);

    if (orderA !== undefined && orderB !== undefined) {
      return orderA - orderB;
    }

    if (orderA !== undefined) {
      return -1;
    }

    if (orderB !== undefined) {
      return 1;
    }

    return a.localeCompare(b);
  });
}

function sanitizeModuleKey(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : "misc";
}

function normalizePermissionPathForNavigation(path: string): string {
  const trimmed = path.trim().toLowerCase();
  const compact = trimmed.replace(/\/+/g, "/");
  const withLeadingSlash = compact.startsWith("/") ? compact : `/${compact}`;

  if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith("/")) {
    return withLeadingSlash.slice(0, -1);
  }

  return withLeadingSlash;
}
