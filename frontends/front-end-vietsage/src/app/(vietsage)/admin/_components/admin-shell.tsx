import type { ReactNode } from "react";

import { WorkspaceShell } from "@/features/workspace/components/workspace-shell";
import { getWorkspaceDefinition } from "@/features/workspace/config/workspace-registry";
import type { DashboardNavItem } from "@/features/workspace/types/workspace-navigation";

type AdminShellProps = {
  activePath?: string;
  children: ReactNode;
  navItems: readonly DashboardNavItem[];
  profileName?: string | null;
  subtitle?: string;
};

export function AdminShell({
  activePath,
  children,
  navItems,
  profileName,
  subtitle = "Quản trị nền tảng",
}: AdminShellProps) {
  return (
    <WorkspaceShell
      activePath={activePath}
      contextLabel={subtitle}
      definition={getWorkspaceDefinition("platform_admin")}
      navItems={navItems}
      profileName={profileName}
    >
      {children}
    </WorkspaceShell>
  );
}
