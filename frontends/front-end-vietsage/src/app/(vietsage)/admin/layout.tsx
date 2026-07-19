import { auth } from "@/auth";
import { type ReactNode } from "react";

import { notFound, redirect } from "next/navigation";
import { AuthRefreshGate } from "../_components/auth-refresh-gate";
import { hasAppRole } from "@/lib/rbac";
import { requireRefreshableServerSession } from "@/lib/server-session-tokens";


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

  if (!session.activeRoleCode) {
    redirectToLogin("active_role_missing");
  }

  if (!hasAppRole([session.activeRoleCode], "admin")) {
    notFound();
  }

  await requireRefreshableServerSession("/admin/dashboard", "admin-layout");

  return (
    <AuthRefreshGate accessTokenExpiresAt={session.accessTokenExpiresAt}>
      {children}
    </AuthRefreshGate>
  );
}
