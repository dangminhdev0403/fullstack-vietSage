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

function formatLastSync(isoString: string | null): string {
  if (!isoString) return "Chưa đồng bộ";
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return isoString;
  }
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
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {FRIENDLY_STATE_LABELS.ACTIVE}
          </span>
        );
      case "ATTENTION":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            {FRIENDLY_STATE_LABELS.ATTENTION}
          </span>
        );
      case "INTERRUPTED":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-800">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            {FRIENDLY_STATE_LABELS.INTERRUPTED}
          </span>
        );
      case "SETTING_UP":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            {FRIENDLY_STATE_LABELS.SETTING_UP}
          </span>
        );
      case "UNCONFIGURED":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-700">
            <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
            {FRIENDLY_STATE_LABELS.UNCONFIGURED}
          </span>
        );
    }
  };

  // Issue description
  const renderIssueDescription = (item: AdminChannelOverviewItem) => {
    if (!item.primaryIssueCode) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
          <VsIcon name="check_circle" className="text-sm text-emerald-600" />
          <span>Bình thường ({item.mappedRoomTypes} phòng, {item.mappedRatePlans} gói giá)</span>
        </span>
      );
    }

    const label = PRIMARY_ISSUE_LABELS[item.primaryIssueCode] || item.primaryIssueCode;

    switch (item.primaryIssueCode) {
      case "PROPERTY_MISSING":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700">
            <VsIcon name="warning" className="text-sm text-amber-600" />
            <span>{label}</span>
          </span>
        );
      case "MAPPING_INCOMPLETE":
        return (
          <span className="inline-flex flex-col text-xs font-semibold text-blue-700">
            <span className="inline-flex items-center gap-1">
              <VsIcon name="sync_alt" className="text-sm text-blue-600" />
              <span>{label}</span>
            </span>
            <span className="text-[11px] font-normal text-blue-600">
              Đã ghép: {item.mappedRoomTypes} phòng, {item.mappedRatePlans} gói giá
            </span>
          </span>
        );
      case "RECONCILIATION_REQUIRED":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
            <VsIcon name="receipt_long" className="text-sm text-amber-600" />
            <span>{label} ({item.pendingReconciliations} đơn chờ)</span>
          </span>
        );
      case "SYNC_FAILED":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700">
            <VsIcon name="error" className="text-sm text-rose-600" />
            <span>{label}</span>
          </span>
        );
      case "CONNECTION_INTERRUPTED":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700">
            <VsIcon name="bolt" className="text-sm text-rose-600" />
            <span>{label}</span>
          </span>
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
        <section className="rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-5 shadow-xs">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setSelectedHotel(null)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-[var(--primary)] transition hover:bg-[var(--surface-container-low)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
              >
                <VsIcon name="arrow_back" className="text-base" />
                <span>Quay lại danh sách hạm đội</span>
              </button>

              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-bold tracking-tight text-[var(--on-surface)]">
                  {selectedHotel.hotelName}
                </h2>
                <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-mono font-bold text-gray-700">
                  {selectedHotel.hotelCode}
                </span>
                {renderStateBadge(selectedHotel.state)}
              </div>

              <p className="text-xs text-[var(--on-surface-variant)]">
                Chủ sở hữu (Tenant): <span className="font-semibold text-gray-900">{selectedHotel.tenantName}</span>
                {" • "}
                Đồng bộ gần nhất: <span className="font-semibold text-gray-900">{formatLastSync(selectedHotel.lastSyncAt)}</span>
              </p>
            </div>
          </div>

          {selectedHotel.primaryIssueCode && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900">
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
          className="flex gap-2 border-b border-[var(--outline-variant)] pb-px overflow-x-auto"
        >
          <button
            type="button"
            aria-current={drillDownTab === "OVERVIEW" ? "page" : undefined}
            onClick={() => setDrillDownTab("OVERVIEW")}
            className={`min-h-11 shrink-0 flex items-center gap-2 rounded-t-xl border-b-2 px-4 py-2.5 text-sm font-bold transition-all focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 ${
              drillDownTab === "OVERVIEW"
                ? "border-[var(--primary)] bg-[var(--surface-container-lowest)] text-[var(--primary)] shadow-xs"
                : "border-transparent text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)] hover:text-gray-900"
            }`}
          >
            <VsIcon name="fact_check" className="text-base" />
            <span>Tổng quan & Checklist</span>
          </button>

          <button
            type="button"
            aria-current={drillDownTab === "CHANNELS" ? "page" : undefined}
            onClick={() => setDrillDownTab("CHANNELS")}
            className={`min-h-11 shrink-0 flex items-center gap-2 rounded-t-xl border-b-2 px-4 py-2.5 text-sm font-bold transition-all focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 ${
              drillDownTab === "CHANNELS"
                ? "border-[var(--primary)] bg-[var(--surface-container-lowest)] text-[var(--primary)] shadow-xs"
                : "border-transparent text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)] hover:text-gray-900"
            }`}
          >
            <VsIcon name="hub" className="text-base" />
            <span>Kênh OTA & Ghép phòng</span>
          </button>

          <button
            type="button"
            aria-current={drillDownTab === "CONFIG" ? "page" : undefined}
            onClick={() => setDrillDownTab("CONFIG")}
            className={`min-h-11 shrink-0 flex items-center gap-2 rounded-t-xl border-b-2 px-4 py-2.5 text-sm font-bold transition-all focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 ${
              drillDownTab === "CONFIG"
                ? "border-[var(--primary)] bg-[var(--surface-container-lowest)] text-[var(--primary)] shadow-xs"
                : "border-transparent text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)] hover:text-gray-900"
            }`}
          >
            <VsIcon name="settings" className="text-base" />
            <span>Cấu hình Channex</span>
          </button>

          <button
            type="button"
            aria-current={drillDownTab === "REPAIR" ? "page" : undefined}
            onClick={() => setDrillDownTab("REPAIR")}
            className={`min-h-11 shrink-0 flex items-center gap-2 rounded-t-xl border-b-2 px-4 py-2.5 text-sm font-bold transition-all focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 ${
              drillDownTab === "REPAIR"
                ? "border-[var(--primary)] bg-[var(--surface-container-lowest)] text-[var(--primary)] shadow-xs"
                : "border-transparent text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)] hover:text-gray-900"
            }`}
          >
            <VsIcon name="build" className="text-base" />
            <span>Khắc phục sự cố & Đối soát</span>
          </button>
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
                          Lần đồng bộ gần nhất: {formatLastSync(selectedHotel.lastSyncAt)}
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
                            {formatLastSync(selectedHotel.lastSyncAt)}
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
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
      >
        <button
          type="button"
          onClick={() => handleStateFilterChange("ALL")}
          className={`flex flex-col justify-between rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 ${
            filterState === "ALL"
              ? "border-[var(--primary)] bg-[var(--primary)]/5 shadow-xs"
              : "border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] hover:border-gray-300"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[var(--on-surface-variant)]">
            <span>Tổng khách sạn</span>
            <VsIcon name="apartment" className="text-base" />
          </div>
          <p className="mt-2 text-2xl font-black tracking-tight text-[var(--primary)]">
            {summary?.totalHotels ?? 0}
          </p>
        </button>

        <div className="flex flex-col justify-between rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-4 text-left">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-blue-800">
            <span>Đã cấu hình</span>
            <VsIcon name="task_alt" className="text-base text-blue-600" />
          </div>
          <p className="mt-2 text-2xl font-black tracking-tight text-blue-700">
            {summary?.configuredHotels ?? 0}
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleStateFilterChange("ACTIVE")}
          className={`flex flex-col justify-between rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${
            filterState === "ACTIVE"
              ? "border-emerald-500 bg-emerald-50/60 shadow-xs"
              : "border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] hover:border-emerald-300"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-emerald-800">
            <span>Đang hoạt động</span>
            <VsIcon name="check_circle" className="text-base text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-black tracking-tight text-emerald-700">
            {summary?.activeHotels ?? 0}
          </p>
        </button>

        <button
          type="button"
          onClick={() => handleStateFilterChange("ATTENTION")}
          className={`flex flex-col justify-between rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-amber-500/30 ${
            filterState === "ATTENTION"
              ? "border-amber-500 bg-amber-50/60 shadow-xs"
              : "border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] hover:border-amber-300"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-amber-800">
            <span>Cần chú ý</span>
            <VsIcon name="warning" className="text-base text-amber-600" />
          </div>
          <p className="mt-2 text-2xl font-black tracking-tight text-amber-700">
            {summary?.needsAttention ?? 0}
          </p>
        </button>

        <button
          type="button"
          onClick={() => handleStateFilterChange("UNCONFIGURED")}
          className={`flex flex-col justify-between rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-gray-500/30 ${
            filterState === "UNCONFIGURED"
              ? "border-gray-500 bg-gray-100 shadow-xs"
              : "border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] hover:border-gray-400"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-gray-700">
            <span>Chưa thiết lập</span>
            <VsIcon name="settings" className="text-base text-gray-600" />
          </div>
          <p className="mt-2 text-2xl font-black tracking-tight text-gray-700">
            {summary?.unconfiguredHotels ?? 0}
          </p>
        </button>

        <div className="flex flex-col justify-between rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-4 text-left">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-amber-800">
            <span>Chờ đối soát</span>
            <VsIcon name="receipt_long" className="text-base text-amber-600" />
          </div>
          <p className="mt-2 text-2xl font-black tracking-tight text-amber-700">
            {summary?.pendingReconciliations ?? 0}
          </p>
        </div>
      </section>

      {/* Filter and Search Bar */}
      <section className="flex flex-col gap-3 rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-4 sm:flex-row sm:items-center sm:justify-between shadow-xs">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full max-w-md">
            <label htmlFor={searchInputId} className="sr-only">
              Tìm kiếm khách sạn
            </label>
            <input
              id={searchInputId}
              type="search"
              maxLength={120}
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Tìm theo tên khách sạn hoặc mã khách sạn..."
              className="min-h-11 w-full rounded-xl border border-[var(--outline-variant)] bg-white px-4 py-2 text-sm text-[var(--on-surface)] shadow-xs transition placeholder:text-gray-400 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
            />
          </div>

          <div className="w-full sm:w-auto">
            <label htmlFor={stateFilterId} className="sr-only">
              Lọc theo trạng thái
            </label>
            <select
              id={stateFilterId}
              value={filterState}
              onChange={(e) =>
                handleStateFilterChange(e.target.value as AdminChannelOverviewState | "ALL")
              }
              className="min-h-11 w-full sm:w-48 rounded-xl border border-[var(--outline-variant)] bg-white px-3 py-2 text-sm font-semibold text-[var(--on-surface)] shadow-xs transition focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="ACTIVE">Hoạt động</option>
              <option value="ATTENTION">Cần chú ý</option>
              <option value="INTERRUPTED">Gián đoạn</option>
              <option value="SETTING_UP">Đang thiết lập</option>
              <option value="UNCONFIGURED">Chưa thiết lập</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {(searchTerm || filterState !== "ALL") && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="min-h-11 rounded-xl px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
            >
              Đặt lại bộ lọc
            </button>
          )}

          {isFetching && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--primary)]">
              <span className="h-2 w-2 rounded-full bg-[var(--primary)] animate-ping" />
              Đang làm mới...
            </span>
          )}
        </div>
      </section>

      {/* Main Table Content */}
      <section className="rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] shadow-xs overflow-hidden">
        {/* Loading State */}
        {isLoading && (
          <div className="space-y-4 p-6" aria-label="Đang tải dữ liệu">
            {[1, 2, 3, 4, 5].map((idx) => (
              <div
                key={idx}
                className="h-14 w-full animate-pulse rounded-xl bg-gray-100"
              />
            ))}
          </div>
        )}

        {/* Error State */}
        {!isLoading && isError && (
          <div className="p-12 text-center">
            <VsIcon name="error" className="text-4xl text-rose-500" />
            <h3 className="mt-3 text-lg font-bold text-gray-900">
              Không thể tải dữ liệu hạm đội
            </h3>
            <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
              Đã xảy ra lỗi khi lấy danh sách khách sạn từ máy chủ.
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-4 min-h-11 rounded-xl bg-[var(--primary)] px-5 py-2 text-sm font-bold text-white shadow-xs transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
            >
              Thử lại
            </button>
          </div>
        )}

        {/* Overall Empty State (no active filter && totalHotels === 0) */}
        {isOverallEmpty && (
          <div className="p-12 text-center">
            <VsIcon name="apartment" className="text-4xl text-gray-400" />
            <h3 className="mt-3 text-lg font-bold text-gray-900">
              Chưa có khách sạn nào trong hệ thống
            </h3>
            <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
              Vui lòng tạo khách sạn tại trang Quản trị Khách sạn trước khi vận hành Channel Manager.
            </p>
          </div>
        )}

        {/* Filtered Empty State (active filter && items === 0) */}
        {isFilterEmpty && (
          <div className="p-12 text-center">
            <VsIcon name="search" className="text-4xl text-gray-400" />
            <h3 className="mt-3 text-lg font-bold text-gray-900">
              Không tìm thấy khách sạn phù hợp
            </h3>
            <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
              Không có khách sạn nào khớp với từ khóa tìm kiếm hoặc trạng thái đã chọn.
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-4 min-h-11 rounded-xl border border-[var(--outline-variant)] bg-white px-4 py-2 text-sm font-bold text-[var(--primary)] shadow-xs transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
            >
              Xóa bộ lọc tìm kiếm
            </button>
          </div>
        )}

        {/* Populated Table */}
        {!isLoading && !isError && items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-[var(--on-surface)]">
              <thead className="border-b border-[var(--outline-variant)] bg-[var(--surface-container-low)] text-xs font-bold uppercase tracking-wider text-[var(--on-surface-variant)]">
                <tr>
                  <th scope="col" className="px-5 py-3.5">
                    Khách sạn
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Chủ sở hữu (Tenant)
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Trạng thái
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Vấn đề chính / Cảnh báo
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Đồng bộ gần nhất
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-right">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--outline-variant)]">
                {items.map((item) => {
                  const actionLabel = getPrimaryActionLabel(
                    item.state,
                    item.primaryIssueCode,
                  );

                  return (
                    <tr
                      key={item.hotelId}
                      className="group transition hover:bg-[var(--surface-container-low)]/60"
                    >
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => handleOpenHotel(item, "OVERVIEW")}
                          className="text-left font-bold text-[var(--on-surface)] transition hover:text-[var(--primary)] focus:outline-none focus:underline"
                        >
                          {item.hotelName}
                        </button>
                        <div className="text-xs font-mono text-[var(--on-surface-variant)]">
                          {item.hotelCode}
                        </div>
                      </td>

                      <td className="px-4 py-4 text-xs font-semibold text-gray-700">
                        {item.tenantName}
                      </td>

                      <td className="px-4 py-4">
                        {renderStateBadge(item.state)}
                      </td>

                      <td className="px-4 py-4">
                        {renderIssueDescription(item)}
                      </td>

                      <td className="px-4 py-4 text-xs text-[var(--on-surface-variant)]">
                        {formatLastSync(item.lastSyncAt)}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenHotel(item)}
                          className="min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-[var(--primary)] bg-[var(--primary)]/5 px-3.5 py-1.5 text-xs font-bold text-[var(--primary)] shadow-xs transition hover:bg-[var(--primary)] hover:text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                        >
                          <span>{actionLabel}</span>
                          <VsIcon name="arrow_forward" className="text-xs" />
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
          <div className="flex flex-col gap-3 border-t border-[var(--outline-variant)] p-4 sm:flex-row sm:items-center sm:justify-between text-xs text-[var(--on-surface-variant)]">
            <div>
              Hiển thị <span className="font-bold text-gray-900">{items.length}</span> trong số{" "}
              <span className="font-bold text-gray-900">{total}</span> khách sạn
              {totalPages > 1 && (
                <span> (Trang {page} / {totalPages})</span>
              )}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-[var(--outline-variant)] bg-white px-3.5 py-2 font-bold text-[var(--on-surface)] shadow-xs transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                >
                  <VsIcon name="arrow_back" className="text-xs" />
                  <span>Trang trước</span>
                </button>

                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-[var(--outline-variant)] bg-white px-3.5 py-2 font-bold text-[var(--on-surface)] shadow-xs transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
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
