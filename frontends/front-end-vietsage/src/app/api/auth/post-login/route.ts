import { type NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { resolvePostLoginRedirectUrl } from "@/features/auth/utils/redirect-isolation-core";
import { resolveSafeRedirectByRoles, sanitizeInternalCallbackUrl } from "@/libs/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/post-login?callbackUrl=...
 *
 * Server-side continuation point after successful signIn().
 * Reads the FRESH session cookie (not a client-polled session) and
 * re-evaluates the callback against the new active role.
 *
 * If the callback is inaccessible to the new role, redirects to the
 * role's homePath instead. This prevents cross-workspace 404s when
 * a stale callback from a previous account/role persists.
 *
 * Returns a 303 See Other to prevent POST replay on refresh.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  const rawCallbackUrl = request.nextUrl.searchParams.get("callbackUrl");
  const callbackUrl = rawCallbackUrl
    ? sanitizeInternalCallbackUrl(rawCallbackUrl)
    : null;

  const roles = session?.activeRoleCode ? [session.activeRoleCode] : [];
  const safePath = resolveSafeRedirectByRoles(roles, callbackUrl);

  console.info("[POST_LOGIN_REDIRECT]", {
    activeRoleCode: session?.activeRoleCode ?? null,
    callbackUrl: callbackUrl ?? null,
    resolvedPath: safePath,
    timestamp: Date.now(),
  });

  const redirectUrl = resolvePostLoginRedirectUrl({
    path: safePath,
    requestUrl: request.url,
    configuredUrl: process.env.NEXTAUTH_URL ?? process.env.AUTH_URL,
    forwardedHost: request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
    forwardedProto: request.headers.get("x-forwarded-proto"),
  });

  return NextResponse.redirect(redirectUrl, 303);
}
