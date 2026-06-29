import "server-only";

import type { Session } from "next-auth";
import { redirect } from "next/navigation";

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

  if (!session.refreshToken) {
    redirectToLogin(callbackUrl, "no_refresh_token");
  }
}

export function getSessionHotelIds(session: Session): string[] {
  void session;
  return [];
}

export function canUseHotelId(session: Session, hotelId: string): boolean {
  void session;
  void hotelId;
  return true;
}
