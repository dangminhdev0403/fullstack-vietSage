"use client";

import { useState } from "react";
import {
  showConfirmDialog,
  showErrorAlert,
  showSuccessAlert,
} from "@/libs/swal";
import {
  useChannelConnections,
  useCreateConnection,
  useDeleteConnection,
  useSyncConnection,
} from "../hooks/use-channel-manager";
import type {
  ChannelConnection,
  ChannelType,
} from "../types/channel-manager.types";

interface ChannelConnectionsTabProps {
  hotelId: string;
  roleScope?: "owner" | "admin";
}

const CHANNEL_CONFIG: Record<
  ChannelType,
  {
    label: string;
    brandColor: string;
    badgeBg: string;
    iconText: string;
    defaultOtaHost: string;
  }
> = {
  AIRBNB_ICAL: {
    label: "Airbnb iCal",
    brandColor: "text-rose-600 bg-rose-50 border-rose-200",
    badgeBg: "bg-rose-500",
    iconText: "🏠",
    defaultOtaHost: "airbnb.com",
  },
  BOOKING_ICAL: {
    label: "Booking.com iCal",
    brandColor: "text-blue-700 bg-blue-50 border-blue-200",
    badgeBg: "bg-blue-600",
    iconText: "🅱️",
    defaultOtaHost: "admin.booking.com",
  },
  AGODA_ICAL: {
    label: "Agoda iCal",
    brandColor: "text-cyan-700 bg-cyan-50 border-cyan-200",
    badgeBg: "bg-cyan-600",
    iconText: "🔷",
    defaultOtaHost: "ycs.agoda.com",
  },
  DIRECT_BOOKING: {
    label: "VietSage Direct Engine",
    brandColor: "text-emerald-800 bg-emerald-50 border-emerald-200",
    badgeBg: "bg-emerald-600",
    iconText: "⚡",
    defaultOtaHost: "vietsage.com",
  },
  CHANNEX: {
    label: "Channex Global OTA (API Direct)",
    brandColor: "text-purple-700 bg-purple-50 border-purple-200",
    badgeBg: "bg-purple-600",
    iconText: "🌐",
    defaultOtaHost: "staging.channex.io",
  },
};

function formatDateTime(isoString: string | null): string {
  if (!isoString) return "Chưa từng đồng bộ";
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(date);
  } catch {
    return isoString;
  }
}

export function ChannelConnectionsTab({
  hotelId,
  roleScope = "owner",
}: ChannelConnectionsTabProps) {
  const { connections, isLoading, isFetching, isError, error, refetch } =
    useChannelConnections({ hotelId, roleScope });

  const { createConnection, isCreating } = useCreateConnection({
    hotelId,
    roleScope,
  });
  const { deleteConnection, isDeleting } = useDeleteConnection({
    hotelId,
    roleScope,
  });
  const { syncConnection, isSyncing, syncingConnectionId } = useSyncConnection({
    hotelId,
    roleScope,
  });

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedChannelType, setSelectedChannelType] =
    useState<ChannelType>("AIRBNB_ICAL");
  const [connectionName, setConnectionName] = useState("");
  const [inboundUrl, setInboundUrl] = useState("");

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyOutboundUrl = (url: string, id: string) => {
    void navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  const handleSyncNow = async (conn: ChannelConnection) => {
    try {
      const res = await syncConnection(conn.id);
      await showSuccessAlert(
        "Đồng bộ thành công",
        res.message || `Kênh "${conn.name}" đã được cập nhật lịch tức thời.`,
      );
      void refetch();
    } catch (err) {
      await showErrorAlert("Lỗi đồng bộ", err);
    }
  };

  const handleDelete = async (conn: ChannelConnection) => {
    const confirmed = await showConfirmDialog({
      title: `Xóa kết nối "${conn.name}"?`,
      text: "Thao tác này sẽ hủy đồng bộ lịch phòng tự động giữa VietSage và kênh phân phối này.",
      confirmText: "Xác nhận xóa",
      cancelText: "Hủy bỏ",
      icon: "warning",
    });

    if (confirmed.isConfirmed) {
      try {
        await deleteConnection(conn.id);
        await showSuccessAlert(
          "Đã xóa kết nối",
          `Đã xóa thành công kênh "${conn.name}".`,
        );
        void refetch();
      } catch (err) {
        await showErrorAlert("Không thể xóa kết nối", err);
      }
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!connectionName.trim()) {
      await showErrorAlert(
        "Thiếu tên gợi nhớ",
        "Vui lòng nhập tên nhận diện cho kết nối này.",
      );
      return;
    }

    if (!inboundUrl.trim()) {
      await showErrorAlert(
        "Thiếu link iCal",
        "Vui lòng dán link iCal (Inbound URL) từ sàn OTA.",
      );
      return;
    }

    try {
      await createConnection({
        channelType: selectedChannelType,
        name: connectionName.trim(),
        inboundUrl: inboundUrl.trim(),
      });

      await showSuccessAlert(
        "Thêm kết nối thành công",
        `Kênh "${connectionName.trim()}" đã được kết nối. Hãy sao chép link xuất iCal của VietSage để dán vào cấu hình trên sàn.`,
      );

      setIsAddModalOpen(false);
      setConnectionName("");
      setInboundUrl("");
      void refetch();
    } catch (err) {
      await showErrorAlert("Tạo kết nối thất bại", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Kênh Phân Phối Đã Kết Nối</span>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              {connections.length} Kênh
            </span>
          </h2>
          <p className="text-sm font-medium text-slate-600 mt-1">
            Đồng bộ lịch phòng 2 chiều (2-Way iCal Sync) tự động giữa VietSage
            và các nền tảng OTA quốc tế.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            title="Làm mới danh sách"
            className="h-11 px-4 rounded-full border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 hover:bg-slate-100 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <span className={isFetching ? "animate-spin" : ""}>🔄</span>
            <span className="hidden sm:inline">Làm mới</span>
          </button>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="h-11 px-6 rounded-full bg-[#25483f] text-white text-sm sm:text-base font-extrabold shadow-lg shadow-[#25483f]/25 hover:bg-[#1a352d] transition-all flex items-center gap-2 cursor-pointer"
          >
            <span>＋</span>
            <span>Thêm Kênh Kết Nối</span>
          </button>
        </div>
      </div>

      {/* Connections List */}
      {isLoading ? (
        <div className="bg-white p-16 rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center justify-center space-y-3">
          <div className="w-9 h-9 border-4 border-emerald-700 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-base font-bold text-slate-700">
            Đang tải danh sách kết nối kênh...
          </p>
        </div>
      ) : isError ? (
        <div className="bg-rose-50 p-10 rounded-3xl border border-rose-200 text-center space-y-3">
          <h3 className="text-lg font-extrabold text-rose-900">
            Không thể tải kết nối từ DB
          </h3>
          <p className="text-sm font-medium text-rose-700">
            {error instanceof Error
              ? error.message
              : "Yêu cầu tới backend thất bại"}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="h-10 px-5 rounded-full bg-rose-800 text-white text-sm font-bold"
          >
            Thử lại
          </button>
        </div>
      ) : connections.length === 0 ? (
        <div className="bg-white p-12 rounded-3xl border border-slate-200 shadow-sm text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-3xl mx-auto">
            📡
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">
              Chưa có kênh phân phối nào được kết nối
            </h3>
            <p className="text-sm font-medium text-slate-500 max-w-md mx-auto mt-1">
              Thêm kết nối iCal từ Airbnb, Booking.com hoặc Agoda để đồng bộ
              lịch đặt phòng và chống trùng phòng (Overbooking) tự động.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="h-11 px-6 rounded-full bg-[#25483f] text-white text-base font-bold hover:bg-[#1a352d] transition-all cursor-pointer"
          >
            ＋ Kết nối kênh đầu tiên
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {connections.map((conn) => {
            const config = CHANNEL_CONFIG[conn.channelType] || {
              label: conn.channelType,
              brandColor: "text-slate-700 bg-slate-50 border-slate-200",
              badgeBg: "bg-slate-600",
              iconText: "🔗",
              defaultOtaHost: "ota.com",
            };

            const isSyncingThis = isSyncing && syncingConnectionId === conn.id;

            return (
              <div
                key={conn.id}
                className="bg-white rounded-3xl border border-slate-200 shadow-xs hover:shadow-md transition-all p-5 sm:p-6 flex flex-col gap-5"
              >
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl bg-slate-100 border border-slate-200/80 shadow-2xs">
                      {config.iconText}
                    </span>
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                          {conn.name}
                        </h3>
                        <span
                          className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${config.brandColor}`}
                        >
                          {config.label}
                        </span>
                        {conn.syncStatus === "SUCCESS" && (
                          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                            Hoạt động bình thường
                          </span>
                        )}
                        {conn.syncStatus === "ERROR" && (
                          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                            Lỗi kết nối
                          </span>
                        )}
                        {conn.syncStatus === "IDLE" && (
                          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                            Chờ đồng bộ
                          </span>
                        )}
                        {conn.syncStatus === "PAUSED" && (
                          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                            Tạm dừng
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-slate-500 mt-1">
                        Cập nhật lần cuối:{" "}
                        <strong className="text-slate-700 font-bold">
                          {formatDateTime(conn.lastSyncAt)}
                        </strong>
                      </p>
                      {conn.errorReason && (
                        <p className="text-xs font-semibold text-rose-700 mt-1">
                          Lỗi gần nhất: {conn.errorReason}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions right */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isSyncingThis}
                      onClick={() => handleSyncNow(conn)}
                      className="h-10 px-4 rounded-full bg-emerald-50 text-emerald-900 border border-emerald-300/80 hover:bg-emerald-100 text-xs sm:text-sm font-extrabold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <span className={isSyncingThis ? "animate-spin" : ""}>
                        🔄
                      </span>
                      <span>
                        {isSyncingThis ? "Đang đồng bộ..." : "Đồng bộ ngay"}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => handleDelete(conn)}
                      title="Xóa kết nối"
                      className="h-10 w-10 rounded-full border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors flex items-center justify-center text-sm font-bold cursor-pointer disabled:opacity-50"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* URLs section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* 1. Inbound URL */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        Liên kết lịch từ kênh OTA (Nhập vào)
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500">
                        VietSage đọc dữ liệu từ đây
                      </span>
                    </div>
                    <div className="font-mono text-xs text-slate-800 break-all bg-white p-2.5 rounded-xl border border-slate-200 select-all">
                      {conn.inboundUrl}
                    </div>
                  </div>

                  {/* 2. Outbound URL */}
                  <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-200/80 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                        Liên kết lịch VietSage (Xuất đi)
                      </span>
                      <span className="text-[11px] font-semibold text-emerald-700">
                        Dán link này sang {config.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="font-mono text-xs text-emerald-950 break-all bg-white p-2.5 rounded-xl border border-emerald-200 flex-1 select-all">
                        {conn.outboundUrl}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyOutboundUrl(conn.outboundUrl, conn.id)
                        }
                        className={`h-10 px-3.5 rounded-xl text-xs font-extrabold transition-all shrink-0 flex items-center gap-1 cursor-pointer border ${
                          copiedId === conn.id
                            ? "bg-emerald-700 text-white border-emerald-800"
                            : "bg-white text-emerald-900 border-emerald-300 hover:bg-emerald-50"
                        }`}
                      >
                        <span>{copiedId === conn.id ? "✓" : "📋"}</span>
                        <span>
                          {copiedId === conn.id ? "Đã copy!" : "Copy Link"}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Connection Modal */}
      {isAddModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
        >
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-900 to-[#1a352d] text-white">
              <div>
                <h3 className="text-xl font-extrabold tracking-tight">
                  Thêm Kênh Phân Phối Mới
                </h3>
                <p className="text-sm font-medium text-emerald-100/90 mt-0.5">
                  Thiết lập đồng bộ lịch phòng tự động qua chuẩn iCal
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-2 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form
              onSubmit={handleCreateSubmit}
              className="p-6 space-y-5 overflow-y-auto"
            >
              {/* Channel Type Selector */}
              <div>
                <label className="block text-sm font-bold text-slate-900 mb-1.5">
                  Chọn kênh phân phối
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {(
                    [
                      "AIRBNB_ICAL",
                      "BOOKING_ICAL",
                      "AGODA_ICAL",
                      "DIRECT_BOOKING",
                    ] as ChannelType[]
                  ).map((type) => {
                    const cfg = CHANNEL_CONFIG[type];
                    const isSelected = selectedChannelType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setSelectedChannelType(type)}
                        className={`p-3 rounded-2xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                          isSelected
                            ? "bg-emerald-50 border-emerald-600 text-emerald-950 font-bold shadow-xs ring-1 ring-emerald-600"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-medium"
                        }`}
                      >
                        <span className="text-xl">{cfg.iconText}</span>
                        <span className="text-sm leading-tight">
                          {cfg.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Connection Name */}
              <div>
                <label className="block text-sm font-bold text-slate-900 mb-1.5">
                  Tên gợi nhớ cho kênh
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Căn hộ 301 - Airbnb, Bungalow Vườn - Booking..."
                  value={connectionName}
                  onChange={(e) => setConnectionName(e.target.value)}
                  className="w-full h-11 px-4 rounded-2xl border border-slate-200 bg-white text-slate-900 text-sm sm:text-base font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  required
                />
              </div>

              {/* Inbound URL */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-bold text-slate-900">
                    Đường dẫn xuất lịch từ kênh OTA
                  </label>
                  <span className="text-xs text-slate-500">
                    Bắt đầu bằng http:// hoặc https://
                  </span>
                </div>
                <textarea
                  rows={3}
                  placeholder={`Dán link xuất iCal từ ${CHANNEL_CONFIG[selectedChannelType].label} vào đây...`}
                  value={inboundUrl}
                  onChange={(e) => setInboundUrl(e.target.value)}
                  className="w-full p-3.5 rounded-2xl border border-slate-200 bg-white text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all leading-relaxed"
                  required
                />
              </div>

              {/* 2-Way Sync Info Note */}
              <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-4 text-xs text-amber-950 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-sm">
                  <span>💡</span>
                  <span>Nguyên lý đồng bộ lịch 2 chiều:</span>
                </div>
                <p className="leading-relaxed pl-5">
                  Sau khi tạo kết nối, VietSage sẽ cấp cho bạn một{" "}
                  <strong>Liên kết lịch VietSage</strong>. Hãy sao chép link đó dán vào
                  mục Nhập Lịch trên sàn để khi phòng đóng trên VietSage thì cũng lập tức được đóng trên sàn.
                </p>
              </div>

              {/* Modal Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={isCreating}
                  className="h-11 px-6 rounded-full border border-slate-300 bg-white text-base font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="h-11 px-7 rounded-full bg-[#25483f] text-base font-extrabold text-white shadow-lg shadow-[#25483f]/25 hover:bg-[#1a352d] transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isCreating ? "Đang kết nối..." : "Tạo Kết Nối"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
