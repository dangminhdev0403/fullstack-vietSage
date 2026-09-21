import { auth } from "@/auth";
import { type ReactNode } from "react";

import { notFound, redirect } from "next/navigation";
import { AuthRefreshGate } from "../_components/auth-refresh-gate";
import { hasAppRole } from "@/libs/rbac";
import { requireRefreshableServerSession } from "@/libs/server-session-tokens";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import { resolveWorkspacePersona } from "@/features/workspace/utils/workspace-context";
import { WorkspaceProfileProvider } from "@/features/workspace/components/workspace-profile-context";

import { FinanceShell } from "./_components/finance-shell";
import { buildWorkspaceNavigation } from "@/features/workspace/config/workspace-registry";

function redirectToLogin(reason: string): never {
  console.info("[AUTH_REDIRECT_LOGIN_SOURCE]", {
    source: "finance-layout",
    reason,
    pathname: "/finance/billing",
  });

  redirect("/dangnhap?reauth=1&callbackUrl=/finance/billing");
}

export default async function FinanceLayout({
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

  if (!hasAppRole([session.activeRoleCode], "admin")) {
    notFound();
  }

  await requireRefreshableServerSession("/finance/billing", "finance-layout");

  const context = await loadServerWorkspaceContext("/finance/billing");
  const persona = resolveWorkspacePersona(context.activeRole.code);
  if (persona !== "platform_finance" && persona !== "platform_admin") {
    notFound();
  }

  const navItems = buildWorkspaceNavigation({
    persona: "platform_finance",
    permissions: context.permissions,
  });

  return (
    <AuthRefreshGate accessTokenExpiresAt={session.accessTokenExpiresAt}>
      <WorkspaceProfileProvider profileName={context.fullName}>
        <FinanceShell navItems={navItems} subtitle={context.activeRole.name}>
          {children}
        </FinanceShell>
      </WorkspaceProfileProvider>
    </AuthRefreshGate>
  );
}
