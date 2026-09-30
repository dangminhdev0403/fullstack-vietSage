"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
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
import { OtaBookingSimulator } from "../components/ota-booking-simulator";
import { useChannex } from "../hooks/use-channel-manager";

interface ChannelManagerPageProps {
  hotelId: string;
  baseRoutePrefix?: string;
  roleScope?: "owner" | "admin";
}

type TabType = "ARI" | "BOOKINGS" | "CHANNELS" | "SIMULATOR";

interface TabDefinition {
  id: TabType;
  label: string;
  icon: string;
  badge?: string;
  badgeColor?: string;
}

function ChannelManagerContent({
  hotelId,
  baseRoutePrefix = "/owner/hotels",
  roleScope = "owner",
}: ChannelManagerPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessibleHotels = [], hotelName } = useWorkspaceProfile();
  const currentHotel = accessibleHotels.find((hotel) => hotel.id === hotelId);
  const currentDisplayName =
    currentHotel?.name || hotelName || "Khách sạn hiện tại";
  const isFeatureEnabled = currentHotel
    ? hasHotelFeature(currentHotel.enabledFeatures, HOTEL_CHANNEL_MANAGER)
    : true;

  const storageKey = `vietsage_cm_tab_${hotelId}`;
  const [activeTab, setActiveTab] = useState<TabType>("ARI");
  const [isHydrated, setIsHydrated] = useState(false);

  // Load bookings count for badge
  const { simulatedBookings } = useChannex(hotelId, roleScope, {
    loadSimulatedBookings: true,
  });

  const activeBookingsCount = useMemo(() => {
    return simulatedBookings.filter(
      (b) => (b.status || "").toUpperCase() === "CONFIRMED",
    ).length;
  }, [simulatedBookings]);

  // Handle URL param ?tab= and localStorage
  useEffect(() => {
    try {
      const urlTab = searchParams.get("tab")?.toUpperCase() as TabType | null;
      if (urlTab && ["ARI", "BOOKINGS", "CHANNELS"].includes(urlTab)) {
        setActiveTab(urlTab);
      } else {
        const saved = localStorage.getItem(storageKey) as TabType | null;
        if (saved && ["ARI", "BOOKINGS", "CHANNELS"].includes(saved)) {
          setActiveTab(saved);
        }
      }
    } catch {
      // Ignore storage errors
    } finally {
      setIsHydrated(true);
    }
  }, [searchParams, storageKey]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    try {
      localStorage.setItem(storageKey, tab);
    } catch {
      // Ignore storage errors
    }
  };

  const tabs: TabDefinition[] = useMemo(() => [
    { id: "ARI", label: "Giá & Quỹ phòng (ARI Grid)", icon: "📊" },
    {
      id: "BOOKINGS",
      label: "Đơn đặt phòng OTA",
      icon: "🛎️",
      badge:
        simulatedBookings.length > 0
          ? `${simulatedBookings.length} đơn (${activeBookingsCount} giữ)`
          : undefined,
      badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-300",
    },
    { id: "CHANNELS", label: "Kênh OTA & Mapping", icon: "🌐" },
  ], [simulatedBookings.length, activeBookingsCount]);

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
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-800 px-6 text-base font-bold text-white hover:bg-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-600/40"
          >
            <VsIcon name="arrow_back" className="text-lg" />
            Về màn hình chính
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <header className="rounded-2xl border border-[#e5ddcd] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-[#735c00]">
              Channel Manager • Phân Phối OTA
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#17201b]">
              Kho Phòng, Giá Bán & Đơn Đặt Phòng OTA
            </h1>
            <p className="mt-2 text-base text-[#5a6760]">
              {currentDisplayName}. Quản lý trực tiếp quỹ phòng trống (ARI Grid), theo dõi đơn đặt phòng từ Booking.com, Trip.com, Agoda và quản lý kênh bán.
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Đồng bộ 2 chiều Active</span>
            </span>
          </div>
        </div>
      </header>

      {/* Tabs Navigation */}
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
              <span>{tab.icon}</span>
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

      {/* Tab Panels */}
      <div
        id="channel-manager-tab-panel"
        role="tabpanel"
        aria-labelledby={`channel-manager-tab-${activeTab.toLowerCase()}`}
      >
        {activeTab === "ARI" && (
          <div className="space-y-6">
            {/* Quick banner notice about incoming bookings */}
            {simulatedBookings.length > 0 && (
              <div className="flex flex-col gap-3 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50/80 via-white to-blue-50/40 p-4 text-xs sm:flex-row sm:items-center sm:justify-between shadow-2xs">
                <div className="flex items-center gap-2.5 text-blue-900">
                  <span className="text-xl">🛎️</span>
                  <span>
                    Khách sạn có <strong>{simulatedBookings.length} đơn đặt phòng OTA</strong> (bao gồm {activeBookingsCount} đơn đang chiếm phòng thực tế).
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleTabChange("BOOKINGS")}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-3.5 py-1.5 font-bold text-white shadow-2xs hover:bg-blue-800 transition text-xs"
                >
                  <span>Xem danh sách đơn OTA</span>
                  <VsIcon name="arrow_forward" className="text-sm" />
                </button>
              </div>
            )}

            <AriPushCard hotelId={hotelId} roleScope={roleScope} />
            <InventoryGrid hotelId={hotelId} roleScope={roleScope} />
          </div>
        )}

        {activeTab === "BOOKINGS" && (
          <OtaBookingsTab
            hotelId={hotelId}
            roleScope={roleScope}
            onSwitchToAri={() => handleTabChange("ARI")}
          />
        )}

        {activeTab === "CHANNELS" && (
          <ChannexHubTab hotelId={hotelId} roleScope={roleScope} />
        )}

        {activeTab === "SIMULATOR" && (
          <OtaBookingSimulator
            hotelId={hotelId}
            hotelName={currentDisplayName}
            roleScope={roleScope}
            onSwitchTab={(t: "SETUP" | "ARI" | "SIMULATOR" | "CHANNELS" | "ICAL") => {
              if (t === "ARI") handleTabChange("ARI");
              else if (t === "CHANNELS") handleTabChange("CHANNELS");
            }}
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
