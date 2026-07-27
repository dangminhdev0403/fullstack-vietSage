import Link from "next/link";

import { VietSageBrand } from "@/components/brand/vietsage-brand";
import type { DashboardNavItem } from "@/features/workspace/types/workspace-navigation";
import { isNavItemActive } from "@/features/workspace/utils/workspace-nav-active";

import { VsIcon } from "./vs-icon";

type VsDashboardSidebarProps = {
  activePath: string;
  description?: string;
  eyebrow?: string;
  items?: readonly DashboardNavItem[];
};

export function VsDashboardSidebar({
  activePath,
  description = "Trung tâm điều hành theo phạm vi và quyền của phiên hiện tại.",
  eyebrow = "Workspace",
  items,
}: Readonly<VsDashboardSidebarProps>) {
  const navigationItems = items ?? [];

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-full w-80 flex-col border-r border-[#1f3d35]/10 bg-[#17201b] pt-20 text-[#f8f1e6] shadow-[18px_0_60px_rgba(23,32,27,0.18)] md:flex">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(232,179,99,0.22),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.08),transparent_34%)]" />
      <div className="relative mb-8 px-7">
        <div className="mb-4 flex items-center justify-between gap-3">
          <VietSageBrand
            variant="mark"
            priority
            className="h-16 w-16 rounded-[1.35rem] p-1.5 shadow-[0_16px_36px_rgba(0,0,0,0.18)]"
            markClassName="h-full w-full"
          />
          <span className="rounded-full border border-[#f8f1e6]/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#e8b363]">
            {eyebrow}
          </span>
        </div>
        <VietSageBrand
          variant="wordmark"
          priority
          className="max-w-[14rem] rounded-xl px-3 py-2 shadow-[0_12px_28px_rgba(0,0,0,0.14)]"
          wordmarkClassName="h-8 w-auto max-w-full"
        />
        <p className="mt-3 max-w-48 text-sm font-medium leading-6 text-[#d7cbb8]">
          {description}
        </p>
      </div>

      <nav className="relative flex flex-col gap-2 px-5">
        {navigationItems.map((item) => {
          const isActive = isNavItemActive(item.href, activePath, navigationItems);

          return (
            <Link
              key={item.key}
              href={item.href}
              className={`group flex min-h-14 items-center gap-4 rounded-2xl px-4 py-2.5 text-base transition-all ${
                isActive
                  ? "bg-[#f8f1e6] text-[#17201b] shadow-[0_14px_32px_rgba(0,0,0,0.20)]"
                  : "text-[#d7cbb8] hover:bg-white/10 hover:text-[#fff8e8]"
              }`}
            >
              <span
                className={`grid h-9 w-9 place-items-center rounded-xl transition-colors ${
                  isActive
                    ? "bg-[#e8b363] text-[#17201b]"
                    : "bg-white/8 text-[#e8b363] group-hover:bg-white/12"
                }`}
              >
                <VsIcon name={item.icon} className="text-[20px]" />
              </span>
              <span className="font-semibold">{item.label}</span>
            </Link>
          );
        })}

        {navigationItems.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm text-[#d7cbb8]">
            Chưa có mục điều hướng.
          </div>
        ) : null}
      </nav>
    </aside>
  );
}
