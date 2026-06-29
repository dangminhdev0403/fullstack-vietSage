import { auth } from "@/auth";
import { type ReactNode } from "react";

import { redirect } from "next/navigation";
import { AuthRefreshGate } from "../_components/auth-refresh-gate";


function redirectToLogin(reason: string): never {
  console.info("[AUTH_REDIRECT_LOGIN_SOURCE]", {
    source: "admin-layout",
    reason,
    pathname: "/admin/dashboard",
  });

  redirect("/login?reauth=1&callbackUrl=/admin/dashboard");
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirectToLogin("no_session");
  }

  if (session.authError) {
    redirectToLogin("auth_error");
  }

  if (!session.refreshToken) {
    redirectToLogin("no_refresh_token");
  }

  return (
    <AuthRefreshGate accessTokenExpiresAt={session.accessTokenExpiresAt}>
      {children}
    </AuthRefreshGate>
  );
}
