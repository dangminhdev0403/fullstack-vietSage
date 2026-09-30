import type { ReactNode } from "react";

import { WorkspaceShell } from "@/features/workspace/components/workspace-shell";
import { getWorkspaceDefinition } from "@/features/workspace/config/workspace-registry";
import type { DashboardNavItem } from "@/features/workspace/types/workspace-navigation";
import type { WorkspaceDefinition } from "@/features/workspace/types/workspace-registry";

type AdminShellProps = {
  activePath?: string;
  children: ReactNode;
  navItems: readonly DashboardNavItem[];
  profileName?: string | null;
  subtitle?: string;
  definition?: WorkspaceDefinition;
};

export function AdminShell({
  activePath,
  children,
  navItems,
  profileName,
  subtitle = "Quản trị nền tảng",
  definition = getWorkspaceDefinition("platform_admin"),
}: AdminShellProps) {
  return (
    <WorkspaceShell
      activePath={activePath}
      contextLabel={subtitle}
      definition={definition}
      navItems={navItems}
      profileName={profileName}
    >
      {children}
    </WorkspaceShell>
  );
}
