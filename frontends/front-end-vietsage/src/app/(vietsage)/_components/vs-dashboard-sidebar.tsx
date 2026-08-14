"use client";

import { useMemo } from "react";
import Link from "next/link";

import { VietSageBrand } from "@/components/brand/vietsage-brand";
import type {
  DashboardNavItem,
  DashboardNavSection,
} from "@/features/workspace/types/workspace-navigation";
import { isNavItemActive } from "@/features/workspace/utils/workspace-nav-active";

import { VsIcon } from "./vs-icon";

type VsDashboardSidebarProps = {
  activePath: string;
  description?: string;
  eyebrow?: string;
  items?: readonly DashboardNavItem[];
  badgeByKey?: Readonly<Record<string, number>>;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

const SECTION_ORDER: readonly DashboardNavSection[] = [
  "OVERVIEW",
  "OPERATIONS",
  "ADMINISTRATION",
  "PARTNERS",
];

const SECTION_LABELS: Record<DashboardNavSection, string> = {
  OVERVIEW: "OVERVIEW",
  OPERATIONS: "OPERATIONS",
  ADMINISTRATION: "ADMINISTRATION",
  PARTNERS: "PARTNERS",
};

export function VsDashboardSidebar({
  activePath,
  description = "Trung tâm điều hành theo phạm vi và quyền của phiên hiện tại.",
  eyebrow = "Workspace",
  items,
  badgeByKey,
  isCollapsed = false,
  onToggleCollapse,
}: Readonly<VsDashboardSidebarProps>) {
  const navigationItems = useMemo(() => items ?? [], [items]);

  const groupedItems = useMemo(() => {
    const map = new Map<DashboardNavSection, DashboardNavItem[]>();
    for (const section of SECTION_ORDER) {
      map.set(section, []);
    }

    for (const item of navigationItems) {
      const sec = item.section ?? "OPERATIONS";
      if (!map.has(sec)) {
        map.set(sec, []);
      }
      map.get(sec)!.push(item);
    }

    return SECTION_ORDER.map((sec) => ({
      section: sec,
      label: SECTION_LABELS[sec] ?? sec,
      items: map.get(sec) ?? [],
    })).filter((group) => group.items.length > 0);
  }, [navigationItems]);

  return (
    <aside
      className={`fixed left-0 top-0 z-40 hidden h-full flex-col border-r border-[#1f3d35]/10 bg-[#17201b] pt-20 text-[#f8f1e6] shadow-[18px_0_60px_rgba(23,32,27,0.18)] transition-all duration-300 md:flex ${
        isCollapsed ? "w-20" : "w-72 lg:w-80"
      }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(232,179,99,0.22),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.08),transparent_34%)]" />

      {/* Header section */}
      <div className={`relative mb-6 px-4 transition-all duration-300 ${isCollapsed ? "px-3" : "px-6"}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <VietSageBrand
              variant="mark"
              priority
              className={`rounded-[1.2rem] p-1.5 shadow-[0_16px_36px_rgba(0,0,0,0.18)] transition-all duration-300 ${
                isCollapsed ? "h-12 w-12" : "h-14 w-14"
              }`}
              markClassName="h-full w-full"
            />
            {!isCollapsed ? (
              <span className="rounded-full border border-[#f8f1e6]/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#e8b363]">
                {eyebrow}
              </span>
            ) : null}
          </div>

          {onToggleCollapse ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#f8f1e6]/15 bg-white/5 text-[#d7cbb8] transition-colors hover:bg-white/15 hover:text-[#fff8e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8b363]"
              title={isCollapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
              aria-label={isCollapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
            >
              <VsIcon name={isCollapsed ? "chevron_right" : "chevron_left"} className="text-base" />
            </button>
          ) : null}
        </div>

        {!isCollapsed ? (
          <div className="mt-3">
            <p className="font-serif text-[1.95rem] font-bold leading-tight tracking-[-0.035em] text-[#fff8e8]">
              VietSage
            </p>
            <p className="mt-1.5 line-clamp-2 max-w-56 text-xs font-medium leading-5 text-[#d7cbb8]">
              {description}
            </p>
          </div>
        ) : null}
      </div>

      {/* Navigation items with vertical scrolling */}
      <nav
        className={`relative flex-1 space-y-5 overflow-y-auto pb-6 custom-scrollbar transition-all duration-300 ${
          isCollapsed ? "px-2" : "px-4"
        }`}
      >
        {groupedItems.map((group, groupIdx) => (
          <div key={group.section} className="space-y-1">
            {/* Section Header */}
            {!isCollapsed ? (
              <div className="px-3 pb-1 pt-2">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#e8b363]/85">
                  {group.label}
                </span>
              </div>
            ) : groupIdx > 0 ? (
              <div className="my-2 mx-auto w-8 border-t border-[#f8f1e6]/10" />
            ) : null}

            {/* Section Items */}
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = isNavItemActive(item.href, activePath, navigationItems);
                const badge = badgeByKey?.[item.key] ?? 0;

                if (isCollapsed) {
                  return (
                    <div key={item.key} className="relative group flex justify-center">
                      <Link
                        href={item.href}
                        className={`flex h-[50px] w-[50px] items-center justify-center rounded-xl transition-all duration-200 ${
                          isActive
                            ? "bg-[#f8f1e6] text-[#17201b] shadow-[0_4px_16px_rgba(0,0,0,0.18)]"
                            : "text-[#d7cbb8] hover:bg-white/10 hover:text-[#fff8e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8b363]"
                        }`}
                      >
                        <span
                          className={`grid h-8 w-8 place-items-center rounded-lg transition-colors ${
                            isActive
                              ? "bg-[#e8b363] text-[#17201b]"
                              : "bg-transparent text-[#e8b363] group-hover:bg-white/10"
                          }`}
                        >
                          <VsIcon name={item.icon} className="text-[19px]" />
                        </span>
                        {badge > 0 ? (
                          <span
                            className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e8b363] px-1 text-[9px] font-bold text-[#17201b] shadow"
                            aria-label={`${item.label}, ${badge} tin chưa đọc`}
                          >
                            {badge > 99 ? "99+" : badge}
                          </span>
                        ) : null}
                      </Link>

                      {/* Tooltip on hover when collapsed */}
                      <div className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 hidden group-hover:flex items-center gap-2 rounded-xl border border-[#e8b363]/25 bg-[#17201b] px-3.5 py-2 text-xs font-semibold text-[#f8f1e6] shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md whitespace-nowrap">
                        <span>{item.label}</span>
                        {badge > 0 ? (
                          <span className="rounded-full bg-[#e8b363] px-1.5 py-0.5 text-[10px] font-bold text-[#17201b]">
                            {badge > 99 ? "99+" : badge}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`group flex h-[52px] items-center gap-3.5 rounded-xl px-3.5 text-sm font-semibold transition-all duration-200 ${
                      isActive
                        ? "bg-[#f8f1e6] text-[#17201b] shadow-[0_4px_16px_rgba(0,0,0,0.18)]"
                        : "text-[#d7cbb8] hover:bg-white/10 hover:text-[#fff8e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8b363]"
                    }`}
                  >
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors ${
                        isActive
                          ? "bg-[#e8b363] text-[#17201b]"
                          : "bg-white/8 text-[#e8b363] group-hover:bg-white/14"
                      }`}
                    >
                      <VsIcon name={item.icon} className="text-[19px]" />
                    </span>
                    <span className="truncate font-medium text-sm">{item.label}</span>
                    {badge > 0 ? (
                      <span
                        className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[#e8b363] px-1.5 text-[11px] font-bold text-[#17201b] shadow-sm transition-all"
                        aria-label={`${item.label}, ${badge} tin chưa đọc`}
                      >
                        {badge > 99 ? "99+" : badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {groupedItems.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm text-[#d7cbb8]">
            Chưa có mục điều hướng.
          </div>
        ) : null}
      </nav>
    </aside>
  );
}
