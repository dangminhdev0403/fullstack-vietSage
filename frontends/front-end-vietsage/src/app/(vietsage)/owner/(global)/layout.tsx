import { type ReactNode } from "react";
import { buildWorkspaceNavigationForContext } from "@/features/workspace/config/workspace-registry";
import { loadServerWorkspaceContext } from "@/lib/server-workspace-context";
import { WorkspaceProfileProvider } from "@/features/workspace/components/workspace-profile-context";
import { OwnerShell } from "../_components/owner-shell";

export default async function OwnerGlobalLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const callbackUrl = "/owner/dashboard" as const;
  const context = await loadServerWorkspaceContext(callbackUrl);
  const sidebarItems = buildWorkspaceNavigationForContext(context);

  return (
    <WorkspaceProfileProvider profileName={context.fullName}>
      <OwnerShell navItems={sidebarItems} subtitle={context.activeRole.name}>
        {children}
      </OwnerShell>
    </WorkspaceProfileProvider>
  );
}
