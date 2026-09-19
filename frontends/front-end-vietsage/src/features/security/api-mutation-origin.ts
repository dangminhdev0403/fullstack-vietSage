type ApiMutationRequest = Pick<Request, "headers" | "method" | "url">;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const SESSION_COOKIE_PREFIXES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "__Host-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "__Host-next-auth.session-token",
] as const;

function hasSessionCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;

  return cookieHeader.split(";").some((entry) => {
    const name = entry.split("=", 1)[0]?.trim();
    return SESSION_COOKIE_PREFIXES.some(
      (prefix) => name === prefix || name?.startsWith(`${prefix}.`),
    );
  });
}

export function isAllowedApiMutationRequest(request: ApiMutationRequest): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return true;
  if (!hasSessionCookie(request.headers.get("cookie"))) return true;

  const site = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (site && site !== "same-origin" && site !== "none") return false;

  const suppliedOrigin = request.headers.get("origin");
  if (!suppliedOrigin) return false;

  try {
    return new URL(suppliedOrigin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
