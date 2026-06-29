import { type NextRequest, NextResponse } from "next/server";

import { auth } from "./auth";
import { getDefaultPathForRoles } from "./lib/rbac";

const protectedPrefixes = ["/admin", "/owner", "/staff", "/hotels"] as const;
const authRoutes = new Set(["/login", "/register"]);
const nextAuthCookiePrefixes = ["next-auth.", "__Secure-next-auth.", "__Host-next-auth."] as const;
const REFRESH_SESSION_EARLY_MS = 10_000;

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isForcedReauth(request: NextRequest): boolean {
  return request.nextUrl.searchParams.get("reauth") === "1";
}

function isNextAuthCookie(cookieName: string): boolean {
  return nextAuthCookiePrefixes.some((prefix) => cookieName.startsWith(prefix));
}

function clearNextAuthCookies(request: NextRequest, response: NextResponse): NextResponse {
  const nextAuthCookieNames = request.cookies
    .getAll()
    .map((cookie) => cookie.name)
    .filter((cookieName) => isNextAuthCookie(cookieName));

  for (const cookieName of nextAuthCookieNames) {
    const requiresSecureFlag = cookieName.startsWith("__Secure-") || cookieName.startsWith("__Host-");

    response.cookies.set({
      name: cookieName,
      value: "",
      path: "/",
      maxAge: 0,
      expires: new Date(0),
      secure: requiresSecureFlag,
    });
  }

  return response;
}

function buildLoginRedirect(request: NextRequest): NextResponse {
  const loginUrl = new URL("/login", request.url);
  const callbackSource = request.nextUrl.clone();

  // Prevent callbackUrl nesting growth when a protected URL already carries callbackUrl
  callbackSource.searchParams.delete("callbackUrl");

  const callbackUrl = `${callbackSource.pathname}${callbackSource.search}`;

  loginUrl.searchParams.set("callbackUrl", callbackUrl);
  loginUrl.searchParams.set("reauth", "1");

  return clearNextAuthCookies(request, NextResponse.redirect(loginUrl));
}

function getStringTokenField(token: unknown, field: string): string | null {
  if (!token || typeof token !== "object" || Array.isArray(token)) {
    return null;
  }

  const value = (token as Record<string, unknown>)[field];

  return typeof value === "string" && value.length > 0 ? value : null;
}

function getNumberTokenField(token: unknown, field: string): number | null {
  if (!token || typeof token !== "object" || Array.isArray(token)) {
    return null;
  }

  const value = (token as Record<string, unknown>)[field];

  return typeof value === "number" ? value : null;
}

function getStringArrayTokenField(token: unknown, field: string): string[] {
  if (!token || typeof token !== "object" || Array.isArray(token)) {
    return [];
  }

  const value = (token as Record<string, unknown>)[field];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function buildRefreshSessionRedirect(request: NextRequest): NextResponse {
  const refreshUrl = new URL("/api/auth/refresh-session", request.url);
  const callbackSource = request.nextUrl.clone();

  callbackSource.searchParams.delete("callbackUrl");
  refreshUrl.searchParams.set("callbackUrl", `${callbackSource.pathname}${callbackSource.search}`);

  return NextResponse.redirect(refreshUrl);
}

export const proxy = auth((request) => {
  const { pathname } = request.nextUrl;
  const isProtectedRoute = protectedPrefixes.some((prefix) => matchesPrefix(pathname, prefix));
  const isAuthRoute = authRoutes.has(pathname);

  if (!isProtectedRoute && !isAuthRoute) {
    return NextResponse.next();
  }

  if (isAuthRoute && isForcedReauth(request)) {
    return clearNextAuthCookies(request, NextResponse.next());
  }

  const session = request.auth;

  if (isProtectedRoute && !session) {
    console.info("[AUTH_PROXY_REDIRECT_NO_SESSION]", { pathname });
    return buildLoginRedirect(request);
  }

  const authError = session ? getStringTokenField(session, "authError") : null;
  const refreshToken = session ? getStringTokenField(session, "refreshToken") : null;
  const accessTokenExpiresAt = session ? getNumberTokenField(session, "accessTokenExpiresAt") : null;

  if (isProtectedRoute && authError) {
    console.info("[AUTH_PROXY_REDIRECT_AUTH_ERROR]", { pathname, authError });
    return buildLoginRedirect(request);
  }

  if (isProtectedRoute && !refreshToken) {
    console.info("[AUTH_PROXY_REDIRECT_NO_REFRESH_TOKEN]", { pathname });
    return buildLoginRedirect(request);
  }

  if (
    isProtectedRoute &&
    typeof accessTokenExpiresAt === "number" &&
    accessTokenExpiresAt <= Date.now() + REFRESH_SESSION_EARLY_MS
  ) {
    console.info("[AUTH_REFRESH_GATE_START]", {
      source: "proxy",
      pathname,
      accessTokenExpiresAt,
      timestamp: Date.now(),
    });

    return buildRefreshSessionRedirect(request);
  }

  if (isProtectedRoute) {
    console.info("[AUTH_PROXY_ALLOW_REFRESHABLE_SESSION]", { pathname });
  }

  if (isAuthRoute && session && !authError && refreshToken) {
    const redirectUrl = new URL(getDefaultPathForRoles(getStringArrayTokenField(session, "roles")), request.url);

    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
