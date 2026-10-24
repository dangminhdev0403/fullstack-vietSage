"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import type { Hotel } from "@/features/admin/types/admin-contract";
import type {
  HotelRoomSummary,
  HotelServiceCategory,
  HotelServiceItem,
} from "@/features/hotel-ops/types/hotel-ops-contract";
import { OwnerRoomsClient } from "../room-management/owner-rooms-client";
import { StaffManagementClient } from "@/features/staff-management/components/staff-management-client";
import { OwnerServiceCatalogClient } from "../services/owner-service-catalog-client";
import { OwnerNearbyProvidersClient } from "@/features/local-partners/components/staff-local-partners-client";
import { KbttConnectionPage } from "@/features/kbtt/components/kbtt-connection-page";
import { ChannexHubTab } from "@/features/channel-manager/components/channex-hub-tab";

export type OwnerSettingsTab =
  | "rooms"
  | "staff"
  | "services"
  | "partners"
  | "integrations";

type Props = {
  hotelId: string;
  hotel: Readonly<Hotel>;
  tenantId: string | null;
  initialRooms: HotelRoomSummary[];
  initialCategories: HotelServiceCategory[];
  initialItems: HotelServiceItem[];
  canManageStaff: boolean;
  canManagePartners: boolean;
  canManageKbtt: boolean;
  canManageChannels: boolean;
};

const SETTINGS_TABS: Array<{
  id: OwnerSettingsTab;
  label: string;
  icon: string;
  description: string;
}> = [
  {
    id: "rooms",
    label: "Cấu hình phòng",
    icon: "meeting_room",
    description: "Quản lý danh mục hạng phòng, giá niêm yết và số lượng phòng vật lý.",
  },
  {
    id: "staff",
    label: "Nhân viên & Phân công",
    icon: "badge",
    description: "Thêm nhân viên, cấp tài khoản và phân quyền quản trị vận hành.",
  },
  {
    id: "services",
    label: "Danh mục dịch vụ",
    icon: "room_service",
    description: "Cấu hình menu tiện ích, đồ uống, dịch vụ kèm giá bán cho khách.",
  },
  {
    id: "partners",
    label: "Đối tác liên kết",
    icon: "handshake",
    description: "Kết nối nhà cung cấp tour, xe, giặt là và các dịch vụ địa phương.",
  },
  {
    id: "integrations",
    label: "Tích hợp hệ thống",
    icon: "hub",
    description: "Cấu hình khai báo lưu trú KBTT Công an và phân phối đa kênh OTA (Channex).",
  },
];

export function OwnerHotelSettingsClient({
  hotelId,
  hotel,
  tenantId,
  initialRooms,
  initialCategories,
  initialItems,
  canManageStaff,
  canManagePartners,
  canManageKbtt,
  canManageChannels,
}: Props) {
  const searchParams = useSearchParams();
  const rawTab = (searchParams.get("tab") || "").toLowerCase() as OwnerSettingsTab;
  const initialTab: OwnerSettingsTab = SETTINGS_TABS.some((t) => t.id === rawTab)
    ? rawTab
    : "rooms";

  const [activeTab, setActiveTab] = useState<OwnerSettingsTab>(initialTab);
  const [integrationsSubTab, setIntegrationsSubTab] = useState<"kbtt" | "channels">("kbtt");

  const handleTabChange = (tab: OwnerSettingsTab) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState(null, "", url.toString());
    }
  };

  const currentTabMeta = useMemo(
    () => SETTINGS_TABS.find((t) => t.id === activeTab) || SETTINGS_TABS[0],
    [activeTab],
  );

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--secondary)]">
          CÀI ĐẶT CHỦ KHÁCH SẠN
        </p>
        <h1 className="vs-display mt-2 text-4xl font-semibold text-[var(--primary)] text-balance">
          Thiết lập khách sạn
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--on-surface-variant)] text-pretty">
          Quản lý các thành phần vận hành: cơ sở vật chất, nhân sự, dịch vụ và cổng kết nối đối tác.
        </p>
      </header>

      {/* Tabs Bar */}
      <nav
        role="tablist"
        aria-label="Cài đặt khách sạn"
        className="flex gap-1.5 overflow-x-auto border-b border-[#e5ddcd] pb-px scrollbar-thin"
      >
        {SETTINGS_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => handleTabChange(tab.id)}
              className={`min-h-11 shrink-0 flex items-center gap-2 rounded-t-xl border-b-2 px-4 py-2.5 text-xs sm:text-sm font-bold transition-all focus:outline-none focus:ring-2 focus:ring-[#735c00]/30 cursor-pointer whitespace-nowrap ${
                isActive
                  ? "border-[#735c00] bg-white text-[#735c00] shadow-2xs font-black"
                  : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <VsIcon name={tab.icon} className="text-base" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Tab Panels */}
      <div className="space-y-6">
        {activeTab === "rooms" && (
          <section className="space-y-4">
            <OwnerRoomsClient
              hotelId={hotelId}
              initialRooms={initialRooms}
              surfaceMode="settings"
            />
          </section>
        )}

        {activeTab === "staff" && (
          <section className="space-y-4">
            {tenantId ? (
              <StaffManagementClient
                scope={{ surface: "owner", tenantId }}
                canManage={canManageStaff}
                initialHotelId={hotelId}
                onHotelPath={`/owner/hotels/${encodeURIComponent(hotelId)}/settings?tab=staff`}
              />
            ) : (
              <div className="rounded-xl bg-[var(--surface-container-low)] p-8 text-center text-xs text-[var(--on-surface-variant)]">
                Không tìm thấy thông tin đơn vị quản lý khách sạn này.
              </div>
            )}
          </section>
        )}

        {activeTab === "services" && (
          <section className="space-y-4">
            <OwnerServiceCatalogClient
              hotelId={hotelId}
              hasGoogleSheetConfig={Boolean(hotel.googleSheetId)}
              initialCategories={initialCategories}
              initialItems={initialItems}
            />
          </section>
        )}

        {activeTab === "partners" && (
          <section className="space-y-4">
            <OwnerNearbyProvidersClient
              hotelId={hotelId}
              canManage={canManagePartners}
              canSettle={false}
            />
          </section>
        )}

        {activeTab === "integrations" && (
          <section className="space-y-6">
            <div className="flex gap-2 border-b border-slate-200 pb-2">
              <button
                type="button"
                onClick={() => setIntegrationsSubTab("kbtt")}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  integrationsSubTab === "kbtt"
                    ? "bg-[#123d2a] text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <VsIcon name="security" className="text-base" />
                <span>Khai báo lưu trú KBTT</span>
              </button>
              <button
                type="button"
                onClick={() => setIntegrationsSubTab("channels")}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  integrationsSubTab === "channels"
                    ? "bg-[#123d2a] text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <VsIcon name="hub" className="text-base" />
                <span>Kênh bán phòng OTA (Channex)</span>
              </button>
            </div>

            {integrationsSubTab === "kbtt" ? (
              <KbttConnectionPage
                hotelId={hotelId}
                canManage={canManageKbtt}
                canManageAutoSubmit={canManageKbtt}
              />
            ) : (
              <ChannexHubTab
                hotelId={hotelId}
                roleScope="owner"
                canManage={canManageChannels}
              />
            )}
          </section>
        )}
      </div>
    </div>
  );
}
