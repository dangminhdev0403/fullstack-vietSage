import type { ReactNode } from "react";

import { WorkspaceShell } from "@/features/workspace/components/workspace-shell";
import { getWorkspaceDefinition } from "@/features/workspace/config/workspace-registry";
import type { DashboardNavItem } from "@/features/workspace/types/workspace-navigation";

type FinanceShellProps = {
  activePath?: string;
  children: ReactNode;
  navItems: readonly DashboardNavItem[];
  profileName?: string | null;
  subtitle?: string;
};

export function FinanceShell({
  activePath,
  children,
  navItems,
  profileName,
  subtitle = "Tài chính & Công nợ SaaS",
}: FinanceShellProps) {
  return (
    <WorkspaceShell
      activePath={activePath}
      contextLabel={subtitle}
      definition={getWorkspaceDefinition("platform_finance")}
      navItems={navItems}
      profileName={profileName}
      sidebarWidth="compact240"
    >
      {children}
    </WorkspaceShell>
  );
}
