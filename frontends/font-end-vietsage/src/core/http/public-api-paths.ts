import type { paths as BackendApiPaths } from "@/generated/openapi/v1";

type BackendApiPath = keyof BackendApiPaths;

export const PUBLIC_API_PATH_ALLOWLIST = [
  "/health",
  "/auth/login",
  "/auth/refresh",
  "/auth/logout",
] as const satisfies readonly BackendApiPath[];

const PUBLIC_API_PATH_ALLOWLIST_SET = new Set<string>(PUBLIC_API_PATH_ALLOWLIST);

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

export function isPublicApiPath(pathname: string): boolean {
  const normalizedPath = normalizePathname(pathname);

  if (PUBLIC_API_PATH_ALLOWLIST_SET.has(normalizedPath)) {
    return true;
  }

  return normalizedPath.startsWith("/public/");
}
