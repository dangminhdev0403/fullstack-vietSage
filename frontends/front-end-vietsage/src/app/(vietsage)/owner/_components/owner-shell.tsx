import type { ReactNode } from "react";

import { WorkspaceShell } from "@/features/workspace/components/workspace-shell";
import { getWorkspaceDefinition } from "@/features/workspace/config/workspace-registry";
import type { DashboardNavItem } from "@/features/workspace/types/workspace-navigation";

type OwnerShellProps = {
  activePath: string;
  children: ReactNode;
  navItems: readonly DashboardNavItem[];
  subtitle?: string;
};

export function OwnerShell({ activePath, children, navItems, subtitle = "Không gian chủ khách sạn" }: OwnerShellProps) {
  return (
    <WorkspaceShell
      activePath={activePath}
      contextLabel={subtitle}
      definition={getWorkspaceDefinition("owner")}
      navItems={navItems}
      printFriendly
    >
      {children}
    </WorkspaceShell>
  );
}
