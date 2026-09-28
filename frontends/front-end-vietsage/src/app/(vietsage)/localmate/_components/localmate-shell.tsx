import type { ReactNode } from "react";

import { WorkspaceShell } from "@/features/workspace/components/workspace-shell";
import { getWorkspaceDefinition } from "@/features/workspace/config/workspace-registry";
import type { DashboardNavItem } from "@/features/workspace/types/workspace-navigation";

type LocalMateShellProps = {
  activePath?: string;
  children: ReactNode;
  navItems: readonly DashboardNavItem[];
  profileName?: string | null;
  subtitle?: string;
};

export function LocalMateShell({
  activePath,
  children,
  navItems,
  profileName,
  subtitle = "Mạng lưới LocalMate",
}: Readonly<LocalMateShellProps>) {
  return (
    <WorkspaceShell
      activePath={activePath}
      contextLabel={subtitle}
      definition={getWorkspaceDefinition("localmate_manager")}
      navItems={navItems}
      profileName={profileName}
    >
      {children}
    </WorkspaceShell>
  );
}
