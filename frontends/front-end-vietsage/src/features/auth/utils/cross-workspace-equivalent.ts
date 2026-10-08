export function resolveTenantOwnerKbttEquivalent(
  path: string,
): `/${string}` | null {
  const [pathname, query = ""] = path.split("?");
  const match = pathname?.match(/^\/hotels\/([^/]+)\/kbtt\/?$/);
  if (!match) return null;
  return `/owner/hotels/${match[1]}/kbtt${query ? `?${query}` : ""}`;
}

export function resolveAdminBillingEquivalent(
  path: string,
): `/${string}` | null {
  const [pathname, queryString] = path.split("?");
  if (!pathname || (!pathname.startsWith("/finance") && pathname !== "/finance")) {
    return null;
  }
  const searchParams = new URLSearchParams(queryString ?? "");
  if (pathname === "/finance/finalize" || pathname === "/finance/finalize/") {
    searchParams.set("tab", "finalize");
  } else if (pathname === "/finance/contracts" || pathname === "/finance/contracts/") {
    searchParams.set("tab", "contracts");
  } else if (pathname === "/finance/localmate" || pathname === "/finance/localmate/") {
    searchParams.set("tab", "localmate");
  }
  const qs = searchParams.toString();
  return `/admin/billing${qs ? `?${qs}` : ""}`;
}

export function resolveFinanceBillingEquivalent(
  path: string,
): `/${string}` | null {
  const [pathname, queryString] = path.split("?");
  if (!pathname || (!pathname.startsWith("/admin/billing") && pathname !== "/admin/billing")) {
    return null;
  }
  const searchParams = new URLSearchParams(queryString ?? "");
  const tab = searchParams.get("tab");
  searchParams.delete("tab");
  const qs = searchParams.toString();
  const targetBase =
    tab === "finalize"
      ? "/finance/finalize"
      : tab === "contracts"
        ? "/finance/contracts"
        : "/finance/billing";
  return `${targetBase}${qs ? `?${qs}` : ""}`;
}

