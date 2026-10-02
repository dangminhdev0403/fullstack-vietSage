"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Hotel } from "@/features/admin/types/admin-contract";
import { AriPushCard } from "@/features/channel-manager/components/ari-push-card";
import { ChannexHubTab } from "@/features/channel-manager/components/channex-hub-tab";
import { ChannexPropertyConfigCard } from "@/features/channel-manager/components/channex-property-config-card";
import { InventoryGrid } from "@/features/channel-manager/components/inventory-grid";
import { useOwnerRequestRealtime } from "@/features/request-realtime/use-owner-request-realtime";
import { invalidateHotelRealtimeQueries } from "@/features/hotel-ops/utils/invalidate-hotel-realtime-queries";

const STORAGE_KEY_HOTEL = "vietsage_admin_selected_cm_hotel_id";
const STORAGE_KEY_TAB = "vietsage_admin_selected_cm_tab";

type TabType = "SETUP" | "CHANNELS" | "ARI";

interface TabDefinition {
  id: TabType;
  label: string;
  icon: string;
  badge?: string;
  badgeColor?: string;
}

const TABS: TabDefinition[] = [
  { id: "SETUP", label: "Cấu hình Channex", icon: "⚙️" },
  { id: "CHANNELS", label: "Kênh OTA & Mapping", icon: "🌐" },
  { id: "ARI", label: "Giá & Quỹ phòng (ARI)", icon: "📊" },
];

export function AdminChannelManagerClient({
  initialHotels,
}: {
  initialHotels: Hotel[];
}) {
  const queryClient = useQueryClient();

  const [selectedHotelId, setSelectedHotelId] = useState<string>(
    () => initialHotels[0]?.id || "",
  );
  const [activeTab, setActiveTab] = useState<TabType>("SETUP");
  const [isHydrated, setIsHydrated] = useState<boolean>(false);

  // Restore saved hotel and tab from localStorage
  useEffect(() => {
    try {
      const savedHotel = localStorage.getItem(STORAGE_KEY_HOTEL);
      if (savedHotel && initialHotels.some((h) => h.id === savedHotel)) {
        setSelectedHotelId(savedHotel);
      }
      const savedTab = localStorage.getItem(STORAGE_KEY_TAB) as TabType | null;
      if (savedTab && TABS.some((t) => t.id === savedTab)) {
        setActiveTab(savedTab);
      }
    } catch {
      // Ignore localStorage errors
    } finally {
      setIsHydrated(true);
    }
  }, [initialHotels]);

  // Save selected hotel to localStorage
  useEffect(() => {
    if (!isHydrated || !selectedHotelId || typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY_HOTEL, selectedHotelId);
    } catch {
      // Ignore localStorage errors
    }
  }, [isHydrated, selectedHotelId]);

  // Save active tab to localStorage
  useEffect(() => {
    if (!isHydrated || typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY_TAB, activeTab);
    } catch {
      // Ignore localStorage errors
    }
  }, [isHydrated, activeTab]);

  const selectedHotel = useMemo(
    () =>
      initialHotels.find((hotel) => hotel.id === selectedHotelId) ??
      initialHotels[0],
    [initialHotels, selectedHotelId],
  );

  // Realtime WebSocket synchronization for the currently active hotel (silent data refresh only - alerts belong to frontdesk & tenant)
  const realtimeHandlers = useMemo(
    () => ({
      onChannelBookingCreated: (event: unknown) => {
        const raw = event as { hotelId?: string } | null;
        if (raw?.hotelId && raw.hotelId !== selectedHotelId) return;

        void invalidateHotelRealtimeQueries(queryClient, selectedHotelId);
        void queryClient.invalidateQueries({
          queryKey: ["vietsage", "hotel", selectedHotelId],
          refetchType: "all",
        });
        void queryClient.refetchQueries({
          queryKey: ["vietsage", "hotel", selectedHotelId],
        });
      },
      onChannelBookingCancelled: (event: unknown) => {
        const raw = event as { hotelId?: string } | null;
        if (raw?.hotelId && raw.hotelId !== selectedHotelId) return;

        void invalidateHotelRealtimeQueries(queryClient, selectedHotelId);
        void queryClient.invalidateQueries({
          queryKey: ["vietsage", "hotel", selectedHotelId],
          refetchType: "all",
        });
        void queryClient.refetchQueries({
          queryKey: ["vietsage", "hotel", selectedHotelId],
        });
      },
    }),
    [queryClient, selectedHotelId],
  );

  useOwnerRequestRealtime(selectedHotelId, realtimeHandlers, {
    enabled: Boolean(selectedHotelId),
    showConnectionToasts: false,
  });

  if (!selectedHotel) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--outline-variant)] bg-white p-12 text-center">
        <span className="text-4xl text-gray-400">🏨</span>
        <h2 className="mt-3 text-2xl font-bold text-[var(--on-surface)]">
          Chưa có khách sạn nào trên hệ thống
        </h2>
        <p className="mt-2 text-base text-[var(--on-surface-variant)]">
          Vui lòng tạo khách sạn trước khi thiết lập và vận hành Channel Manager.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Hotel Selector & Quick Health Card */}
      <section className="rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="w-full max-w-2xl">
            <label
              htmlFor="hotel-selector"
              className="block text-xs font-bold uppercase tracking-wider text-[var(--on-surface-variant)]"
            >
              Chọn Khách Sạn & Đơn Vị Quản Lý (Tenant)
            </label>
            <div className="mt-2 flex items-center gap-3">
              <select
                id="hotel-selector"
                value={selectedHotelId}
                onChange={(event) => setSelectedHotelId(event.target.value)}
                className="block min-h-11 w-full rounded-xl border border-[var(--outline-variant)] bg-white px-4 text-base font-semibold text-[var(--on-surface)] shadow-xs transition focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
              >
                {initialHotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>
                    {hotel.name} — Chủ: {hotel.tenant?.name || "Chưa gán"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1 lg:pt-0 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 font-medium text-blue-800">
              <span className="font-bold">Chủ sở hữu:</span>
              <span>{selectedHotel.tenant?.name || "Chưa gán"}</span>
            </span>

            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-bold text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Realtime: KẾT NỐI</span>
            </span>

          </div>
        </div>
      </section>

      {/* Main Tab Navigation Bar */}
      <nav
        role="tablist"
        aria-label="Tác vụ Channel Manager"
        className="flex gap-2 overflow-x-auto border-b border-[var(--outline-variant)] pb-px"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`channel-manager-tab-${tab.id.toLowerCase()}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls="channel-manager-tab-panel"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-11 shrink-0 flex items-center gap-2 rounded-t-xl border-b-2 px-4 py-2.5 text-base font-bold transition-all focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 ${
                isActive
                  ? "border-[var(--primary)] bg-[var(--surface-container-lowest)] text-[var(--primary)] shadow-xs"
                  : "border-transparent text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)] hover:text-gray-900"
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
        {activeTab === "SETUP" && (
          <ChannexPropertyConfigCard
            key={`setup-${selectedHotel.id}`}
            hotelId={selectedHotel.id}
            hotelName={selectedHotel.name}
            roleScope="admin"
          />
        )}

        {activeTab === "ARI" && (
          <div className="space-y-5">
            <AriPushCard hotelId={selectedHotel.id} roleScope="admin" />
            <InventoryGrid
              key={`grid-${selectedHotel.id}`}
              hotelId={selectedHotel.id}
              roleScope="admin"
            />
          </div>
        )}

        {activeTab === "CHANNELS" && (
          <ChannexHubTab
            key={`channels-${selectedHotel.id}`}
            hotelId={selectedHotel.id}
            roleScope="admin"
          />
        )}
      </div>
    </div>
  );
}
