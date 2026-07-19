import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import { type ReactNode } from "react";

import { AuthRefreshGate } from "../_components/auth-refresh-gate";
import { OwnerRequestRealtimeNotifier } from "../owner/_components/owner-request-realtime-notifier";
import { hasAppRole } from "@/lib/rbac";
import { requireRefreshableServerSession } from "@/lib/server-session-tokens";

function redirectToLogin(reason: string): never {
  console.info("[AUTH_REDIRECT_LOGIN_SOURCE]", {
    source: "hotels-layout",
    reason,
    pathname: "/hotels",
  });

  redirect("/login?reauth=1&callbackUrl=/hotels");
}

export default async function HotelsLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirectToLogin("no_session");
  }

  if (session.authError) {
    redirectToLogin("auth_error");
  }

  if (!session.activeRoleCode) {
    redirectToLogin("active_role_missing");
  }

  if (
    !hasAppRole([session.activeRoleCode], "staff") &&
    !hasAppRole([session.activeRoleCode], "admin")
  ) {
    notFound();
  }

  await requireRefreshableServerSession("/hotels", "hotels-layout");

  return (
    <AuthRefreshGate accessTokenExpiresAt={session.accessTokenExpiresAt}>
      <OwnerRequestRealtimeNotifier />
      {children}
    </AuthRefreshGate>
  );
}
