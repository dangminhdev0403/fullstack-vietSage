import type { ReactNode } from "react";

import { VsDashboardSidebar } from "../../_components/vs-dashboard-sidebar";
import { VsTopBar } from "../../_components/vs-top-bar";
import type { DashboardNavItem } from "@/lib/frontend-navigation";

type OwnerShellProps = {
  activePath: string;
  children: ReactNode;
  navItems: readonly DashboardNavItem[];
  subtitle?: string;
};

export function OwnerShell({ activePath, children, navItems, subtitle = "Không gian chủ khách sạn" }: OwnerShellProps) {
  return (
    <div className="owner-shell-print relative min-h-screen overflow-hidden bg-[#f5f1e8] text-[#17201b]">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_12%_8%,rgba(191,120,54,0.20),transparent_30%),radial-gradient(circle_at_82%_12%,rgba(38,101,89,0.18),transparent_34%),linear-gradient(135deg,#fffaf0_0%,#f3efe6_45%,#e9f0ea_100%)] print:hidden" />
      <div className="pointer-events-none fixed left-[18rem] top-24 -z-10 hidden h-72 w-72 rounded-full border border-[#24473d]/10 print:hidden md:block" />
      <div className="print:hidden">
      <VsTopBar
        title="VietSage"
        brandLockup={false}
        titleClassName="text-[30px] font-semibold leading-none tracking-[-0.04em] text-[#17201b]"
        showLeftControl={false}
        rightMode="profile"
        rightLabel="Chủ khách sạn"
        subtitle={subtitle}
      />
      <VsDashboardSidebar activePath={activePath} items={navItems} />
      </div>
      <main className="owner-shell-main min-h-screen px-4 pb-24 pt-24 print:p-0 md:ml-80 md:px-8 print:md:ml-0 lg:px-12">
        <div className="owner-shell-content mx-auto max-w-[1680px] space-y-8">{children}</div>
      </main>
    </div>
  );
}
