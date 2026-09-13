export function resolveTenantOwnerKbttEquivalent(
  path: string,
): `/${string}` | null {
  const [pathname, query = ""] = path.split("?");
  const match = pathname?.match(/^\/hotels\/([^/]+)\/kbtt\/?$/);
  if (!match) return null;
  return `/owner/hotels/${match[1]}/kbtt${query ? `?${query}` : ""}`;
}
