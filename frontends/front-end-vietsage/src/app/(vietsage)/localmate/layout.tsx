import { auth } from "@/auth";
import { type ReactNode } from "react";
import { notFound, redirect } from "next/navigation";

import { AuthRefreshGate } from "../_components/auth-refresh-gate";
import { hasAppRole } from "@/libs/rbac";
import { requireRefreshableServerSession } from "@/libs/server-session-tokens";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import { resolveWorkspacePersona } from "@/features/workspace/utils/workspace-context";
import { WorkspaceProfileProvider } from "@/features/workspace/components/workspace-profile-context";
import { buildWorkspaceNavigation } from "@/features/workspace/config/workspace-registry";

import { LocalMateShell } from "./_components/localmate-shell";

function redirectToLogin(reason: string): never {
  console.info("[AUTH_REDIRECT_LOGIN_SOURCE]", {
    source: "localmate-layout",
    reason,
    pathname: "/localmate/guides",
  });

  redirect("/dangnhap?reauth=1&callbackUrl=/localmate/guides");
}

export default async function LocalMateLayout({
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

  await requireRefreshableServerSession("/localmate/guides", "localmate-layout");

  const context = await loadServerWorkspaceContext("/localmate/guides");
  const persona = resolveWorkspacePersona(context.activeRole.code);

  const isAllowed =
    persona === "localmate_manager" ||
    persona === "platform_admin" ||
    context.activeRole.code.includes("LOCALMATE") ||
    context.activeRole.code.includes("LOCAL_MATE");

  if (!isAllowed) {
    notFound();
  }

  const isGuideRole = context.activeRole.code === "LOCALMATE_GUIDE";

  const allNavItems = buildWorkspaceNavigation({
    persona: "localmate_manager",
    permissions: context.permissions,
  });

  const navItems = isGuideRole
    ? allNavItems
        .filter((item) => item.key === "localmate.guides")
        .map((item) => ({ ...item, label: "Trung tâm Tác nghiệp & Điều tour" }))
    : allNavItems;

  const subtitle = isGuideRole
    ? "Hướng dẫn viên bản địa"
    : (context.activeRole.name || "Quản trị viên LocalMate");

  return (
    <AuthRefreshGate accessTokenExpiresAt={session.accessTokenExpiresAt}>
      <WorkspaceProfileProvider profileName={context.fullName}>
        <LocalMateShell navItems={navItems} subtitle={subtitle}>
          {children}
        </LocalMateShell>
      </WorkspaceProfileProvider>
    </AuthRefreshGate>
  );
}
