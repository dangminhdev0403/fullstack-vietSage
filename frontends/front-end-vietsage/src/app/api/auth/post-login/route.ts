import { type NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { resolveSafeRedirectByRoles, sanitizeInternalCallbackUrl } from "@/lib/rbac";

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

  return NextResponse.redirect(new URL(safePath, request.url), 303);
}
