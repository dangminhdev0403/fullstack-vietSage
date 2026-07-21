import type { DashboardNavItem } from "../types/workspace-navigation";

export function parseSidebarUrl(rawPath: string) {
  try {
    const parsed = new URL(rawPath, "https://vietsage.local");
    const pathname =
      parsed.pathname.length > 1 && parsed.pathname.endsWith("/")
        ? parsed.pathname.slice(0, -1)
        : parsed.pathname;
    const searchParams = parsed.searchParams;
    const tab = searchParams.get("tab")?.trim().toLowerCase();

    if (pathname === "/admin/dashboard" && tab === "permissions") {
      return { pathname: "/admin/permissions", searchParams: new URLSearchParams() };
    }

    return { pathname, searchParams };
  } catch {
    return { pathname: rawPath, searchParams: new URLSearchParams() };
  }
}

export function isNavItemActive(
  itemHref: string,
  activePath: string,
  allItems: readonly DashboardNavItem[] = []
): boolean {
  const item = parseSidebarUrl(itemHref);
  const active = parseSidebarUrl(activePath);

  if (item.pathname === active.pathname) {
    const itemParamEntries = Array.from(item.searchParams.entries());
    if (itemParamEntries.length > 0) {
      return itemParamEntries.every(
        ([key, val]) => active.searchParams.get(key) === val
      );
    }

    const hasSpecificMatchInItems = allItems.some((other) => {
      if (other.href === itemHref) return false;
      const otherParsed = parseSidebarUrl(other.href);
      if (otherParsed.pathname !== active.pathname) return false;
      const otherParamEntries = Array.from(otherParsed.searchParams.entries());
      if (otherParamEntries.length === 0) return false;
      return otherParamEntries.every(
        ([key, val]) => active.searchParams.get(key) === val
      );
    });

    return !hasSpecificMatchInItems;
  }

  if (Array.from(item.searchParams.keys()).length > 0) {
    return false;
  }

  if (active.pathname.startsWith(`${item.pathname}/`)) {
    const hasMoreSpecificMatch = allItems.some((other) => {
      if (other.href === itemHref) return false;
      const otherParsed = parseSidebarUrl(other.href);
      if (Array.from(otherParsed.searchParams.keys()).length > 0) return false;
      return (
        otherParsed.pathname.length > item.pathname.length &&
        (active.pathname === otherParsed.pathname ||
          active.pathname.startsWith(`${otherParsed.pathname}/`))
      );
    });

    return !hasMoreSpecificMatch;
  }

  return false;
}
