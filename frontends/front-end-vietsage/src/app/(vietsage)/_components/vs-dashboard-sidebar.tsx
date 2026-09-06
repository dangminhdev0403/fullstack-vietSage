"use client";

import Link from "next/link";

import { VietSageBrand } from "@/components/brand/vietsage-brand";
import type { DashboardNavItem, DashboardNavSection } from "@/features/workspace/types/workspace-navigation";
import { isNavItemActive } from "@/features/workspace/utils/workspace-nav-active";
import { VsIcon } from "./vs-icon";

type NavigationProps = {
  activePath: string;
  items?: readonly DashboardNavItem[];
  badgeByKey?: Readonly<Record<string, number>>;
  isCollapsed?: boolean;
  onNavigate?: () => void;
  id?: string;
};

const SECTIONS: readonly [DashboardNavSection, string][] = [
  ["OVERVIEW", "Tổng quan"],
  ["OPERATIONS", "Vận hành"],
  ["ADMINISTRATION", "Quản trị"],
  ["PARTNERS", "Đối tác"],
];

export function VsWorkspaceNavigation({
  activePath, items = [], badgeByKey, isCollapsed = false, onNavigate, id,
}: Readonly<NavigationProps>) {
  return (
    <nav id={id} className="vs-workspace-navigation" aria-label="Điều hướng không gian làm việc">
      {SECTIONS.map(([section, label]) => {
        const sectionItems = items.filter((item) => (item.section ?? "OPERATIONS") === section);
        if (!sectionItems.length) return null;
        return (
          <div key={section} className="vs-workspace-nav-section">
            <p className={isCollapsed ? "sr-only" : "vs-workspace-nav-heading"}>{label}</p>
            <ul className="vs-workspace-nav-list">
              {sectionItems.map((item) => {
                const isActive = isNavItemActive(item.href, activePath, items);
                const badge = badgeByKey?.[item.key] ?? 0;
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={isActive ? "page" : undefined}
                      aria-label={isCollapsed ? item.label : undefined}
                      title={isCollapsed ? item.label : undefined}
                      className="vs-workspace-nav-link"
                    >
                      <VsIcon name={item.icon} className="vs-workspace-nav-icon" />
                      <span className={isCollapsed ? "sr-only" : "vs-workspace-nav-label"}>{item.label}</span>
                      {badge > 0 ? (
                        <span className="vs-workspace-nav-badge" aria-label={
                          badge + " tin chưa đọc"
                        }>{badge > 99 ? "99+" : badge}</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {!items.length ? <p className="vs-workspace-nav-empty">Chưa có mục điều hướng.</p> : null}
    </nav>
  );
}

type VsDashboardSidebarProps = NavigationProps & {
  description?: string;
  eyebrow?: string;
  onToggleCollapse?: () => void;
};

export function VsDashboardSidebar({
  description = "Trung tâm điều hành theo phạm vi và quyền của phiên hiện tại.",
  eyebrow = "Workspace", onToggleCollapse, ...navigation
}: Readonly<VsDashboardSidebarProps>) {
  const { isCollapsed = false } = navigation;
  return (
    <aside className="vs-workspace-sidebar" aria-label={eyebrow}>
      <div className="vs-workspace-sidebar-context">
        <VietSageBrand variant="mark" className="size-11 shrink-0" markClassName="size-full" />
        {!isCollapsed ? <div><p className="vs-workspace-sidebar-title">{eyebrow}</p><p className="vs-workspace-sidebar-description">{description}</p></div> : null}
      </div>
      <VsWorkspaceNavigation {...navigation} id="workspace-desktop-navigation" />
      {onToggleCollapse ? (
        <button
          type="button"
          className="vs-workspace-collapse"
          onClick={onToggleCollapse}
          aria-expanded={!isCollapsed}
          aria-controls="workspace-desktop-navigation"
          aria-label={isCollapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
          title={isCollapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
        >
          <VsIcon name={isCollapsed ? "chevron_right" : "chevron_left"} className="text-xl" />
          {!isCollapsed ? <span>Thu gọn điều hướng</span> : null}
        </button>
      ) : null}
    </aside>
  );
}
