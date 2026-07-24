import "server-only";

import type { Session } from "next-auth";
import { redirect } from "next/navigation";

import type { AuthIdentity } from "@/features/auth/service/auth-service";
import { canAccessHotelScope } from "@/features/workspace/utils/workspace-context";
import { requireRefreshableServerSession } from "@/libs/server-session-tokens";

export async function requireHotelOpsServerTokens(callbackUrl: `/${string}`) {
  return requireRefreshableServerSession(callbackUrl, "hotel-route-auth");
}

function redirectToLogin(callbackUrl: `/${string}`, reason: string): never {
  console.info("[AUTH_REDIRECT_LOGIN_SOURCE]", {
    source: "hotel-route-auth",
    reason,
    pathname: callbackUrl,
  });

  redirect(`/login?reauth=1&callbackUrl=${encodeURIComponent(callbackUrl)}`);
}

export function assertCanAccessHotelOps(session: Session | null, callbackUrl: `/${string}`): asserts session is Session {
  if (!session?.user) {
    redirectToLogin(callbackUrl, "no_session");
  }

  if (session.authError) {
    redirectToLogin(callbackUrl, "auth_error");
  }

}

export function canUseHotelId(
  context: Pick<AuthIdentity, "permissions" | "accessibleHotels">,
  hotelId: string,
): boolean {
  return canAccessHotelScope(context, hotelId);
}
