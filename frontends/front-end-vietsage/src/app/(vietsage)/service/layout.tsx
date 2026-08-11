import { auth } from "@/auth";
import { type ReactNode } from "react";

import { notFound, redirect } from "next/navigation";
import { AuthRefreshGate } from "../_components/auth-refresh-gate";
import { hasAppRole } from "@/libs/rbac";
import { requireRefreshableServerSession } from "@/libs/server-session-tokens";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import { resolveWorkspacePersona } from "@/features/workspace/utils/workspace-context";
import { WorkspaceProfileProvider } from "@/features/workspace/components/workspace-profile-context";

import { ServiceShell } from "./_components/service-shell";
import { buildWorkspaceNavigation } from "@/features/workspace/config/workspace-registry";

function redirectToLogin(reason: string): never {
  console.info("[AUTH_REDIRECT_LOGIN_SOURCE]", {
    source: "service-layout",
    reason,
    pathname: "/service/dashboard",
  });

  redirect("/dangnhap?reauth=1&callbackUrl=/service/dashboard");
}

export default async function ServiceLayout({
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

  await requireRefreshableServerSession("/service/dashboard", "service-layout");

  const context = await loadServerWorkspaceContext("/service/dashboard");
  const persona = resolveWorkspacePersona(context.activeRole.code);
  if (persona !== "service_partner") notFound();

  const navItems = buildWorkspaceNavigation({
    persona,
    permissions: context.permissions,
  });

  return (
    <AuthRefreshGate accessTokenExpiresAt={session.accessTokenExpiresAt}>
      <WorkspaceProfileProvider profileName={context.fullName}>
        <ServiceShell navItems={navItems} subtitle={context.activeRole.name} profileName={context.fullName}>
          {children}
        </ServiceShell>
      </WorkspaceProfileProvider>
    </AuthRefreshGate>
  );
}
