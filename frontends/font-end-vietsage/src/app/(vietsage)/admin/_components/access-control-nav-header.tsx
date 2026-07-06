import Link from "next/link";
import type { ReactNode } from "react";

import { VsIcon } from "../../_components/vs-icon";

type AccessControlTab = "roles" | "permissions";

type AccessControlNavHeaderProps = {
  activeTab: AccessControlTab;
  title: string;
  breadcrumbCurrent: string;
  rightAction?: ReactNode;
};

const ACCESS_CONTROL_TABS: readonly {
  key: AccessControlTab;
  href: string;
  icon: string;
  label: string;
}[] = [
  {
    key: "roles",
    href: "/admin/roles",
    icon: "group",
    label: "Danh sách Vai trò",
  },
  {
    key: "permissions",
    href: "/admin/permissions",
    icon: "verified_user",
    label: "Danh sách Quyền hạn",
  },
];

export function AccessControlNavHeader({
  activeTab,
  title,
  breadcrumbCurrent,
  rightAction,
}: AccessControlNavHeaderProps) {
  return (
    <header className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--on-surface-variant)]" aria-label="Breadcrumb">
            <Link href="/admin/dashboard" className="hover:text-[var(--primary)]">
              Admin
            </Link>
            <span aria-hidden="true">/</span>
            <span className="text-[var(--primary)]">{breadcrumbCurrent}</span>
          </nav>
          <h1 className="mt-3 text-3xl font-semibold text-[var(--primary)] md:text-4xl">{title}</h1>
        </div>
        {rightAction ? <div className="flex shrink-0 items-center">{rightAction}</div> : null}
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Access control sections">
        {ACCESS_CONTROL_TABS.map((tab) => {
          const isActive = tab.key === activeTab;

          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors ${
                isActive
                  ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--on-primary)]"
                  : "border-[var(--outline-variant)] bg-white text-[var(--on-surface-variant)] hover:text-[var(--primary)]"
              }`}
            >
              <VsIcon name={tab.icon} className="text-[18px]" />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
