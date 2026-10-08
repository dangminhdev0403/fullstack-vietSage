"use client";

import { useId, useMemo, useState } from "react";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { AriPushCard } from "@/features/channel-manager/components/ari-push-card";
import { ChannexHubTab } from "@/features/channel-manager/components/channex-hub-tab";
import { ChannexPropertyConfigCard } from "@/features/channel-manager/components/channex-property-config-card";
import { OtaBookingsTab } from "@/features/channel-manager/components/ota-bookings-tab";
import { useAdminChannelManagerOverview } from "@/features/channel-manager/admin/hooks/use-admin-channel-manager-overview";
import {
  FRIENDLY_STATE_LABELS,
  PRIMARY_ISSUE_LABELS,
  getContextualTab,
  getPrimaryActionLabel,
  isEmptyFleet,
  isFilteredEmpty,
  type DrillDownTab,
} from "@/features/channel-manager/admin/api/admin-channel-manager.repository";
import type {
  AdminChannelOverviewItem,
  AdminChannelOverviewState,
} from "@/features/channel-manager/admin/types/admin-channel-manager.types";

interface AdminChannelManagerClientProps {
  canManage?: boolean;
}

function formatLastSync(isoString: string | null): { time: string; date: string } | null {
  if (!isoString) return null;
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return null;
    const time = new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
    const day = new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
    return { time, date: day };
  } catch {
    return null;
  }
}

function formatLastSyncText(isoString: string | null): string {
  const parsed = formatLastSync(isoString);
  if (!parsed) return "Chưa đồng bộ";
  return `${parsed.time} ${parsed.date}`;
}

function formatTenantName(name: string): string {
  if (!name || name === "TENANT_OWNER") return "Chủ cơ sở (Owner)";
  return name;
}

export function AdminChannelManagerClient({
  canManage = false,
}: AdminChannelManagerClientProps) {
  const searchInputId = useId();
  const stateFilterId = useId();

  // Filter and pagination state
  const [searchTerm, setSearchTerm] = useState("");
  const [filterState, setFilterState] = useState<AdminChannelOverviewState | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const limit = 25;

  // Selected hotel for drill-down view
  const [selectedHotel, setSelectedHotel] = useState<AdminChannelOverviewItem | null>(null);
  const [drillDownTab, setDrillDownTab] = useState<DrillDownTab>("OVERVIEW");

  // Query overview data via query-resource
  const queryPayload = useMemo(() => {
    return {
      q: searchTerm.trim() ? searchTerm.trim() : undefined,
      state: filterState !== "ALL" ? filterState : undefined,
      page,
      limit,
    };
  }, [searchTerm, filterState, page, limit]);

  const {
    overview,
    summary,
    items,
    total,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useAdminChannelManagerOverview({
    query: queryPayload,
    enabled: !selectedHotel,
  });

  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Reset page on filter changes
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setPage(1);
  };

  const handleStateFilterChange = (value: AdminChannelOverviewState | "ALL") => {
    setFilterState(value);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchTerm("");
    setFilterState("ALL");
    setPage(1);
  };

  // Open hotel: resets or chooses the correct contextual tab
  const handleOpenHotel = (
    item: AdminChannelOverviewItem,
    explicitTab?: DrillDownTab,
  ) => {
    setSelectedHotel(item);
    setDrillDownTab(explicitTab ?? getContextualTab(item));
  };

  // State badge styling
  const renderStateBadge = (state: AdminChannelOverviewState) => {
    switch (state) {
      case "ACTIVE":
        return (
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/80 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 shadow-2xs">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            {FRIENDLY_STATE_LABELS.ACTIVE}
          </span>
        );
      case "ATTENTION":
        return (
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/80 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 shadow-2xs">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            {FRIENDLY_STATE_LABELS.ATTENTION}
          </span>
        );
      case "INTERRUPTED":
        return (
          <span className="inline-flex items-center gap-2 rounded-full border border-rose-300/80 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-800 shadow-2xs">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            {FRIENDLY_STATE_LABELS.INTERRUPTED}
          </span>
        );
      case "SETTING_UP":
        return (
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/80 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800 shadow-2xs">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            {FRIENDLY_STATE_LABELS.SETTING_UP}
          </span>
        );
      case "UNCONFIGURED":
      default:
        return (
          <span className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700 shadow-2xs">
            <span className="h-2 w-2 rounded-full bg-stone-400" />
            {FRIENDLY_STATE_LABELS.UNCONFIGURED}
          </span>
        );
    }
  };

  // Issue description
  const renderIssueDescription = (item: AdminChannelOverviewItem) => {
    if (!item.primaryIssueCode) {
      return (
        <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-3 py-1.5 text-xs">
          <VsIcon name="check_circle" className="text-sm text-emerald-600 shrink-0" />
          <span className="text-emerald-900 font-medium">
            <strong className="font-bold">Bình thường</strong>
            <span className="text-emerald-700 ml-1.5 font-normal">
              ({item.mappedRoomTypes} phòng, {item.mappedRatePlans} gói giá)
            </span>
          </span>
        </div>
      );
    }

    const label = PRIMARY_ISSUE_LABELS[item.primaryIssueCode] || item.primaryIssueCode;

    switch (item.primaryIssueCode) {
      case "PROPERTY_MISSING":
        return (
          <div className="inline-flex items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-1.5 text-xs text-amber-900">
            <VsIcon name="warning" className="text-sm text-amber-600 shrink-0" />
            <span className="font-semibold">{label}</span>
          </div>
        );
      case "MAPPING_INCOMPLETE":
        return (
          <div className="inline-flex flex-col gap-0.5 rounded-xl border border-blue-200/80 bg-blue-50/70 px-3 py-1.5 text-xs text-blue-900">
            <span className="inline-flex items-center gap-1.5 font-bold">
              <VsIcon name="sync_alt" className="text-sm text-blue-600 shrink-0" />
              <span>{label}</span>
            </span>
            <span className="text-[11px] font-normal text-blue-700">
              Đã ghép: {item.mappedRoomTypes} phòng, {item.mappedRatePlans} gói giá
            </span>
          </div>
        );
      case "RECONCILIATION_REQUIRED":
        return (
          <div className="inline-flex items-center gap-2 rounded-xl border border-orange-200/80 bg-orange-50/70 px-3 py-1.5 text-xs text-orange-900">
            <VsIcon name="receipt_long" className="text-sm text-orange-600 shrink-0" />
            <span className="font-bold">{label} ({item.pendingReconciliations} đơn chờ)</span>
          </div>
        );
      case "SYNC_FAILED":
        return (
          <div className="inline-flex items-center gap-2 rounded-xl border border-rose-200/80 bg-rose-50/70 px-3 py-1.5 text-xs text-rose-900">
            <VsIcon name="error" className="text-sm text-rose-600 shrink-0" />
            <span className="font-bold">{label}</span>
          </div>
        );
      case "CONNECTION_INTERRUPTED":
      default:
        return (
          <div className="inline-flex items-center gap-2 rounded-xl border border-rose-200/80 bg-rose-50/70 px-3 py-1.5 text-xs text-rose-900">
            <VsIcon name="bolt" className="text-sm text-rose-600 shrink-0" />
            <span className="font-bold">{label}</span>
          </div>
        );
    }
  };

  // -------------------------------------------------------------
  // DRILL-DOWN VIEW (when a hotel is selected)
  // -------------------------------------------------------------
  if (selectedHotel) {
    return (
      <div className="space-y-6">
        {/* Navigation & Hotel Banner */}
        <section className="rounded-2xl border border-[#e8dfd1] bg-white/95 p-6 shadow-[0_12px_36px_rgba(23,32,27,0.04)] backdrop-blur-md">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setSelectedHotel(null)}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#e8dfd1] bg-[#fbf8f2] px-3.5 py-1.5 text-xs font-bold text-[#24473d] transition hover:bg-white shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#24473d]/30"
              >
                <VsIcon name="arrow_back" className="text-sm" />
                <span>Quay lại danh sách hạm đội</span>
              </button>

              <div className="mt-2 flex flex-wrap items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#24473d] text-[#e8b363] shadow-xs ring-2 ring-[#e8b363]/30">
                  <VsIcon name="hotel" className="text-lg" />
                </div>
                <h2 className="text-2xl font-black tracking-tight text-[#17201b]">
                  {selectedHotel.hotelName}
                </h2>
                <span className="rounded-lg bg-[#f4ede2] px-2.5 py-1 text-xs font-mono font-bold text-[#69726b]">
                  {selectedHotel.hotelCode}
                </span>
                {renderStateBadge(selectedHotel.state)}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-[#69726b]">
                <span className="inline-flex items-center gap-1.5">
                  <VsIcon name="apartment" className="text-sm text-[#8b948d]" />
                  <span>Chủ sở hữu:</span>
                  <strong className="font-semibold text-[#17201b]">{formatTenantName(selectedHotel.tenantName)}</strong>
                </span>
                <span>•</span>
                <span className="inline-flex items-center gap-1.5">
                  <VsIcon name="schedule" className="text-sm text-[#8b948d]" />
                  <span>Đồng bộ gần nhất:</span>
                  <strong className="font-semibold text-[#17201b]">{formatLastSyncText(selectedHotel.lastSyncAt)}</strong>
                </span>
              </div>
            </div>
          </div>

          {selectedHotel.primaryIssueCode && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900 shadow-2xs">
              <VsIcon name="warning" className="shrink-0 text-base text-amber-600 mt-0.5" />
              <div>
                <span className="font-bold">Cảnh báo vấn đề: </span>
                <span>
                  {PRIMARY_ISSUE_LABELS[selectedHotel.primaryIssueCode] || selectedHotel.primaryIssueCode}. Vui lòng kiểm tra các mục dưới đây để hoàn tất cấu hình.
                </span>
              </div>
            </div>
          )}
        </section>

        {/* Drill-down Navigation */}
        <nav
          aria-label="Tác vụ quản lý khách sạn"
          className="flex gap-2 border-b border-[#e5dcd0] pb-px overflow-x-auto"
        >
          {[
            { id: "OVERVIEW" as const, label: "Tổng quan & Checklist", icon: "fact_check" },
            { id: "CHANNELS" as const, label: "Kênh OTA & Ghép phòng", icon: "hub" },
            { id: "CONFIG" as const, label: "Cấu hình Channex", icon: "settings" },
            { id: "REPAIR" as const, label: "Khắc phục sự cố & Đối soát", icon: "build" },
          ].map((tab) => {
            const isActive = drillDownTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => setDrillDownTab(tab.id)}
                className={`min-h-11 shrink-0 flex items-center gap-2 rounded-t-xl border-b-2 px-4.5 py-2.5 text-sm font-bold transition-all focus:outline-none focus:ring-2 focus:ring-[#24473d]/30 ${
                  isActive
                    ? "border-[#24473d] bg-white text-[#24473d] shadow-2xs"
                    : "border-transparent text-[#69726b] hover:bg-white/60 hover:text-[#17201b]"
                }`}
              >
                <VsIcon name={tab.icon} className="text-base" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Drill-down Panels */}
        <div>
          {/* TAB 1: LOCAL OVERVIEW & CHECKLIST DRILL-DOWN (DEFAULT, MUTATION-FREE) */}
          {drillDownTab === "OVERVIEW" && (
            <section
              aria-label="Tổng quan & Checklist"
              className="space-y-6"
            >
              <div className="rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-6 shadow-xs">
                <h3 className="text-lg font-bold text-gray-900">
                  Tiến độ chuẩn hóa kết nối Channex
                </h3>
                <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
                  Bảng kiểm tra tình trạng kết nối, ánh xạ dữ liệu và vận hành hạm đội trước khi mở bán phòng.
                </p>

                <div className="mt-6 divide-y divide-gray-100">
                  {/* Checklist Step 1: Channex Property */}
                  <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {selectedHotel.propertyConfigured ? (
                          <VsIcon name="check_circle" className="text-xl text-emerald-600" />
                        ) : (
                          <VsIcon name="warning" className="text-xl text-amber-500" />
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900">
                          1. Khách sạn liên kết trên Channex (Property)
                        </h4>
                        <p className="text-xs text-[var(--on-surface-variant)]">
                          {selectedHotel.propertyConfigured
                            ? "Khách sạn đã được liên kết với Property ID hợp lệ trên Channex."
                            : "Chưa liên kết Property ID Channex. Cần tạo hoặc cấu hình ID trước khi ghép phòng."}
                        </p>
                      </div>
                    </div>
                    <div>
                      {!selectedHotel.propertyConfigured && (
                        <button
                          type="button"
                          onClick={() => setDrillDownTab("CONFIG")}
                          className="min-h-10 inline-flex items-center gap-1.5 rounded-xl border border-[var(--primary)] bg-[var(--primary)]/5 px-3 text-xs font-bold text-[var(--primary)] transition hover:bg-[var(--primary)] hover:text-white"
                        >
                          <span>Cấu hình Channex</span>
                          <VsIcon name="arrow_forward" className="text-xs" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Checklist Step 2: Room Types Mapping */}
                  <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {selectedHotel.mappedRoomTypes > 0 ? (
                          <VsIcon name="check_circle" className="text-xl text-emerald-600" />
                        ) : (
                          <VsIcon name="warning" className="text-xl text-amber-500" />
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900">
                          2. Ánh xạ loại phòng (Room Types)
                        </h4>
                        <p className="text-xs text-[var(--on-surface-variant)]">
                          {selectedHotel.mappedRoomTypes > 0
                            ? `Đã ánh xạ ${selectedHotel.mappedRoomTypes} loại phòng với Channex.`
                            : "Chưa có loại phòng nào được ghép nối. Các kênh OTA sẽ không nhận diện được phòng."}
                        </p>
                      </div>
                    </div>
                    <div>
                      {selectedHotel.mappedRoomTypes === 0 && (
                        <button
                          type="button"
                          onClick={() => setDrillDownTab("CHANNELS")}
                          className="min-h-10 inline-flex items-center gap-1.5 rounded-xl border border-[var(--primary)] bg-[var(--primary)]/5 px-3 text-xs font-bold text-[var(--primary)] transition hover:bg-[var(--primary)] hover:text-white"
                        >
                          <span>Ghép phòng</span>
                          <VsIcon name="arrow_forward" className="text-xs" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Checklist Step 3: Rate Plans Mapping */}
                  <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {selectedHotel.mappedRatePlans > 0 ? (
                          <VsIcon name="check_circle" className="text-xl text-emerald-600" />
                        ) : (
                          <VsIcon name="warning" className="text-xl text-amber-500" />
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900">
                          3. Ánh xạ gói giá (Rate Plans)
                        </h4>
                        <p className="text-xs text-[var(--on-surface-variant)]">
                          {selectedHotel.mappedRatePlans > 0
                            ? `Đã ánh xạ ${selectedHotel.mappedRatePlans} gói giá với Channex.`
                            : "Chưa ghép gói giá nào. Cần ghép gói giá để đẩy biểu giá ARI sang các kênh OTA."}
                        </p>
                      </div>
                    </div>
                    <div>
                      {selectedHotel.mappedRatePlans === 0 && (
                        <button
                          type="button"
                          onClick={() => setDrillDownTab("CHANNELS")}
                          className="min-h-10 inline-flex items-center gap-1.5 rounded-xl border border-[var(--primary)] bg-[var(--primary)]/5 px-3 text-xs font-bold text-[var(--primary)] transition hover:bg-[var(--primary)] hover:text-white"
                        >
                          <span>Ghép gói giá</span>
                          <VsIcon name="arrow_forward" className="text-xs" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Checklist Step 4: Reconciliations */}
                  <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {selectedHotel.pendingReconciliations === 0 ? (
                          <VsIcon name="check_circle" className="text-xl text-emerald-600" />
                        ) : (
                          <VsIcon name="warning" className="text-xl text-amber-500" />
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900">
                          4. Đơn đặt phòng chờ đối soát (Pending Reconciliations)
                        </h4>
                        <p className="text-xs text-[var(--on-surface-variant)]">
                          {selectedHotel.pendingReconciliations === 0
                            ? "Không có booking sửa đổi nào đang chờ nhân viên đối soát thủ công."
                            : `Có ${selectedHotel.pendingReconciliations} booking sửa đổi từ OTA cần đối soát và xác nhận.`}
                        </p>
                      </div>
                    </div>
                    <div>
                      {selectedHotel.pendingReconciliations > 0 && (
                        <button
                          type="button"
                          onClick={() => setDrillDownTab("REPAIR")}
                          className="min-h-10 inline-flex items-center gap-1.5 rounded-xl border border-amber-600 bg-amber-50 px-3 text-xs font-bold text-amber-900 transition hover:bg-amber-600 hover:text-white"
                        >
                          <span>Xử lý đối soát</span>
                          <VsIcon name="arrow_forward" className="text-xs" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Checklist Step 5: Connection and Sync Status */}
                  <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {selectedHotel.state !== "INTERRUPTED" ? (
                          <VsIcon name="check_circle" className="text-xl text-emerald-600" />
                        ) : (
                          <VsIcon name="error" className="text-xl text-rose-500" />
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900">
                          5. Tình trạng kết nối và đồng bộ gần nhất
                        </h4>
                        <p className="text-xs text-[var(--on-surface-variant)]">
                          Lần đồng bộ gần nhất: {formatLastSyncText(selectedHotel.lastSyncAt)}
                        </p>
                      </div>
                    </div>
                    <div>
                      {selectedHotel.state === "INTERRUPTED" && (
                        <button
                          type="button"
                          onClick={() => setDrillDownTab("REPAIR")}
                          className="min-h-10 inline-flex items-center gap-1.5 rounded-xl border border-rose-600 bg-rose-50 px-3 text-xs font-bold text-rose-800 transition hover:bg-rose-600 hover:text-white"
                        >
                          <span>Kiểm tra kết nối</span>
                          <VsIcon name="arrow_forward" className="text-xs" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* TAB 2: CHANNELS & MAPPINGS */}
          {drillDownTab === "CHANNELS" && (
            <section
              aria-label="Kênh OTA & Ghép phòng"
            >
              <ChannexHubTab
                key={`hub-${selectedHotel.hotelId}`}
                hotelId={selectedHotel.hotelId}
                roleScope="admin"
                canManage={canManage}
              />
            </section>
          )}

          {/* TAB 3: CONFIGURATION */}
          {drillDownTab === "CONFIG" && (
            <section
              aria-label="Cấu hình Channex"
            >
              <ChannexPropertyConfigCard
                key={`config-${selectedHotel.hotelId}`}
                hotelId={selectedHotel.hotelId}
                hotelName={selectedHotel.hotelName}
                roleScope="admin"
                canManage={canManage}
              />
            </section>
          )}

          {/* TAB 4: REPAIR & RECONCILIATION */}
          {drillDownTab === "REPAIR" && (
            <section
              aria-label="Khắc phục sự cố & Đối soát"
              className="space-y-6"
            >
              {canManage ? (
                <>
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-4 text-xs text-[var(--on-surface-variant)]">
                      <span className="font-bold text-gray-900">Khu vực đẩy ARI: </span>
                      Đẩy lại dữ liệu giá và quỹ phòng (ARI) trực tiếp sang Channex khi cần ép đồng bộ lại hoặc giải quyết gián đoạn kết nối.
                    </div>
                    <AriPushCard
                      key={`push-${selectedHotel.hotelId}`}
                      hotelId={selectedHotel.hotelId}
                      roleScope="admin"
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-4 text-xs text-[var(--on-surface-variant)]">
                      <span className="font-bold text-gray-900">Trung tâm xử lý sự cố & Đối soát: </span>
                      Kiểm tra đơn đặt phòng OTA, ép kéo feed đồng bộ thủ công từ Channex và xử lý hàng đợi booking sửa đổi cần đối soát.
                    </div>
                    <OtaBookingsTab
                      key={`ota-${selectedHotel.hotelId}`}
                      hotelId={selectedHotel.hotelId}
                      roleScope="admin"
                      baseRoutePrefix="/admin/channel-manager"
                      showTechnicalTools={canManage}
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-6 shadow-xs">
                    <div className="flex items-start gap-3">
                      <VsIcon name="info" className="shrink-0 text-xl text-blue-600 mt-0.5" />
                      <div className="space-y-2">
                        <h4 className="text-base font-bold text-gray-900">
                          Chế độ xem chỉ đọc (Read-only)
                        </h4>
                        <p className="text-sm text-[var(--on-surface-variant)]">
                          Các thao tác đẩy lại ARI, ép kéo feed đồng bộ từ Channex và xử lý đơn đặt phòng OTA (check-in, check-out, đối soát) chỉ khả dụng với tài khoản có quyền quản trị Channel Manager (channex.manage).
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 border-t border-gray-100 pt-4">
                      <h5 className="text-xs font-bold uppercase tracking-wider text-[var(--on-surface-variant)]">
                        Tình trạng hiện tại của khách sạn
                      </h5>
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-3">
                          <span className="block text-xs text-[var(--on-surface-variant)]">Trạng thái hạm đội</span>
                          <span className="mt-1 block text-sm font-bold text-gray-900">
                            {FRIENDLY_STATE_LABELS[selectedHotel.state]}
                          </span>
                        </div>
                        <div className="rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-3">
                          <span className="block text-xs text-[var(--on-surface-variant)]">Đơn chờ đối soát</span>
                          <span className="mt-1 block text-sm font-bold text-amber-700">
                            {selectedHotel.pendingReconciliations} đơn
                          </span>
                        </div>
                        <div className="rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-3">
                          <span className="block text-xs text-[var(--on-surface-variant)]">Đồng bộ gần nhất</span>
                          <span className="mt-1 block text-sm font-bold text-gray-900">
                            {formatLastSyncText(selectedHotel.lastSyncAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // FLEET OVERVIEW VIEW (Issue-first fleet table & KPI cards)
  // -------------------------------------------------------------
  const isOverallEmpty =
    !isLoading && !isError && overview && isEmptyFleet(overview, queryPayload);
  const isFilterEmpty =
    !isLoading && !isError && overview && isFilteredEmpty(overview, queryPayload);

  return (
    <div className="space-y-6">
      {/* Exactly 6 Frozen Summary KPI Cards */}
      <section
        aria-label="Chỉ số vận hành hạm đội"
        className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6"
      >
        {/* 1. Tổng khách sạn */}
        <button
          type="button"
          onClick={() => handleStateFilterChange("ALL")}
          className={`group relative flex flex-col justify-between rounded-2xl border p-4.5 text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#24473d]/30 ${
            filterState === "ALL"
              ? "border-[#24473d] bg-white shadow-md ring-2 ring-[#24473d]/20 -translate-y-0.5"
              : "border-[#e8dfd1] bg-white/90 hover:border-[#24473d]/30 hover:bg-white hover:shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#69726b]">
              Tổng khách sạn
            </span>
            <span className={`grid h-8 w-8 place-items-center rounded-xl transition-colors ${
              filterState === "ALL" ? "bg-[#24473d] text-[#e8b363]" : "bg-[#24473d]/10 text-[#24473d]"
            }`}>
              <VsIcon name="apartment" className="text-base" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums text-[#17201b]">
              {summary?.totalHotels ?? 0}
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-[#69726b]">
              Toàn hệ thống
            </p>
          </div>
        </button>

        {/* 2. Đã cấu hình */}
        <div className="relative flex flex-col justify-between rounded-2xl border border-[#e8dfd1] bg-white/90 p-4.5 text-left shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-teal-800">
              Đã cấu hình
            </span>
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-teal-100/70 text-teal-700">
              <VsIcon name="task_alt" className="text-base" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums text-teal-800">
              {summary?.configuredHotels ?? 0}
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-teal-700/80">
              Đã liên kết Channex
            </p>
          </div>
        </div>

        {/* 3. Đang hoạt động */}
        <button
          type="button"
          onClick={() => handleStateFilterChange("ACTIVE")}
          className={`group relative flex flex-col justify-between rounded-2xl border p-4.5 text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${
            filterState === "ACTIVE"
              ? "border-emerald-600 bg-emerald-50/40 shadow-md ring-2 ring-emerald-500/20 -translate-y-0.5"
              : "border-[#e8dfd1] bg-white/90 hover:border-emerald-500/40 hover:bg-white hover:shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
              Đang hoạt động
            </span>
            <span className={`grid h-8 w-8 place-items-center rounded-xl transition-colors ${
              filterState === "ACTIVE" ? "bg-emerald-600 text-white" : "bg-emerald-100/70 text-emerald-700"
            }`}>
              <VsIcon name="check_circle" className="text-base" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums text-emerald-800">
              {summary?.activeHotels ?? 0}
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-emerald-700/80">
              Đồng bộ ổn định
            </p>
          </div>
        </button>

        {/* 4. Cần chú ý */}
        <button
          type="button"
          onClick={() => handleStateFilterChange("ATTENTION")}
          className={`group relative flex flex-col justify-between rounded-2xl border p-4.5 text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-amber-500/30 ${
            filterState === "ATTENTION"
              ? "border-amber-600 bg-amber-50/40 shadow-md ring-2 ring-amber-500/20 -translate-y-0.5"
              : "border-[#e8dfd1] bg-white/90 hover:border-amber-500/40 hover:bg-white hover:shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
              Cần chú ý
            </span>
            <span className={`grid h-8 w-8 place-items-center rounded-xl transition-colors ${
              filterState === "ATTENTION" ? "bg-amber-600 text-white" : "bg-amber-100/70 text-amber-700"
            }`}>
              <VsIcon name="warning" className="text-base" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums text-amber-800">
              {summary?.needsAttention ?? 0}
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-amber-700/80">
              Có cảnh báo / lỗi
            </p>
          </div>
        </button>

        {/* 5. Chưa thiết lập */}
        <button
          type="button"
          onClick={() => handleStateFilterChange("UNCONFIGURED")}
          className={`group relative flex flex-col justify-between rounded-2xl border p-4.5 text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-400/30 ${
            filterState === "UNCONFIGURED"
              ? "border-slate-600 bg-slate-50 shadow-md ring-2 ring-slate-400/20 -translate-y-0.5"
              : "border-[#e8dfd1] bg-white/90 hover:border-slate-400/50 hover:bg-white hover:shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
              Chưa thiết lập
            </span>
            <span className={`grid h-8 w-8 place-items-center rounded-xl transition-colors ${
              filterState === "UNCONFIGURED" ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-600"
            }`}>
              <VsIcon name="settings" className="text-base" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums text-slate-800">
              {summary?.unconfiguredHotels ?? 0}
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-slate-600">
              Chưa kết nối Channex
            </p>
          </div>
        </button>

        {/* 6. Chờ đối soát */}
        <div className="relative flex flex-col justify-between rounded-2xl border border-[#e8dfd1] bg-white/90 p-4.5 text-left shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-orange-800">
              Chờ đối soát
            </span>
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-orange-100/70 text-orange-700">
              <VsIcon name="receipt_long" className="text-base" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums text-orange-800">
              {summary?.pendingReconciliations ?? 0}
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-orange-700/80">
              Đơn OTA cần duyệt
            </p>
          </div>
        </div>
      </section>

      {/* Filter and Search Bar */}
      <section className="rounded-2xl border border-[#e8dfd1] bg-white/90 p-4 sm:p-5 shadow-[0_8px_30px_rgba(23,32,27,0.03)] backdrop-blur-md">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Search Input & Select Dropdown */}
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1 min-w-[260px] max-w-lg">
                <label htmlFor={searchInputId} className="sr-only">
                  Tìm kiếm khách sạn
                </label>
                <VsIcon
                  name="search"
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-[#8b948d]"
                />
                <input
                  id={searchInputId}
                  type="search"
                  maxLength={120}
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Tìm theo tên khách sạn hoặc mã khách sạn..."
                  className="min-h-11 w-full rounded-xl border border-[#e2d7c5] bg-[#faf6ef]/70 pl-10 pr-9 py-2 text-sm font-medium text-[#17201b] shadow-2xs transition-all placeholder:text-[#8b948d] focus:border-[#24473d] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#24473d]/20"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => handleSearchChange("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b948d] hover:text-[#17201b]"
                    title="Xóa tìm kiếm"
                  >
                    <VsIcon name="close" className="text-sm" />
                  </button>
                )}
              </div>

              <div className="w-full sm:w-auto">
                <label htmlFor={stateFilterId} className="sr-only">
                  Lọc theo trạng thái
                </label>
                <div className="relative">
                  <select
                    id={stateFilterId}
                    value={filterState}
                    onChange={(e) =>
                      handleStateFilterChange(e.target.value as AdminChannelOverviewState | "ALL")
                    }
                    className="min-h-11 w-full sm:w-52 appearance-none rounded-xl border border-[#e2d7c5] bg-[#faf6ef]/70 pl-3.5 pr-9 py-2 text-sm font-semibold text-[#17201b] shadow-2xs transition-all focus:border-[#24473d] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#24473d]/20 cursor-pointer"
                  >
                    <option value="ALL">Tất cả trạng thái</option>
                    <option value="ACTIVE">Hoạt động</option>
                    <option value="ATTENTION">Cần chú ý</option>
                    <option value="INTERRUPTED">Gián đoạn</option>
                    <option value="SETTING_UP">Đang thiết lập</option>
                    <option value="UNCONFIGURED">Chưa thiết lập</option>
                  </select>
                  <VsIcon
                    name="expand_more"
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-base text-[#8b948d]"
                  />
                </div>
              </div>
            </div>

            {/* Right Side: Total counter badge & action buttons */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0 justify-between sm:justify-end">
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#e8dfd1] bg-[#fbf8f2] px-3.5 py-2 text-xs font-semibold text-[#69726b]">
                <VsIcon name="apartment" className="text-sm text-[#24473d]" />
                <span>Hiển thị <strong className="text-[#17201b]">{items.length}</strong> / <strong className="text-[#17201b]">{total}</strong> khách sạn</span>
              </span>

              {(searchTerm || filterState !== "ALL") && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-[#e8dfd1] bg-white px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 transition-colors shadow-2xs"
                >
                  <VsIcon name="close" className="text-xs" />
                  <span>Đặt lại bộ lọc</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => void refetch()}
                disabled={isFetching}
                className="min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-[#e8dfd1] bg-white px-3.5 py-2 text-xs font-bold text-[#17201b] hover:bg-[#fbf8f2] shadow-2xs transition-colors disabled:opacity-60"
                title="Làm mới danh sách"
              >
                <VsIcon name="refresh" className={`text-sm ${isFetching ? "animate-spin text-[#24473d]" : ""}`} />
                <span>{isFetching ? "Đang đồng bộ..." : "Làm mới"}</span>
              </button>
            </div>
          </div>

          {/* Quick filter chips */}
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#f0eae0]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#69726b] mr-1">
              Bộ lọc nhanh:
            </span>
            {[
              { id: "ALL" as const, label: "Tất cả", count: summary?.totalHotels },
              { id: "ACTIVE" as const, label: "Đang hoạt động", count: summary?.activeHotels },
              { id: "ATTENTION" as const, label: "Cần chú ý", count: summary?.needsAttention },
              { id: "UNCONFIGURED" as const, label: "Chưa thiết lập", count: summary?.unconfiguredHotels },
            ].map((chip) => {
              const isCurrent = filterState === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => handleStateFilterChange(chip.id)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                    isCurrent
                      ? "bg-[#24473d] text-[#fff8e8] shadow-2xs"
                      : "bg-[#f4ede2] text-[#69726b] hover:bg-[#eae1d2] hover:text-[#17201b]"
                  }`}
                >
                  <span>{chip.label}</span>
                  {chip.count !== undefined && (
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                        isCurrent
                          ? "bg-[#e8b363] text-[#17201b]"
                          : "bg-black/10 text-[#17201b]"
                      }`}
                    >
                      {chip.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Main Table Content */}
      <section className="rounded-[1.6rem] border border-[#e8dfd1] bg-white/95 shadow-[0_16px_45px_rgba(23,32,27,0.05)] backdrop-blur-md overflow-hidden">
        {/* Loading State */}
        {isLoading && (
          <div className="space-y-4 p-6" aria-label="Đang tải dữ liệu">
            {[1, 2, 3, 4, 5].map((idx) => (
              <div
                key={idx}
                className="h-14 w-full animate-pulse rounded-xl bg-[#faf6ef]"
              />
            ))}
          </div>
        )}

        {/* Error State */}
        {!isLoading && isError && (
          <div className="p-12 text-center bg-white/60">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-600 ring-2 ring-rose-200">
              <VsIcon name="error" className="text-3xl" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-[#17201b]">
              Không thể tải dữ liệu hạm đội
            </h3>
            <p className="mt-1 text-sm text-[#69726b]">
              Đã xảy ra lỗi khi lấy danh sách khách sạn từ máy chủ.
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-4 min-h-11 inline-flex items-center gap-2 rounded-xl bg-[#24473d] px-5 py-2 text-sm font-bold text-[#fff8e8] shadow-xs transition hover:bg-[#1a352d] focus:outline-none focus:ring-2 focus:ring-[#24473d]/30"
            >
              <VsIcon name="refresh" className="text-base" />
              <span>Thử lại</span>
            </button>
          </div>
        )}

        {/* Overall Empty State (no active filter && totalHotels === 0) */}
        {isOverallEmpty && (
          <div className="p-12 text-center bg-white/60">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#24473d]/10 text-[#24473d]">
              <VsIcon name="apartment" className="text-3xl" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-[#17201b]">
              Chưa có khách sạn nào trong hệ thống
            </h3>
            <p className="mt-1 text-sm text-[#69726b]">
              Vui lòng tạo khách sạn tại trang Quản trị Khách sạn trước khi vận hành Channel Manager.
            </p>
          </div>
        )}

        {/* Filtered Empty State (active filter && items === 0) */}
        {isFilterEmpty && (
          <div className="p-12 text-center bg-white/60">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-600 ring-2 ring-amber-200">
              <VsIcon name="search" className="text-3xl" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-[#17201b]">
              Không tìm thấy khách sạn phù hợp
            </h3>
            <p className="mt-1 text-sm text-[#69726b]">
              Không có khách sạn nào khớp với từ khóa tìm kiếm hoặc trạng thái đã chọn.
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-4 min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-[#e8dfd1] bg-white px-4 py-2 text-sm font-bold text-[#24473d] shadow-2xs transition hover:bg-[#fbf8f2] focus:outline-none focus:ring-2 focus:ring-[#24473d]/30"
            >
              <span>Xóa bộ lọc tìm kiếm</span>
            </button>
          </div>
        )}

        {/* Populated Table */}
        {!isLoading && !isError && items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-[#17201b]">
              <thead className="border-b border-[#e5dcd0] bg-[#f8f5ee] text-[11px] font-bold uppercase tracking-[0.1em] text-[#69726b]">
                <tr>
                  <th scope="col" className="px-6 py-4">
                    Khách sạn
                  </th>
                  <th scope="col" className="px-5 py-4">
                    Chủ sở hữu (Tenant)
                  </th>
                  <th scope="col" className="px-5 py-4">
                    Trạng thái kết nối
                  </th>
                  <th scope="col" className="px-5 py-4">
                    Tình trạng đồng bộ / Cảnh báo
                  </th>
                  <th scope="col" className="px-5 py-4">
                    Đồng bộ gần nhất
                  </th>
                  <th scope="col" className="px-6 py-4 text-right">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0eae0]">
                {items.map((item) => {
                  const actionLabel = getPrimaryActionLabel(
                    item.state,
                    item.primaryIssueCode,
                  );

                  const sync = formatLastSync(item.lastSyncAt);

                  return (
                    <tr
                      key={item.hotelId}
                      className="group transition-colors hover:bg-[#fcfaf7]"
                    >
                      <td className="px-6 py-4.5 align-middle">
                        <div className="flex items-center gap-3.5">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#24473d] text-[#e8b363] shadow-xs ring-2 ring-[#e8b363]/30">
                            <VsIcon name="hotel" className="text-lg" />
                          </div>
                          <div>
                            <button
                              type="button"
                              onClick={() => handleOpenHotel(item, "OVERVIEW")}
                              className="text-left font-bold text-sm text-[#17201b] transition-colors hover:text-[#24473d] focus:outline-none focus:underline"
                            >
                              {item.hotelName}
                            </button>
                            <div className="mt-0.5">
                              <span className="inline-block font-mono text-[11px] font-semibold text-[#69726b] bg-[#f4ede2] px-2 py-0.5 rounded-md">
                                {item.hotelCode}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4.5 align-middle">
                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#e8dfd1] bg-[#fbf8f2] px-3 py-1.5 text-xs font-semibold text-[#17201b]">
                          <VsIcon name="apartment" className="text-sm text-[#8b948d]" />
                          <span>{formatTenantName(item.tenantName)}</span>
                        </span>
                      </td>

                      <td className="px-5 py-4.5 align-middle">
                        {renderStateBadge(item.state)}
                      </td>

                      <td className="px-5 py-4.5 align-middle">
                        {renderIssueDescription(item)}
                      </td>

                      <td className="px-5 py-4.5 align-middle">
                        {!sync ? (
                          <span className="inline-flex items-center gap-1 text-xs text-[#8b948d] italic">
                            <VsIcon name="schedule" className="text-xs" />
                            <span>Chưa đồng bộ</span>
                          </span>
                        ) : (
                          <div className="flex items-center gap-2 text-xs">
                            <VsIcon name="schedule" className="text-sm text-[#8b948d] shrink-0" />
                            <div>
                              <p className="font-bold text-[#17201b]">{sync.time}</p>
                              <p className="text-[11px] text-[#69726b]">{sync.date}</p>
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4.5 text-right align-middle">
                        <button
                          type="button"
                          onClick={() => handleOpenHotel(item)}
                          className={`min-h-10 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all shadow-xs hover:scale-102 focus:outline-none focus:ring-2 focus:ring-[#24473d]/30 ${
                            actionLabel === "Liên kết Channex"
                              ? "bg-[#24473d] text-[#fff8e8] hover:bg-[#1a352d]"
                              : "border border-[#24473d]/25 bg-[#24473d]/5 text-[#24473d] hover:bg-[#24473d] hover:text-[#fff8e8]"
                          }`}
                        >
                          <span>{actionLabel}</span>
                          <VsIcon
                            name="arrow_forward"
                            className={`text-xs ${
                              actionLabel === "Liên kết Channex" ? "text-[#e8b363]" : ""
                            }`}
                          />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {!isLoading && !isError && total > 0 && (
          <div className="flex flex-col gap-3 border-t border-[#e5dcd0] bg-[#fdfbf7] p-4 sm:flex-row sm:items-center sm:justify-between text-xs text-[#69726b]">
            <div>
              Hiển thị <span className="font-bold text-[#17201b]">{items.length}</span> trong số{" "}
              <span className="font-bold text-[#17201b]">{total}</span> khách sạn
              {totalPages > 1 && (
                <span className="ml-1 text-[#8b948d]">• Trang {page} / {totalPages}</span>
              )}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="min-h-10 inline-flex items-center gap-1.5 rounded-xl border border-[#e8dfd1] bg-white px-3.5 py-1.5 font-bold text-[#17201b] shadow-2xs transition hover:bg-[#fbf8f2] disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[#24473d]/30"
                >
                  <VsIcon name="arrow_back" className="text-xs" />
                  <span>Trang trước</span>
                </button>

                <span className="inline-flex items-center justify-center rounded-xl bg-[#f4ede2] px-3 py-1.5 font-bold text-[#24473d]">
                  {page} / {totalPages}
                </span>

                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="min-h-10 inline-flex items-center gap-1.5 rounded-xl border border-[#e8dfd1] bg-white px-3.5 py-1.5 font-bold text-[#17201b] shadow-2xs transition hover:bg-[#fbf8f2] disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[#24473d]/30"
                >
                  <span>Trang sau</span>
                  <VsIcon name="arrow_forward" className="text-xs" />
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
