import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { type ReactNode } from "react";

import { AuthRefreshGate } from "../_components/auth-refresh-gate";
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

  await requireRefreshableServerSession("/hotels", "hotels-layout");

  return (
    <AuthRefreshGate accessTokenExpiresAt={session.accessTokenExpiresAt}>
      {children}
    </AuthRefreshGate>
  );
}
