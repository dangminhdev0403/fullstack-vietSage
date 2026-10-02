"use client";

import { useEffect, useMemo, useState } from "react";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import {
  showConfirmDialog,
  showErrorAlert,
  showSuccessAlert,
} from "@/libs/swal";
import { useChannexChannelDetail } from "../hooks/use-channel-manager";
import type {
  ChannexChannelParameter,
  ChannexSettingValue,
} from "../types/channel-manager.types";
import {
  buildRateMappingSettings,
  flattenRemoteRates,
  resolveRateOccupancy,
} from "./channex-channel-wizard.utils";
import { ChannelLogo } from "./channel-logo";

const COMMON_NATIVE_RATE_FIELDS = new Set([
  "room_type_code",
  "rate_plan_code",
  "occupancy",
  "pricing_type",
  "primary_occ",
  "readonly",
  "occ_changed",
]);

interface ChannexChannelDetailModalProps {
  hotelId: string;
  channelId: string | null;
  roleScope?: "owner" | "admin";
  onClose: () => void;
  onOpenChannexIframe?: (channelId: string) => void;
  onCatalogRefresh?: () => void;
}

export function ChannexChannelDetailModal({
  hotelId,
  channelId,
  roleScope = "owner",
  onClose,
  onOpenChannexIframe,
  onCatalogRefresh,
}: ChannexChannelDetailModalProps) {
  const {
    channel,
    isLoading,
    isError,
    error,
    refetch,
    updateChannel,
    isUpdating,
    activateChannel,
    isActivating,
    deactivateChannel,
    isDeactivating,
    syncChannel,
    isSyncing,
    deleteChannel,
    isDeleting,
  } = useChannexChannelDetail(hotelId, channelId, roleScope);

  const [activeTab, setActiveTab] = useState<"MAPPING" | "SETTINGS">("MAPPING");
  const [title, setTitle] = useState("");
  const [selectedRates, setSelectedRates] = useState<Record<string, string>>({});
  const [occupancies, setOccupancies] = useState<Record<string, number>>({});
  const [isInitialized, setIsInitialized] = useState(false);

  // Body scroll lock and Escape key listener
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Flatten remote OTA rates
  const remoteRates = useMemo(
    () => flattenRemoteRates(channel?.mappingDetails),
    [channel?.mappingDetails],
  );

  // Initialize form state when channel loads
  useEffect(() => {
    if (channel && !isInitialized) {
      setTitle(channel.title);

      const initialSelectedRates: Record<string, string> = {};
      const initialOccupancies: Record<string, number> = {};

      for (const item of channel.ratePlans ?? []) {
        const settings = item.settings as Record<string, unknown> | undefined;
        if (!settings) continue;
        const roomCode = settings.room_type_code;
        const rateCode = settings.rate_plan_code;
        if (roomCode && rateCode) {
          const key = `${String(roomCode)}:${String(rateCode)}`;
          initialSelectedRates[item.rate_plan_id] = key;
        }
        if (settings.occupancy) {
          initialOccupancies[item.rate_plan_id] = Number(settings.occupancy);
        }
      }

      setSelectedRates(initialSelectedRates);
      setOccupancies(initialOccupancies);
      setIsInitialized(true);
    }
  }, [channel, isInitialized]);

  if (!channelId) return null;

  const handleSaveMapping = async () => {
    if (!channel?.localRatePlans?.length) return;

    const ratePlans = channel.localRatePlans.flatMap((localRatePlan) => {
      const remote = remoteRates.find(
        (item) => item.key === selectedRates[localRatePlan.id],
      );
      if (!remote) return [];
      const compatibleRemote = {
        ...remote,
        occupancies: remote.occupancies.filter(
          (value) =>
            !localRatePlan.occupancy || value <= localRatePlan.occupancy,
        ),
      };
      if (!compatibleRemote.occupancies.length) return [];
      const occupancy = resolveRateOccupancy(
        compatibleRemote,
        occupancies[localRatePlan.id] ?? localRatePlan.occupancy,
      );

      const adapterRateParams = channel.adapter?.rateParameters ?? [];

      return [
        {
          rate_plan_id: localRatePlan.id,
          settings: {
            ...buildRateMappingSettings(
              adapterRateParams,
              remote,
              occupancy,
            ),
            ...Object.fromEntries(
              adapterRateParams.flatMap((field: ChannexChannelParameter) =>
                !COMMON_NATIVE_RATE_FIELDS.has(field.key) &&
                field.default !== undefined
                  ? [[field.key, field.default as ChannexSettingValue]]
                  : [],
              ),
            ),
          },
        },
      ];
    });

    if (!ratePlans.length) {
      await showErrorAlert(
        "Chưa chọn ánh xạ",
        "Hãy ánh xạ ít nhất một gói giá VietSage với rate OTA trước khi lưu.",
      );
      return;
    }

    try {
      await updateChannel({ ratePlans });
      await showSuccessAlert(
        "Đã lưu ánh xạ",
        "Ánh xạ phòng và gói giá mới đã được cập nhật thành công lên Channex.",
      );
      onCatalogRefresh?.();
    } catch (err: unknown) {
      await showErrorAlert("Không thể cập nhật ánh xạ", err);
    }
  };

  const handleSaveTitle = async () => {
    if (!title.trim()) {
      await showErrorAlert("Tên không hợp lệ", "Vui lòng nhập tên kênh.");
      return;
    }
    try {
      await updateChannel({ title: title.trim() });
      await showSuccessAlert(
        "Đã đổi tên",
        "Tên kết nối kênh đã được lưu thành công.",
      );
      onCatalogRefresh?.();
    } catch (err: unknown) {
      await showErrorAlert("Không thể đổi tên kênh", err);
    }
  };

  const handleToggleActive = async () => {
    if (!channel) return;
    const isCurrentlyActive = channel.isActive;

    const confirmation = await showConfirmDialog({
      title: isCurrentlyActive
        ? `Tạm dừng đồng bộ ${channel.title}?`
        : `Kích hoạt đồng bộ ${channel.title}?`,
      text: isCurrentlyActive
        ? "Kênh sẽ ngừng nhận đơn và ngừng đẩy giá/tồn phòng tạm thời."
        : "Kênh sẽ bắt đầu trao đổi tồn phòng, giá và đơn đặt phòng hai chiều.",
      confirmText: isCurrentlyActive ? "Tạm dừng" : "Kích hoạt",
      cancelText: "Hủy",
      icon: isCurrentlyActive ? "warning" : "info",
    });

    if (!confirmation.isConfirmed) return;

    try {
      if (isCurrentlyActive) {
        await deactivateChannel();
        await showSuccessAlert(
          "Đã tạm dừng kênh",
          "Kênh đã chuyển sang trạng thái tạm dừng (Inactive).",
        );
      } else {
        await activateChannel();
        await showSuccessAlert(
          "Đã kích hoạt kênh",
          "Kênh đã hoạt động và đang mở bán trực tiếp (Active).",
        );
      }
      onCatalogRefresh?.();
    } catch (err: unknown) {
      await showErrorAlert("Thao tác thất bại", err);
    }
  };

  const handleFullSync = async () => {
    if (!channel) return;
    try {
      await syncChannel();
      await showSuccessAlert(
        "Đã gửi yêu cầu đồng bộ",
        "Hệ thống đã yêu cầu Channex đẩy toàn bộ tồn phòng, giá và thông số sang sàn OTA.",
      );
    } catch (err: unknown) {
      await showErrorAlert("Không thể đồng bộ", err);
    }
  };

  const handleDelete = async () => {
    if (!channel) return;
    const confirmation = await showConfirmDialog({
      title: `Xác nhận xóa kết nối ${channel.title}?`,
      text: "Bạn sẽ ngắt hoàn toàn kết nối với sàn OTA này. Toàn bộ ánh xạ sẽ bị xóa.",
      confirmText: "Xóa kết nối",
      cancelText: "Giữ lại",
      icon: "error",
    });

    if (!confirmation.isConfirmed) return;

    try {
      await deleteChannel();
      await showSuccessAlert(
        "Đã xóa kết nối",
        "Kênh phân phối đã được ngắt và xóa thành công.",
      );
      onCatalogRefresh?.();
      onClose();
    } catch (err: unknown) {
      await showErrorAlert("Không thể xóa kết nối", err);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="channel-detail-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-[var(--outline-variant)] max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex flex-col gap-3 border-b border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-5 sm:flex-row sm:items-center sm:justify-between shrink-0">
          <div className="flex items-center gap-3.5">
            {channel ? (
              <ChannelLogo
                code={channel.code}
                title={channel.title}
                size="md"
                className="rounded-xl shadow-xs"
              />
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary)]/10 text-[var(--primary)] font-bold shadow-2xs">
                <VsIcon name="public" className="text-2xl" />
              </div>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="channel-detail-modal-title"
                  className="text-xl font-bold text-[var(--on-surface)]"
                >
                  {channel?.title ?? "Quản lý kết nối kênh OTA"}
                </h2>
                {channel && (
                  <>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 border border-slate-300 uppercase">
                      {channel.code}
                    </span>
                    {channel.isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Đang mở bán
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Tạm dừng
                      </span>
                    )}
                  </>
                )}
              </div>
              <p className="mt-0.5 text-sm text-[var(--on-surface-variant)]">
                Quản lý trạng thái, cập nhật ánh xạ phòng/giá và điều phối đồng bộ hai chiều.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-10 items-center gap-1.5 self-end rounded-xl border border-[var(--outline-variant)] bg-white px-4 text-sm font-bold text-[var(--on-surface)] hover:bg-[var(--surface-container-high)] shadow-2xs transition cursor-pointer sm:self-center"
          >
            <VsIcon name="close" className="text-base" />
            <span>Đóng</span>
          </button>
        </header>

        {/* Tab Selector */}
        <div className="flex border-b border-[var(--outline-variant)] bg-white px-6 pt-2 shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("MAPPING")}
            className={`min-h-11 flex items-center gap-2 border-b-2 px-4 text-sm font-bold transition cursor-pointer ${
              activeTab === "MAPPING"
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-[var(--on-surface-variant)] hover:text-gray-900"
            }`}
          >
            <VsIcon name="shuffle" className="text-base" />
            <span>Ánh xạ gói giá (Rate Mapping)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("SETTINGS")}
            className={`min-h-11 flex items-center gap-2 border-b-2 px-4 text-sm font-bold transition cursor-pointer ${
              activeTab === "SETTINGS"
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-[var(--on-surface-variant)] hover:text-gray-900"
            }`}
          >
            <VsIcon name="tune" className="text-base" />
            <span>Cài đặt & Thao tác kết nối</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <VsIcon
                name="refresh"
                className="animate-spin text-4xl text-[var(--primary)]"
              />
              <p className="mt-3 text-base font-semibold text-[var(--on-surface)]">
                Đang tải dữ liệu kết nối từ Channex API...
              </p>
              <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
                Kéo danh mục phòng, gói giá và trạng thái đồng bộ hiện tại.
              </p>
            </div>
          ) : isError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
              <VsIcon name="error" className="text-3xl text-red-600" />
              <h3 className="mt-2 text-lg font-bold text-red-950">
                Không thể tải thông tin kênh
              </h3>
              <p className="mt-1 text-sm text-red-800">
                {error instanceof Error ? error.message : "Lỗi kết nối API Channex"}
              </p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-red-800 px-4 text-sm font-bold text-white hover:bg-red-900 cursor-pointer"
              >
                <VsIcon name="refresh" className="text-base" />
                <span>Thử lại</span>
              </button>
            </div>
          ) : channel ? (
            activeTab === "MAPPING" ? (
              <div className="space-y-6">
                <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-950 flex items-start gap-3">
                  <VsIcon name="info" className="text-xl text-blue-700 shrink-0 mt-0.5" />
                  <div>
                    <strong>Quy tắc ánh xạ:</strong> Mỗi gói giá VietSage (PMS) được ghép với 1 Rate tương ứng trên sàn OTA. Giá và tồn phòng sẽ được tự động đồng bộ theo từng cặp ghép này.
                  </div>
                </div>

                {remoteRates.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-[var(--on-surface)]">
                        Danh sách gói giá ({channel.localRatePlans?.length ?? 0} gói giá nội bộ)
                      </h3>
                      <span className="text-xs text-[var(--on-surface-variant)]">
                        Đã tải {remoteRates.length} rate từ sàn OTA
                      </span>
                    </div>

                    {channel.localRatePlans?.map((localRatePlan) => {
                      const selectedKey = selectedRates[localRatePlan.id] ?? "";
                      const selectedRemote = remoteRates.find(
                        (item) => item.key === selectedKey,
                      );
                      const occupancyOptions = selectedRemote?.occupancies.length
                        ? selectedRemote.occupancies.filter(
                            (value) =>
                              !localRatePlan.occupancy ||
                              value <= localRatePlan.occupancy,
                          )
                        : [selectedRemote?.maxPersons ?? localRatePlan.occupancy ?? 1];
                      const selectedOccupancy = selectedRemote
                        ? resolveRateOccupancy(
                            selectedRemote,
                            occupancies[localRatePlan.id] ?? localRatePlan.occupancy,
                          )
                        : occupancyOptions.at(-1);

                      return (
                        <div
                          key={localRatePlan.id}
                          className="grid gap-3 rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_130px] lg:items-end hover:border-[var(--primary)]/40 transition shadow-2xs"
                        >
                          <div>
                            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--on-surface-variant)]">
                              Gói giá VietSage (PMS)
                            </span>
                            <p className="text-base font-bold text-[var(--on-surface)] mt-0.5">
                              {localRatePlan.title}
                            </p>
                            {localRatePlan.occupancy && (
                              <span className="inline-block mt-1 text-xs text-[var(--on-surface-variant)]">
                                Tối đa: {localRatePlan.occupancy} khách
                              </span>
                            )}
                          </div>

                          <label className="text-sm font-semibold text-[var(--on-surface)]">
                            <span className="block mb-1">Rate tương ứng trên {channel.title}</span>
                            <select
                              value={selectedKey}
                              onChange={(event) => {
                                const newKey = event.target.value;
                                setSelectedRates((prev) => ({
                                  ...prev,
                                  [localRatePlan.id]: newKey,
                                }));
                                setOccupancies((prev) => {
                                  const next = { ...prev };
                                  delete next[localRatePlan.id];
                                  return next;
                                });
                              }}
                              className="min-h-10 w-full rounded-xl border border-[var(--outline-variant)] bg-white px-3 text-sm font-medium text-[var(--on-surface)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                            >
                              <option value="">-- Không ánh xạ (Bỏ qua) --</option>
                              {remoteRates
                                .filter(
                                  (remoteRate) =>
                                    !localRatePlan.occupancy ||
                                    remoteRate.occupancies.some(
                                      (value) => value <= localRatePlan.occupancy!,
                                    ),
                                )
                                .map((remoteRate) => (
                                  <option key={remoteRate.key} value={remoteRate.key}>
                                    {remoteRate.roomTitle} — {remoteRate.rateTitle}
                                  </option>
                                ))}
                            </select>
                          </label>

                          <label className="text-sm font-semibold text-[var(--on-surface)]">
                            <span className="block mb-1">Số khách</span>
                            <select
                              disabled={!selectedRemote}
                              value={selectedOccupancy}
                              onChange={(event) =>
                                setOccupancies((prev) => ({
                                  ...prev,
                                  [localRatePlan.id]: Number(event.target.value),
                                }))
                              }
                              className="min-h-10 w-full rounded-xl border border-[var(--outline-variant)] bg-white px-3 text-sm font-medium text-[var(--on-surface)] disabled:opacity-50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                            >
                              {occupancyOptions.map((occ) => (
                                <option key={occ} value={occ}>
                                  {occ} khách
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      );
                    })}

                    <div className="flex justify-end pt-4 border-t border-[var(--outline-variant)]">
                      <button
                        type="button"
                        onClick={handleSaveMapping}
                        disabled={isUpdating}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--primary)] px-6 text-sm font-bold text-white shadow-xs hover:bg-[var(--primary)]/90 disabled:opacity-50 transition cursor-pointer"
                      >
                        <VsIcon
                          name={isUpdating ? "refresh" : "save"}
                          className={`text-base ${isUpdating ? "animate-spin" : ""}`}
                        />
                        <span>{isUpdating ? "Đang lưu ánh xạ..." : "Lưu ánh xạ mới"}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
                    <VsIcon name="warning" className="text-3xl text-amber-700" />
                    <h3 className="mt-2 text-base font-bold text-amber-950">
                      Channex chưa trả về bảng giá từ OTA cho kết nối này
                    </h3>
                    <p className="mt-1 text-sm text-amber-900">
                      Kênh này có thể cần xác thực trực tiếp hoặc dùng adapter đặc biệt. Bạn có thể mở phiên Channex Hub để kiểm tra chi tiết.
                    </p>
                    {onOpenChannexIframe && (
                      <button
                        type="button"
                        onClick={() => onOpenChannexIframe(channel.id)}
                        className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-900 px-4 text-sm font-bold text-white hover:bg-amber-950 cursor-pointer"
                      >
                        <VsIcon name="open_in_new" className="text-base" />
                        <span>Mở màn hình Channex Hub</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Tab 2: Settings & Operations */
              <div className="space-y-6">
                {/* Title and metadata card */}
                <div className="rounded-2xl border border-[var(--outline-variant)] bg-white p-5 shadow-sm space-y-4">
                  <h3 className="text-base font-bold text-[var(--on-surface)]">
                    Thông tin kênh phân phối
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--on-surface-variant)] mb-1">
                        Tên kết nối hiển thị
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          className="min-h-10 flex-1 rounded-xl border border-[var(--outline-variant)] bg-white px-3 text-sm text-[var(--on-surface)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                        />
                        <button
                          type="button"
                          onClick={handleSaveTitle}
                          disabled={isUpdating}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--outline-variant)] bg-white px-4 text-sm font-semibold text-[var(--on-surface)] hover:bg-[var(--surface-container-high)] shadow-2xs transition cursor-pointer"
                        >
                          <VsIcon name="save" className="text-base" />
                          <span>Lưu tên</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <span className="block text-xs font-semibold uppercase tracking-wider text-[var(--on-surface-variant)] mb-1">
                        Mã định danh Channel ID (Channex)
                      </span>
                      <input
                        type="text"
                        readOnly
                        value={channel.id}
                        className="min-h-10 w-full rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-3 text-sm font-mono text-[var(--on-surface-variant)]"
                      />
                    </div>
                  </div>
                </div>

                {/* Operations & Control Grid */}
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Status Toggle Card */}
                  <div className="rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-5 shadow-2xs space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">⚡</span>
                      <h4 className="text-base font-bold text-[var(--on-surface)]">
                        Trạng thái mở bán
                      </h4>
                    </div>
                    <p className="text-sm text-[var(--on-surface-variant)]">
                      {channel.isActive
                        ? "Kênh đang hoạt động và đồng bộ giá/tồn phòng tự động."
                        : "Kênh đang tạm dừng. Các đơn mới hoặc thay đổi giá sẽ không được gửi."}
                    </p>
                    <button
                      type="button"
                      onClick={handleToggleActive}
                      disabled={isActivating || isDeactivating}
                      className={`inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition cursor-pointer shadow-2xs ${
                        channel.isActive
                          ? "border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                          : "bg-emerald-700 text-white hover:bg-emerald-800"
                      }`}
                    >
                      <VsIcon
                        name={isActivating || isDeactivating ? "refresh" : channel.isActive ? "pause" : "play_arrow"}
                        className={`text-base ${isActivating || isDeactivating ? "animate-spin" : ""}`}
                      />
                      <span>
                        {isActivating
                          ? "Đang kích hoạt..."
                          : isDeactivating
                            ? "Đang tạm dừng..."
                            : channel.isActive
                              ? "Tạm dừng kết nối này"
                              : "Kích hoạt mở bán kênh"}
                      </span>
                    </button>
                  </div>

                  {/* Full Sync Card */}
                  <div className="rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-5 shadow-2xs space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🔄</span>
                      <h4 className="text-base font-bold text-[var(--on-surface)]">
                        Đồng bộ lại toàn bộ (Full Sync)
                      </h4>
                    </div>
                    <p className="text-sm text-[var(--on-surface-variant)]">
                      Gửi toàn bộ giá, tồn phòng và giới hạn từ PMS sang sàn OTA ngay lập tức.
                    </p>
                    <button
                      type="button"
                      onClick={handleFullSync}
                      disabled={isSyncing}
                      className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-[var(--outline-variant)] bg-white px-4 text-sm font-bold text-[var(--on-surface)] hover:bg-[var(--surface-container-high)] shadow-2xs transition cursor-pointer"
                    >
                      <VsIcon
                        name="sync"
                        className={`text-base ${isSyncing ? "animate-spin text-[var(--primary)]" : ""}`}
                      />
                      <span>{isSyncing ? "Đang gửi yêu cầu sync..." : "Chạy Full Sync ngay"}</span>
                    </button>
                  </div>
                </div>

                {/* Advanced Channex Iframe Fallback */}
                {onOpenChannexIframe && (
                  <div className="rounded-2xl border border-[var(--outline-variant)] bg-slate-50 p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        Cấu hình nâng cao qua Channex Hub
                      </h4>
                      <p className="mt-0.5 text-xs text-slate-600">
                        Dành cho trường hợp cần sửa Listing Airbnb, xem log audit hoặc cấu hình adapter chuyên sâu.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenChannexIframe(channel.id)}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-800 hover:bg-slate-100 shadow-2xs shrink-0 cursor-pointer"
                    >
                      <VsIcon name="open_in_new" className="text-sm" />
                      <span>Mở giao diện Channex</span>
                    </button>
                  </div>
                )}

                {/* Danger Zone: Delete Connection */}
                <div className="rounded-2xl border border-red-200 bg-red-50/50 p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">⚠️</span>
                    <h4 className="text-base font-bold text-red-950">
                      Vùng nguy hiểm: Ngắt kết nối kênh
                    </h4>
                  </div>
                  <p className="text-sm text-red-900">
                    Ngắt hoàn toàn kết nối với {channel.title}. Kênh sẽ ngừng nhận đơn và xóa bỏ mapping trong PMS.
                  </p>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-red-800 px-5 text-sm font-bold text-white hover:bg-red-900 disabled:opacity-50 transition cursor-pointer shadow-2xs"
                    >
                      <VsIcon
                        name={isDeleting ? "refresh" : "delete"}
                        className={`text-base ${isDeleting ? "animate-spin" : ""}`}
                      />
                      <span>{isDeleting ? "Đang xóa kết nối..." : "Ngắt kết nối và xóa kênh"}</span>
                    </button>
                  </div>
                </div>
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
