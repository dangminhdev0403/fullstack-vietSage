import type { ReactNode } from "react";
import Link from "next/link";

import { VsDashboardSidebar } from "@/app/(vietsage)/_components/vs-dashboard-sidebar";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { VsTopBar } from "@/app/(vietsage)/_components/vs-top-bar";
import type { DashboardNavItem } from "@/features/workspace/types/workspace-navigation";

import type { WorkspaceDefinition } from "../config/workspace-registry";

type WorkspaceShellProps = {
  activePath: string;
  children: ReactNode;
  definition: WorkspaceDefinition;
  navItems: readonly DashboardNavItem[];
  contextLabel?: string;
  printFriendly?: boolean;
};

export function WorkspaceShell({
  activePath,
  children,
  definition,
  navItems,
  contextLabel,
  printFriendly = false,
}: WorkspaceShellProps) {
  return (
    <div className={`relative min-h-screen overflow-hidden bg-[#f5f1e8] text-[#17201b] ${printFriendly ? "owner-shell-print" : ""}`}>
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_12%_8%,rgba(191,120,54,0.20),transparent_30%),radial-gradient(circle_at_82%_12%,rgba(38,101,89,0.18),transparent_34%),linear-gradient(135deg,#fffaf0_0%,#f3efe6_45%,#e9f0ea_100%)] print:hidden" />
      <div className="print:hidden">
        <VsTopBar
          title="VietSage"
          brandLockup={false}
          titleClassName="text-[30px] font-semibold leading-none tracking-[-0.04em] text-[#17201b]"
          showLeftControl={false}
          rightMode="profile"
          rightLabel={definition.profileLabel}
          subtitle={contextLabel ?? definition.title}
        />
        <VsDashboardSidebar
          activePath={activePath}
          items={navItems}
          eyebrow={definition.eyebrow}
          description={definition.description}
        />
      </div>
      <main className={`min-h-screen px-4 pb-24 pt-24 print:p-0 md:ml-80 md:px-8 print:md:ml-0 lg:px-12 ${printFriendly ? "owner-shell-main" : ""}`}>
        <div className={`mx-auto max-w-[1680px] space-y-8 ${printFriendly ? "owner-shell-content" : ""}`}>
          {children}
        </div>
      </main>
      <nav className="fixed inset-x-3 bottom-3 z-50 flex items-stretch justify-around gap-1 rounded-2xl border border-[#24473d]/10 bg-[#17201b]/95 p-2 text-[#fff8e8] shadow-[0_18px_50px_rgba(23,32,27,0.28)] backdrop-blur-xl print:hidden md:hidden">
        {navItems.slice(0, 4).map((item) => {
          const active = activePath === item.href || activePath.startsWith(`${item.href}?`);
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-center text-[10px] font-bold ${active ? "bg-[#f8f1e6] text-[#17201b]" : "text-[#d7cbb8]"}`}
            >
              <VsIcon name={item.icon} className="text-xl" />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
