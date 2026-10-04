"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { useWorkspaceProfile } from "@/features/workspace/components/workspace-profile-context";
import {
  HOTEL_CHANNEL_MANAGER,
  hasHotelFeature,
} from "@/features/hotel-features/hotel-features";
import { AriPushCard } from "../components/ari-push-card";
import { InventoryGrid } from "../components/inventory-grid";
import { OtaBookingsTab } from "../components/ota-bookings-tab";
import { ChannexHubTab } from "../components/channex-hub-tab";
import { useChannex } from "../hooks/use-channel-manager";
import {
  resolveChannelManagerAccess,
  type ChannelManagerTabId,
} from "../utils/channel-manager-access";

interface ChannelManagerPageProps {
  hotelId: string;
  baseRoutePrefix?: string;
  roleScope?: "owner" | "admin";
}

interface TabDefinition {
  id: ChannelManagerTabId;
  label: string;
  icon: string;
  badge?: string;
  badgeColor?: string;
}

const TAB_CONFIG: Record<
  ChannelManagerTabId,
  { label: string; icon: string }
> = {
  BOOKINGS: {
    label: "Đơn đặt phòng OTA",
    icon: "concierge",
  },
  ARI: {
    label: "Giá & Quỹ phòng",
    icon: "bed",
  },
  CHANNELS: {
    label: "Kênh bán phòng",
    icon: "hub",
  },
};

function ChannelManagerContent({
  hotelId,
  baseRoutePrefix = "/owner/hotels",
  roleScope = "owner",
}: ChannelManagerPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessibleHotels = [], hotelName, permissions = [] } = useWorkspaceProfile();
  const currentHotel = accessibleHotels.find((hotel) => hotel.id === hotelId);
  const currentDisplayName =
    currentHotel?.name || hotelName || "Khách sạn hiện tại";
  const isFeatureEnabled = currentHotel
    ? hasHotelFeature(currentHotel.enabledFeatures, HOTEL_CHANNEL_MANAGER)
    : true;

  const access = useMemo(() => {
    return resolveChannelManagerAccess(permissions, {
      allowPlatformAdmin: roleScope === "admin",
    });
  }, [permissions, roleScope]);

  const { visibleTabs } = access;

  const defaultTab: ChannelManagerTabId = visibleTabs.includes("ARI")
    ? "ARI"
    : (visibleTabs[0] ?? "BOOKINGS");

  const storageKey = `vietsage_cm_tab_${hotelId}`;
  const rawUrlTab = searchParams.get("tab")?.toUpperCase() as ChannelManagerTabId;
  const validUrlTab: ChannelManagerTabId | null = visibleTabs.includes(rawUrlTab)
    ? rawUrlTab
    : null;

  const [userSelectedTab, setUserSelectedTab] = useState<ChannelManagerTabId>(() => {
    if (validUrlTab) return validUrlTab;
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(storageKey) as ChannelManagerTabId;
        if (saved && visibleTabs.includes(saved)) {
          return saved;
        }
      } catch {
        // Ignore storage errors
      }
    }
    return defaultTab;
  });

  const activeTab: ChannelManagerTabId =
    validUrlTab ??
    (visibleTabs.includes(userSelectedTab) ? userSelectedTab : defaultTab);

  // Load bookings count for badge
  const { simulatedBookings } = useChannex(hotelId, roleScope, {
    loadSimulatedBookings: visibleTabs.includes("BOOKINGS"),
  });

  const activeBookingsCount = useMemo(() => {
    return simulatedBookings.filter(
      (b) => (b.status || "").toUpperCase() === "CONFIRMED",
    ).length;
  }, [simulatedBookings]);

  const handleTabChange = (tab: ChannelManagerTabId) => {
    if (!visibleTabs.includes(tab)) return;
    setUserSelectedTab(tab);
    try {
      localStorage.setItem(storageKey, tab);
    } catch {
      // Ignore storage errors
    }
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState(null, "", url.toString());
    }
  };

  const tabs: TabDefinition[] = useMemo(() => {
    const bookingsBadge =
      simulatedBookings.length > 0
        ? activeBookingsCount > 0
          ? `${simulatedBookings.length} đơn (${activeBookingsCount} giữ)`
          : `${simulatedBookings.length} đơn`
        : undefined;

    return visibleTabs.map((tabId) => ({
      id: tabId,
      label: TAB_CONFIG[tabId].label,
      icon: TAB_CONFIG[tabId].icon,
      badge: tabId === "BOOKINGS" ? bookingsBadge : undefined,
      badgeColor:
        tabId === "BOOKINGS"
          ? "bg-emerald-100 text-emerald-800 border-emerald-300"
          : undefined,
    }));
  }, [visibleTabs, simulatedBookings.length, activeBookingsCount]);

  if (!isFeatureEnabled) {
    return (
      <div className="space-y-6 pb-24">
        <section
          data-ui="feature-disabled-notice"
          className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center shadow-sm"
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
            <VsIcon name="lock" className="text-3xl" />
          </div>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-amber-950">
            Channel Manager chưa được kích hoạt
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-amber-900">
            Tính năng phân phối OTA chưa được mở cho “{currentDisplayName}”.
            Liên hệ quản trị viên nền tảng để kích hoạt.
          </p>
          <button
            type="button"
            onClick={() =>
              router.push(
                baseRoutePrefix === "/owner/hotels"
                  ? "/owner/dashboard"
                  : `/hotels/${hotelId}/rooms`,
              )
            }
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-800 px-6 text-base font-bold text-white hover:bg-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-600/40 cursor-pointer"
          >
            <VsIcon name="arrow_back" className="text-lg" />
            Về màn hình chính
          </button>
        </section>
      </div>
    );
  }

  if (visibleTabs.length === 0) {
    return (
      <div className="space-y-6 pb-24">
        <section
          data-ui="access-denied-notice"
          className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-800">
            <VsIcon name="lock" className="text-3xl" />
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">
            Không có quyền truy cập Channel Manager
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            Tài khoản của bạn chưa được cấp quyền quản lý hoặc xem kênh bán phòng cho khách sạn này.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <header className="rounded-2xl border border-[#e5ddcd] bg-white p-5 shadow-xs">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#17201b]">
              {visibleTabs.length === 1 && visibleTabs[0] === "BOOKINGS"
                ? "Đơn đặt phòng OTA"
                : "Channel Manager"}
            </h1>
            <p className="text-sm text-[#5a6760] font-medium">
              {currentDisplayName}
            </p>
          </div>
        </div>
      </header>

      {/* Tabs Navigation (only show when multiple tabs exist) */}
      {tabs.length > 1 && (
        <nav
          role="tablist"
          aria-label="Channel Manager Sections"
          className="flex gap-2 overflow-x-auto border-b border-[#e5ddcd] pb-px"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`channel-manager-tab-${tab.id.toLowerCase()}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls="channel-manager-tab-panel"
                onClick={() => handleTabChange(tab.id)}
                className={`min-h-11 shrink-0 flex items-center gap-2 rounded-t-xl border-b-2 px-4 py-2.5 text-sm font-bold transition-all focus:outline-none focus:ring-2 focus:ring-[#735c00]/30 cursor-pointer ${
                  isActive
                    ? "border-[#735c00] bg-white text-[#735c00] shadow-2xs font-extrabold"
                    : "border-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <VsIcon name={tab.icon} className="text-base" />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold border ${
                      tab.badgeColor || "bg-gray-100 text-gray-700 border-gray-300"
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      )}

      {/* Tab Panels */}
      <div
        id="channel-manager-tab-panel"
        role="tabpanel"
        aria-labelledby={`channel-manager-tab-${activeTab.toLowerCase()}`}
      >
        {activeTab === "ARI" && visibleTabs.includes("ARI") && (
          <div className="space-y-6">
            {/* Quick banner notice about incoming bookings */}
            {simulatedBookings.length > 0 && visibleTabs.includes("BOOKINGS") && (
              <div className="flex flex-col gap-3 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50/80 via-white to-blue-50/40 p-4 text-xs sm:flex-row sm:items-center sm:justify-between shadow-2xs">
                <div className="flex items-center gap-2.5 text-blue-900">
                  <VsIcon name="concierge" className="text-lg text-blue-800" />
                  <span>
                    Khách sạn có <strong>{simulatedBookings.length} đơn đặt phòng OTA</strong> (bao gồm {activeBookingsCount} đơn đang chiếm phòng thực tế).
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleTabChange("BOOKINGS")}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-3.5 py-1.5 font-bold text-white shadow-2xs hover:bg-blue-800 transition text-xs cursor-pointer"
                >
                  <span>Xem danh sách đơn OTA</span>
                  <VsIcon name="arrow_forward" className="text-sm" />
                </button>
              </div>
            )}

            {access.canManageChannels && (
              <AriPushCard hotelId={hotelId} roleScope={roleScope} />
            )}
            <InventoryGrid
              hotelId={hotelId}
              roleScope={roleScope}
              canManage={access.canManageInventory}
            />
          </div>
        )}

        {activeTab === "BOOKINGS" && visibleTabs.includes("BOOKINGS") && (
          <OtaBookingsTab
            hotelId={hotelId}
            roleScope={roleScope}
            baseRoutePrefix={baseRoutePrefix}
            onSwitchToAri={visibleTabs.includes("ARI") ? () => handleTabChange("ARI") : undefined}
            showTechnicalTools={access.canManageChannels}
          />
        )}

        {activeTab === "CHANNELS" && visibleTabs.includes("CHANNELS") && (
          <ChannexHubTab
            hotelId={hotelId}
            roleScope={roleScope}
            canManage={access.canManageChannels}
          />
        )}
      </div>
    </div>
  );
}

export function ChannelManagerPage(props: ChannelManagerPageProps) {
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-xs text-gray-500">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          <p className="mt-3 font-semibold text-gray-700">Đang tải Channel Manager...</p>
        </div>
      }
    >
      <ChannelManagerContent {...props} />
    </Suspense>
  );
}
