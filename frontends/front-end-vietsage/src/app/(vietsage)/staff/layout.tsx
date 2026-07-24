import { auth } from "@/auth";
import { type ReactNode } from "react";

import { notFound, redirect } from "next/navigation";
import { AuthRefreshGate } from "../_components/auth-refresh-gate";
import { hasAppRole } from "@/libs/rbac";
import { requireRefreshableServerSession } from "@/libs/server-session-tokens";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import { resolveWorkspacePersona } from "@/features/workspace/utils/workspace-context";
import { WorkspaceProfileProvider } from "@/features/workspace/components/workspace-profile-context";

function redirectToLogin(reason: string): never {
  console.info("[AUTH_REDIRECT_LOGIN_SOURCE]", {
    source: "staff-layout",
    reason,
    pathname: "/staff",
  });

  redirect("/login?reauth=1&callbackUrl=/staff");
}

export default async function StaffLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
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

  if (!hasAppRole([session.activeRoleCode], "staff")) {
    notFound();
  }

  await requireRefreshableServerSession("/staff", "staff-layout");

  const context = await loadServerWorkspaceContext("/staff");
  const persona = resolveWorkspacePersona(context.activeRole.code);
  if (!persona) notFound();

  return (
    <AuthRefreshGate accessTokenExpiresAt={session.accessTokenExpiresAt}>
      <WorkspaceProfileProvider profileName={context.fullName}>
        {children}
      </WorkspaceProfileProvider>
    </AuthRefreshGate>
  );
}
