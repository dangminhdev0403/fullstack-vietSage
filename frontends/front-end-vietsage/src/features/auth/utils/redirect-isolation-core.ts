/**
 * Pure redirect-isolation decision logic.
 *
 * Zero external dependencies — directly testable with Node's built-in test runner.
 * The production caller in the post-login route injects the real rbac functions.
 */

export type PostLoginRedirectInput = {
  activeRoleCode: string | null;
  callbackUrl: string | null;
  canAccess: (roles: readonly string[], path: string) => boolean;
  getDefaultPath: (roles: readonly string[]) => string;
};

export type PostLoginRedirectUrlInput = {
  path: string;
  requestUrl: string;
  configuredUrl?: string | null;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
};

function firstForwardedValue(value?: string | null): string {
  return value?.split(",", 1)[0]?.trim() ?? "";
}

function resolveForwardedOrigin(hostValue?: string | null, protoValue?: string | null): string | null {
  const host = firstForwardedValue(hostValue);
  let protocol = firstForwardedValue(protoValue).toLowerCase();

  if (!host || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) return null;
  if (isLocalHost(host.split(":")[0] ?? "")) return null;

  if (protocol !== "http" && protocol !== "https") {
    protocol = "http";
  }

  return `${protocol}://${host}`;
}

function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "0.0.0.0" ||
    h === "[::1]" ||
    h === "::1" ||
    h.startsWith("0.0.0.0:") ||
    h.startsWith("127.0.0.1:")
  );
}

function parseOrigin(rawUrl?: string | null): { origin: string; isLocal: boolean } | null {
  if (!rawUrl?.trim()) return null;
  try {
    const url = new URL(rawUrl.trim());
    let origin = url.origin;
    if (origin.includes("0.0.0.0")) {
      origin = origin.replace("0.0.0.0", "127.0.0.1");
    }
    return { origin, isLocal: isLocalHost(url.hostname) };
  } catch {
    return null;
  }
}

export function resolvePostLoginRedirectUrl({
  path,
  requestUrl,
  configuredUrl,
  forwardedHost,
  forwardedProto,
}: PostLoginRedirectUrlInput): string {
  const configured = parseOrigin(configuredUrl);
  const forwardedOrigin = resolveForwardedOrigin(forwardedHost, forwardedProto);

  let fallbackOrigin = "http://127.0.0.1:3000";
  try {
    const rawOrigin = new URL(requestUrl).origin;
    if (rawOrigin.includes("0.0.0.0")) {
      fallbackOrigin = rawOrigin.replace("0.0.0.0", "127.0.0.1");
    } else {
      fallbackOrigin = rawOrigin;
    }
  } catch {
    // Keep default fallback
  }

  const trusted = configured && !configured.isLocal ? new URL(configured.origin) : null;
  const requestHost = new URL(fallbackOrigin).hostname;
  const vietsageHosts = new Set(["vietsage.com", "www.vietsage.com", "stay.vietsage.com"]);

  const isPortlessHost = (h: string) =>
    h === "vietsage.localhost" || h.endsWith(".localhost") || h.endsWith(".ts.net");

  const isConfiguredPortlessHost = (h: string) => {
    const portlessUrl = parseOrigin(process.env.PORTLESS_URL);
    if (portlessUrl && new URL(portlessUrl.origin).hostname.toLowerCase() === h) return true;
    const tailscaleUrl = parseOrigin(process.env.PORTLESS_TAILSCALE_URL);
    if (tailscaleUrl && new URL(tailscaleUrl.origin).hostname.toLowerCase() === h) return true;
    return false;
  };

  const isAllowedAppHost = (h: string) =>
    vietsageHosts.has(h) || isPortlessHost(h) || isConfiguredPortlessHost(h);

  let origin = trusted?.origin ?? (isLocalHost(requestHost) ? fallbackOrigin : "http://127.0.0.1:3000");
  if (vietsageHosts.has(requestHost)) {
    // The public request host owns the Auth.js cookie; never downgrade or switch hosts.
    origin = `https://${requestHost}`;
  } else if (forwardedOrigin) {
    const forwarded = new URL(forwardedOrigin);
    if (isAllowedAppHost(forwarded.hostname) && (!trusted || isAllowedAppHost(trusted.hostname))) {
      origin = vietsageHosts.has(forwarded.hostname)
        ? `https://${forwarded.hostname}`
        : `${forwarded.protocol}//${forwarded.host}`;
    } else if (trusted && forwarded.host === trusted.host) {
      origin = trusted.origin;
    }
  }

  if (origin.includes("0.0.0.0")) {
    origin = origin.replace("0.0.0.0", "127.0.0.1");
  }

  return new URL(path, origin).toString();
}

export function createRequestRedirectUrl(
  path: string,
  request: { url: string; headers: { get(name: string): string | null } },
): URL {
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const portlessUrl = parseOrigin(process.env.PORTLESS_URL);
  const portlessTailscaleUrl = parseOrigin(process.env.PORTLESS_TAILSCALE_URL);
  const forwardedOrigin = resolveForwardedOrigin(forwardedHost, forwardedProto);
  const configuredUrl =
    portlessUrl && forwardedOrigin === portlessUrl.origin
      ? portlessUrl.origin
      : portlessTailscaleUrl && forwardedOrigin === portlessTailscaleUrl.origin
      ? portlessTailscaleUrl.origin
      : process.env.NEXTAUTH_URL ?? process.env.AUTH_URL;
  const redirectUrlString = resolvePostLoginRedirectUrl({
    path,
    requestUrl: request.url,
    configuredUrl,
    forwardedHost,
    forwardedProto,
  });

  return new URL(redirectUrlString);
}

/**
 * Decide the redirect destination after a successful login.
 *
 * Rules:
 *  1. No activeRoleCode → getDefaultPath([]) (guest fallback)
 *  2. callbackUrl is null/empty → getDefaultPath([activeRoleCode])
 *  3. callbackUrl is accessible by the new role → callbackUrl
 *  4. callbackUrl is NOT accessible → getDefaultPath([activeRoleCode])
 */
export function resolvePostLoginRedirect({
  activeRoleCode,
  callbackUrl,
  canAccess,
  getDefaultPath,
}: PostLoginRedirectInput): string {
  const roles = activeRoleCode ? [activeRoleCode] : [];

  if (!callbackUrl || callbackUrl.trim().length === 0) {
    return getDefaultPath(roles);
  }

  if (!canAccess(roles, callbackUrl)) {
    return getDefaultPath(roles);
  }

  return callbackUrl;
}
