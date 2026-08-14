"use client";

import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { VsDashboardSidebar } from "@/app/(vietsage)/_components/vs-dashboard-sidebar";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { VsTopBar } from "@/app/(vietsage)/_components/vs-top-bar";
import type { DashboardNavItem } from "@/features/workspace/types/workspace-navigation";
import { isNavItemActive } from "@/features/workspace/utils/workspace-nav-active";
import { useHotelMessageUnread } from "@/features/hotel-ops/hooks/use-hotel-message-unread";
import { useWorkspaceProfile } from "./workspace-profile-context";

import type { WorkspaceDefinition } from "../config/workspace-registry";

type WorkspaceShellProps = {
  children: ReactNode;
  definition: WorkspaceDefinition;
  navItems: readonly DashboardNavItem[];
  contextLabel?: string;
  activePath?: string;
  profileName?: string | null;
  printFriendly?: boolean;
};

export function WorkspaceShell({
  children,
  definition,
  navItems,
  contextLabel,
  activePath: explicitActivePath,
  profileName,
  printFriendly = false,
}: Readonly<WorkspaceShellProps>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams?.toString();
  const activePath =
    explicitActivePath ??
    (queryString ? `${pathname ?? ""}?${queryString}` : pathname ?? "");
  const inheritedProfile = useWorkspaceProfile();
  const resolvedProfileName = profileName ?? inheritedProfile.profileName;

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("vietsage_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("vietsage_sidebar_collapsed", String(next));
      } catch {
        // Ignore storage errors in restricted contexts
      }
      return next;
    });
  }, []);

  const hotelIdMatch = pathname?.match(/^\/(?:hotels|owner\/hotels)\/([^/]+)/);
  const hotelId = hotelIdMatch?.[1] ?? null;
  const hasMessagePermission = useMemo(
    () =>
      navItems.some(
        (item) =>
          item.key === "staff.messages" ||
          item.key === "room-messages" ||
          item.href.includes("/messages"),
      ),
    [navItems],
  );
  const { unreadCount } = useHotelMessageUnread(hotelId, {
    enabled: hasMessagePermission,
  });

  const badgeByKey = useMemo<Record<string, number>>(
    () => ({
      "staff.messages": unreadCount,
      "room-messages": unreadCount,
    }),
    [unreadCount],
  );

  return (
    <div
      className={`relative min-h-screen overflow-hidden bg-[#f5f1e8] text-[#17201b] ${
        printFriendly ? "owner-shell-print" : ""
      }`}
    >
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_12%_8%,rgba(191,120,54,0.20),transparent_30%),radial-gradient(circle_at_82%_12%,rgba(38,101,89,0.18),transparent_34%),linear-gradient(135deg,#fffaf0_0%,#f3efe6_45%,#e9f0ea_100%)] print:hidden" />
      <div className="print:hidden">
        <VsTopBar
          title="VietSage"
          brandLockup={false}
          titleClassName="text-[30px] font-semibold leading-none tracking-[-0.04em] text-[#17201b]"
          showLeftControl={false}
          rightMode="profile"
          rightLabel={resolvedProfileName ?? definition.profileLabel}
          subtitle={contextLabel ?? definition.profileLabel}
        />
        <VsDashboardSidebar
          activePath={activePath}
          items={navItems}
          eyebrow={definition.eyebrow}
          description={definition.description}
          badgeByKey={badgeByKey}
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
        />
      </div>
      <main
        className={`min-h-screen px-4 pb-24 pt-24 transition-all duration-300 print:p-0 ${
          isCollapsed ? "md:ml-20" : "md:ml-72 lg:ml-80"
        } md:px-8 print:md:ml-0 lg:px-10 xl:px-12 ${
          printFriendly ? "owner-shell-main" : ""
        }`}
      >
        <div
          className={`mx-auto max-w-[1680px] space-y-8 ${
            printFriendly ? "owner-shell-content" : ""
          }`}
        >
          {children}
        </div>
      </main>
      <nav className="fixed inset-x-3 bottom-3 z-50 flex items-stretch justify-around gap-1 rounded-2xl border border-[#24473d]/10 bg-[#17201b]/95 p-2 text-[#fff8e8] shadow-[0_18px_50px_rgba(23,32,27,0.28)] backdrop-blur-xl print:hidden md:hidden">
        {navItems.slice(0, 4).map((item) => {
          const active = isNavItemActive(item.href, activePath, navItems);
          const badge = badgeByKey[item.key] ?? 0;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-center text-[10px] font-bold ${
                active ? "bg-[#f8f1e6] text-[#17201b]" : "text-[#d7cbb8]"
              }`}
            >
              <span className="relative">
                <VsIcon name={item.icon} className="text-xl" />
                {badge > 0 ? (
                  <span
                    className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e8b363] px-1 text-[9px] font-bold text-[#17201b] shadow"
                    aria-label={`${item.label}, ${badge} tin chưa đọc`}
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </span>
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
