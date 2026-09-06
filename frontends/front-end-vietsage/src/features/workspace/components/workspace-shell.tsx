"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { VsDashboardSidebar, VsWorkspaceNavigation } from "@/app/(vietsage)/_components/vs-dashboard-sidebar";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { VsTopBar } from "@/app/(vietsage)/_components/vs-top-bar";
import type { DashboardNavItem } from "@/features/workspace/types/workspace-navigation";
import { useWorkspaceSidebar } from "../store/workspace-sidebar-store";
import "./workspace.css";
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

  const { isCollapsed, toggle: toggleCollapse } = useWorkspaceSidebar();
  const navigationDialog = useRef<HTMLDialogElement>(null);
  const closeNavigation = () => navigationDialog.current?.close();

  useEffect(() => { void useWorkspaceSidebar.persist.rehydrate(); }, []);
  useEffect(() => { navigationDialog.current?.close(); }, [activePath]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 64rem)");
    const closeOnDesktop = () => { if (desktop.matches) navigationDialog.current?.close(); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
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
    <div className={`vs-workspace ${printFriendly ? "owner-shell-print" : ""}`} data-collapsed={isCollapsed}>
      <a className="vs-workspace-skip-link" href="#workspace-content">Chuyển đến nội dung</a>
      <div className="print:hidden">
        <VsTopBar
          title="VietSage"
          brandLockup={false}
          titleClassName="vs-workspace-wordmark"
          showLeftControl={false}
          startAction={
            <button type="button" className="vs-workspace-menu-button" aria-label="Mở điều hướng" aria-haspopup="dialog" aria-controls="workspace-mobile-navigation" onClick={() => navigationDialog.current?.showModal()}>
              <VsIcon name="menu" className="text-2xl" />
            </button>
          }
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
      <main id="workspace-content" tabIndex={-1} className={`vs-workspace-main ${printFriendly ? "owner-shell-main" : ""}`}>
        <div className={`vs-workspace-content ${printFriendly ? "owner-shell-content" : ""}`}>{children}</div>
      </main>
      <dialog
        ref={navigationDialog}
        id="workspace-mobile-navigation"
        className="vs-workspace-mobile-dialog"
        aria-labelledby="workspace-navigation-title"
        onClick={(event) => { if (event.target === event.currentTarget) closeNavigation(); }}
      >
        <div className="vs-workspace-mobile-panel">
          <div className="vs-workspace-mobile-heading">
            <div>
              <h2 id="workspace-navigation-title">{definition.eyebrow}</h2>
              <p>{contextLabel ?? definition.profileLabel}</p>
            </div>
            <button type="button" className="vs-workspace-icon-button" aria-label="Đóng điều hướng" onClick={closeNavigation}>
              <VsIcon name="close" className="text-2xl" />
            </button>
          </div>
          <VsWorkspaceNavigation activePath={activePath} items={navItems} badgeByKey={badgeByKey} onNavigate={closeNavigation} />
        </div>
      </dialog>
    </div>
  );
}
