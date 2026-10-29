"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { VsDashboardSidebar } from "@/app/(vietsage)/_components/vs-dashboard-sidebar";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { VsTopBar } from "@/app/(vietsage)/_components/vs-top-bar";
import type { DashboardNavItem } from "@/features/workspace/types/workspace-navigation";
import { isNavItemActive } from "@/features/workspace/utils/workspace-nav-active";
import { useHotelMessageUnread } from "@/features/hotel-ops/hooks/use-hotel-message-unread";
import { useWorkspaceUIStore } from "../store/workspace-ui-store";
import { useWorkspaceProfile } from "./workspace-profile-context";

import type { WorkspaceDefinition } from "../config/workspace-registry";

type WorkspaceShellProps = {
  children: ReactNode;
  definition: WorkspaceDefinition;
  navItems: readonly DashboardNavItem[];
  contextLabel?: string;
  hotelName?: string | null;
  activePath?: string;
  profileName?: string | null;
  printFriendly?: boolean;
  sidebarWidth?: "default" | "compact240";
};

function cleanProfileDisplayName(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;

  // Ignore raw technical role tokens like "TENANT_OWNER", "HOTEL_OWNER", "SUPER_ADMIN"
  if (/^(?:TENANT_OWNER|HOTEL_OWNER|SUPER_ADMIN|HOTEL_STAFF|STAFF)$/i.test(trimmed)) {
    return null;
  }

  // Strip redundant role/unit prefixes like "Chủ đơn vị", "Chủ khách sạn", "Lễ tân", etc.
  const cleaned = trimmed
    .replace(/^(?:chủ đơn vị|chu don vi|chủ khách sạn|chu khach san)\s*[:\-–—]?\s*/i, "")
    .replace(/^(?:quản lý khách sạn|quan ly khach san|quản lý|quan ly)\s*[:\-–—]?\s*/i, "")
    .replace(/^(?:lễ tân khách sạn|le tan khach san|lễ tân|le tan)\s*[:\-–—]?\s*/i, "")
    .replace(/^(?:buồng phòng khách sạn|buong phong khach san|buồng phòng|buong phong)\s*[:\-–—]?\s*/i, "")
    .replace(/^(?:kỹ thuật khách sạn|ky thuat khach san|kỹ thuật|ky thuat)\s*[:\-–—]?\s*/i, "")
    .replace(/^(?:ẩm thực khách sạn|am thuc khach san|ẩm thực|am thuc)\s*[:\-–—]?\s*/i, "")
    .replace(/^(?:tài chính khách sạn|tai chinh khach san|tài chính|tai chinh)\s*[:\-–—]?\s*/i, "")
    .replace(/^(?:đối tác dịch vụ|doi tac dich vu)\s*[:\-–—]?\s*/i, "")
    .replace(/^(?:quản trị viên|quan tri vien|quản trị hệ thống|quan tri he thong)\s*[:\-–—]?\s*/i, "")
    .trim();

  return cleaned || trimmed;
}

export function WorkspaceShell({
  children,
  definition,
  navItems,
  contextLabel,
  hotelName,
  activePath: explicitActivePath,
  profileName,
  printFriendly = false,
  sidebarWidth = "default",
}: Readonly<WorkspaceShellProps>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams?.get("tab");
  const activePath =
    explicitActivePath ??
    (tab ? `${pathname ?? ""}?tab=${tab}` : pathname ?? "");
  const inheritedProfile = useWorkspaceProfile();
  const rawProfileName = profileName ?? inheritedProfile.profileName;
  const resolvedProfileName = cleanProfileDisplayName(rawProfileName);

  const isCollapsed = useWorkspaceUIStore((state) => state.isSidebarCollapsed);
  const toggleCollapse = useWorkspaceUIStore((state) => state.toggleSidebar);

  const hotelIdMatch = pathname?.match(/^\/(?:hotels|owner\/hotels)\/([^/]+)/);
  const currentHotelId = hotelIdMatch?.[1] ?? searchParams?.get("hotelId") ?? null;
  const hotelId = hotelIdMatch?.[1] ?? null;

  const matchedHotel =
    currentHotelId && inheritedProfile.accessibleHotels
      ? inheritedProfile.accessibleHotels.find((h) => h.id === currentHotelId)
      : null;

  const resolvedHotelName =
    hotelName ?? matchedHotel?.name ?? inheritedProfile.hotelName ?? null;

  const effectiveNavItems = useMemo(() => {
    if (!hotelId) return navItems;
    return navItems.map((item) => {
      if (item.href.includes("/owner/hotels/") || item.href.includes("/hotels/")) {
        const updatedHref = item.href.replace(
          /(\/(?:owner\/)?hotels\/)[^/]+(\/.*)?$/,
          `$1${hotelId}$2`,
        ) as `/${string}`;
        return { ...item, href: updatedHref };
      }
      return item;
    });
  }, [navItems, hotelId]);

  const hasMessagePermission = useMemo(
    () =>
      effectiveNavItems.some(
        (item) =>
          item.key === "staff.messages" ||
          item.key === "room-messages" ||
          item.href.includes("/messages"),
      ),
    [effectiveNavItems],
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
          titleClassName="text-[24px] font-semibold leading-none tracking-[-0.04em] text-[#17201b] md:hidden"
          showLeftControl={false}
          rightMode="profile"
          rightLabel={resolvedProfileName ?? definition.profileLabel}
          subtitle={contextLabel ?? definition.profileLabel}
          hotelName={resolvedHotelName}
          headerClassName={`transition-all duration-300 ${
            isCollapsed
              ? "md:left-20 md:w-[calc(100%-5rem)]"
              : sidebarWidth === "compact240"
                ? "md:left-60 md:w-[calc(100%-15rem)]"
                : "md:left-72 2xl:left-80 md:w-[calc(100%-18rem)] 2xl:w-[calc(100%-20rem)]"
          }`}
        />
        <VsDashboardSidebar
          activePath={activePath}
          items={effectiveNavItems}
          eyebrow={definition.eyebrow}
          badgeByKey={badgeByKey}
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
          sidebarWidth={sidebarWidth}
        />
      </div>
      <main
        className={`min-h-screen px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-20 transition-all duration-300 md:pb-16 print:p-0 ${
          isCollapsed
            ? "md:ml-20"
            : sidebarWidth === "compact240" ? "md:ml-60" : "md:ml-72 2xl:ml-80"
        } sm:px-6 lg:px-8 print:md:ml-0 ${
          printFriendly ? "owner-shell-main" : ""
        }`}
      >
        <div
          className={`w-full ${
            sidebarWidth === "compact240" ? "space-y-6" : "space-y-8"
          } ${printFriendly ? "owner-shell-content" : ""}`}
        >
          {children}
        </div>
      </main>
      <nav aria-label="Điều hướng" className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-50 flex items-stretch justify-around gap-1 rounded-2xl border border-[#e8b363]/15 bg-[#17201b]/95 p-2 text-[#fff8e8] shadow-[0_18px_50px_rgba(232,179,99,0.18),0_18px_50px_rgba(23,32,27,0.28)] backdrop-blur-xl print:hidden md:hidden">
        {effectiveNavItems.slice(0, effectiveNavItems.length > 4 ? 3 : 4).map((item) => {
          const active = isNavItemActive(item.href, activePath, effectiveNavItems);
          const badge = badgeByKey[item.key] ?? 0;
          return (
            <Link
              key={item.key}
              href={item.href}
              prefetch={true}
              className={`relative flex min-h-11 min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-center text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                active ? "bg-[#f8f1e6] text-[#17201b]" : "text-[#d7cbb8]"
              }`}
            >
              <span className="relative">
                <VsIcon name={item.icon} className="text-xl" />
                {badge > 0 ? (
                  <span
                    className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e8b363] px-1 text-xs font-bold text-[#17201b] shadow"
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
        {effectiveNavItems.length > 4 ? (
          <details className="group min-w-0 flex-1">
            <summary className="flex min-h-11 cursor-pointer list-none flex-col items-center gap-1 rounded-xl px-1 py-2 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-white [&::-webkit-details-marker]:hidden">
              <VsIcon name="menu" className="text-xl" />
              <span className="whitespace-nowrap">Thêm</span>
            </summary>
            <div className="absolute inset-x-0 bottom-full mb-3 max-h-[calc(100dvh-10rem)] overflow-y-auto overscroll-contain rounded-2xl border border-white/20 bg-[#17201b] p-2 shadow-xl">
              {effectiveNavItems.slice(3).map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={isNavItemActive(item.href, activePath, effectiveNavItems) ? "page" : undefined}
                  onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}
                  className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-3 text-base font-semibold hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                >
                  <VsIcon name={item.icon} className="text-xl" />
                  <span className="min-w-0 flex-1 break-words">{item.label}</span>
                  {(badgeByKey[item.key] ?? 0) > 0 ? <span className="text-sm">{badgeByKey[item.key]}</span> : null}
                </Link>
              ))}
            </div>
          </details>
        ) : null}
      </nav>
    </div>
  );
}
