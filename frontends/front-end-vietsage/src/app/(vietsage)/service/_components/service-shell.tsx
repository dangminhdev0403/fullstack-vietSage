import type { ReactNode } from "react";

import { WorkspaceShell } from "@/features/workspace/components/workspace-shell";
import { getWorkspaceDefinition } from "@/features/workspace/config/workspace-registry";
import type { DashboardNavItem } from "@/features/workspace/types/workspace-navigation";

type ServiceShellProps = {
  activePath?: string;
  children: ReactNode;
  navItems: readonly DashboardNavItem[];
  profileName?: string | null;
  subtitle?: string;
};

export function ServiceShell({
  activePath,
  children,
  navItems,
  profileName,
  subtitle = "Cổng đối tác dịch vụ",
}: Readonly<ServiceShellProps>) {
  return (
    <WorkspaceShell
      activePath={activePath}
      contextLabel={subtitle}
      definition={getWorkspaceDefinition("service_partner")}
      navItems={navItems}
      profileName={profileName}
    >
      {children}
    </WorkspaceShell>
  );
}
