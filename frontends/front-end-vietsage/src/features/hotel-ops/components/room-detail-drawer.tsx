"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { BrandedRoomQr } from "@/features/hotel-ops/components/branded-room-qr";
import type { HotelRoomSummary } from "@/features/hotel-ops/types/hotel-ops-contract";
import { filterExtraOccupants } from "@/features/hotel-ops/utils/hotel-ops-display";

type RoomDetailDrawerProps = {
  room: HotelRoomSummary | null;
  clientOrigin: string;
  onClose: () => void;
  onEditRoom?: (room: HotelRoomSummary) => void;
  onToggleBlocked?: (room: HotelRoomSummary) => void;
  onQrAction?: (room: HotelRoomSummary, action: "rotate" | "activate" | "deactivate") => void;
  onOpenQrModal?: (room: HotelRoomSummary) => void;
};

const ROOM_STATUS_MAP: Record<string, { label: string; bg: string; text: string; icon: string }> = {
  AVAILABLE: { label: "Trống (Sẵn sàng)", bg: "bg-emerald-100", text: "text-emerald-800", icon: "check_circle" },
  OCCUPIED: { label: "Đang ở", bg: "bg-blue-100", text: "text-blue-800", icon: "person" },
  PROCESSING: { label: "Chờ dọn", bg: "bg-amber-100", text: "text-amber-800", icon: "cleaning_services" },
  MAINTENANCE: { label: "Bảo trì", bg: "bg-rose-100", text: "text-rose-800", icon: "build" },
  BLOCKED: { label: "Đã khóa", bg: "bg-slate-200", text: "text-slate-800", icon: "lock" },
};

const QR_STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  ACTIVE: { label: "Đang hoạt động", bg: "bg-emerald-100", text: "text-emerald-800" },
  INACTIVE: { label: "Tạm tắt", bg: "bg-amber-100", text: "text-amber-800" },
  DISABLED: { label: "Tạm tắt", bg: "bg-amber-100", text: "text-amber-800" },
  REVOKED: { label: "Đã thu hồi", bg: "bg-rose-100", text: "text-rose-800" },
  EXPIRED: { label: "Hết hạn", bg: "bg-slate-200", text: "text-slate-800" },
};

function formatVnd(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "Chưa thiết lập giá";
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return "Chưa thiết lập giá";
    return new Intl.NumberFormat("vi-VN").format(value) + " ₫";
  }
  const str = String(value).trim();
  const directNum = Number(str);
  if (Number.isFinite(directNum) && directNum > 0) {
    return new Intl.NumberFormat("vi-VN").format(Math.round(directNum)) + " ₫";
  }
  const rawDigits = str.replace(/[^\d]/g, "");
  const num = rawDigits ? parseInt(rawDigits, 10) : NaN;
  if (!Number.isFinite(num) || num <= 0) return "Chưa thiết lập giá";
  return new Intl.NumberFormat("vi-VN").format(num) + " ₫";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "--";
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function RoomDetailDrawer({
  room,
  clientOrigin,
  onClose,
  onEditRoom,
  onToggleBlocked,
  onQrAction,
  onOpenQrModal,
}: Readonly<RoomDetailDrawerProps>) {
  const qrCodeRef = useRef<SVGSVGElement | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    if (room) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [room, onClose]);

  const roomNumber = useMemo(() => room?.roomNumber?.trim() || room?.id || "--", [room]);

  const currentRoomStatus = useMemo(
    () => (room?.status?.trim().toUpperCase() || "AVAILABLE"),
    [room?.status]
  );

  const roomStatusMeta = useMemo(
    () => ROOM_STATUS_MAP[currentRoomStatus] ?? { label: currentRoomStatus, bg: "bg-slate-100", text: "text-slate-800", icon: "info" },
    [currentRoomStatus]
  );

  const rawQrStatus = useMemo(
    () => (room?.qr?.status ?? room?.qrStatus ?? "INACTIVE").trim().toUpperCase(),
    [room?.qr?.status, room?.qrStatus]
  );

  const publicQrCode = useMemo(
    () => (rawQrStatus === "ACTIVE" ? (room?.qr?.publicCode?.trim() || null) : null),
    [rawQrStatus, room?.qr?.publicCode]
  );

  const guestQrUrl = useMemo(() => {
    if (!publicQrCode) return null;
    const baseOrigin = clientOrigin || (typeof window !== "undefined" ? window.location.origin : "");
    return `${baseOrigin.replace(/\/$/, "")}/g/${encodeURIComponent(publicQrCode)}`;
  }, [clientOrigin, publicQrCode]);

  const qrStatusMeta = useMemo(
    () => QR_STATUS_MAP[rawQrStatus] ?? { label: rawQrStatus, bg: "bg-slate-100", text: "text-slate-800" },
    [rawQrStatus]
  );

  const activeStay = room?.activeStay;

  const extraOccupants = useMemo(() => {
    if (!activeStay) return [];
    return filterExtraOccupants(activeStay.occupants, activeStay);
  }, [activeStay]);

  async function handleCopyLink() {
    if (!guestQrUrl) return;
    try {
      await navigator.clipboard.writeText(guestQrUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }

  if (!room) return null;

  const isBlocked = currentRoomStatus === "BLOCKED";
  const isOccupied = currentRoomStatus === "OCCUPIED";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Centered Modal Container - Balanced, compact, fits viewport without unnecessary height */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-drawer-title"
        className="relative z-10 flex w-full max-w-3xl flex-col rounded-3xl bg-[#fdfbf7] shadow-[0_24px_70px_rgba(0,0,0,0.35)] border border-[#1f3d35]/20 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1f3d35]/15 bg-[#17201b] px-6 py-4 text-[#f8f1e6]">
          <div className="flex items-center gap-3 min-w-0">
            {/* Room number badge with proper min-width so digits like #1013 never clip */}
            <div className="flex h-10 min-w-[3.25rem] px-3 items-center justify-center rounded-xl bg-[#e8b363] text-[#17201b] shadow-sm font-extrabold text-sm tracking-tight shrink-0">
              #{roomNumber}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 id="room-drawer-title" className="text-lg sm:text-xl font-bold text-[#fff8e8] truncate">
                  Phòng #{roomNumber}
                </h2>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider shrink-0 ${roomStatusMeta.bg} ${roomStatusMeta.text}`}>
                  <VsIcon name={roomStatusMeta.icon} className="text-xs" />
                  {roomStatusMeta.label}
                </span>
              </div>
              <p className="text-xs text-[#d7cbb8] mt-0.5 flex items-center gap-2 truncate">
                <span>Loại phòng: <strong className="text-[#fff8e8]">{room.type ?? "Tiêu chuẩn"}</strong></span>
                <span className="text-[#d7cbb8]/40">•</span>
                <span>Vị trí: <strong className="text-[#fff8e8]">{room.floor ? `Tầng ${room.floor}` : "Chưa xác định"}</strong></span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#f8f1e6]/15 bg-white/5 text-[#d7cbb8] hover:bg-white/15 hover:text-[#fff8e8] transition focus:outline-none focus:ring-2 focus:ring-[#e8b363]"
            title="Đóng (Esc)"
            aria-label="Đóng chi tiết phòng"
          >
            <VsIcon name="close" className="text-lg" />
          </button>
        </div>

        {/* Content Body - Clean, balanced 2 columns without redundant data */}
        <div className="p-4 sm:p-5 text-[#17201b]">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            {/* Left Column: Room Specs, Guest Status & Quick Actions */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-3">
              {/* Room Specs Details - Only non-redundant essential metrics */}
              <div className="rounded-2xl border border-[#1f3d35]/10 bg-white p-3.5 shadow-xs">
                <div className="flex items-center justify-between border-b border-[#1f3d35]/10 pb-1.5 mb-2.5">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8a6a13] flex items-center gap-1.5">
                    <VsIcon name="info" className="text-xs text-[#8a6a13]" />
                    THÔNG TIN CƠ BẢN PHÒNG
                  </h3>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-slate-50 p-2 border border-slate-100">
                    <span className="text-[10px] font-semibold text-slate-500 block">Giá niêm yết</span>
                    <p className="font-extrabold text-xs text-emerald-700 mt-0.5 tabular-nums truncate">
                      {formatVnd(room.price)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2 border border-slate-100">
                    <span className="text-[10px] font-semibold text-slate-500 block">Thiết bị tối đa</span>
                    <p className="font-bold text-xs text-slate-900 mt-0.5 truncate">
                      {room.activeGuestDeviceCount ?? 0} / {room.maxActiveGuestDevices ?? 3} TB
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2 border border-slate-100">
                    <span className="text-[10px] font-semibold text-slate-500 block">Trạng thái QR</span>
                    <p className="font-bold text-xs text-emerald-800 mt-0.5 truncate flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                      {qrStatusMeta.label}
                    </p>
                  </div>
                </div>
              </div>

              {/* Guest / Occupancy Section */}
              {activeStay ? (
                <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-3.5 shadow-xs space-y-2">
                  <div className="flex items-center justify-between border-b border-blue-200/60 pb-1.5">
                    <div className="flex items-center gap-1.5">
                      <VsIcon name="person" className="text-sm text-blue-700" />
                      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-800">
                        Khách đang lưu trú
                      </span>
                    </div>
                    <span className="rounded-full bg-blue-200 px-2 py-0.5 text-[10px] font-bold text-blue-900">
                      {1 + extraOccupants.length} khách
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <strong className="text-sm font-extrabold text-blue-950">
                        {activeStay.guestDisplayName || "Chưa có tên"}
                      </strong>
                      <span className="ml-1.5 text-[11px] font-semibold text-blue-700">
                        (Chủ phòng)
                      </span>
                    </div>
                    {activeStay.guestPhone ? (
                      <span className="rounded-lg bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-800">
                        📞 {activeStay.guestPhone}
                      </span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-blue-900/90 pt-1 border-t border-blue-200/50">
                    <p><span className="font-semibold text-blue-950">CCCD:</span> {activeStay.guestIdentityNumber || "--"}</p>
                    <p><span className="font-semibold text-blue-950">Mã đặt:</span> {activeStay.reservationCode || "--"}</p>
                    <p><span className="font-semibold text-blue-950">Check-in:</span> {formatDateTime(activeStay.checkedInAt ?? activeStay.plannedCheckInAt)}</p>
                    <p><span className="font-semibold text-blue-950">Check-out:</span> {formatDateTime(activeStay.plannedCheckOutAt)}</p>
                  </div>
                  {extraOccupants.length > 0 ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-blue-900 pt-1 border-t border-blue-200/50">
                      <span className="font-semibold text-blue-950 shrink-0">Đi cùng:</span>
                      <span className="truncate font-medium text-slate-700">
                        {extraOccupants.map((occ, i) => occ.fullName || `Khách #${i + 1}`).join(", ")}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-3 flex items-center gap-2.5 text-xs text-emerald-950">
                  <VsIcon name="check_circle" className="text-lg text-emerald-600 shrink-0" />
                  <div>
                    <strong className="block font-bold">Phòng trống · Sẵn sàng đón khách mới</strong>
                    <span className="text-slate-600 text-[11px]">Chưa có lượt lưu trú hoạt động. Khách có thể quét mã QR để nhận phòng.</span>
                  </div>
                </div>
              )}

              {/* Quick Action Toolbar */}
              <div className="rounded-2xl border border-[#1f3d35]/10 bg-white p-3 shadow-xs">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8a6a13] mb-1.5">
                  THAO TÁC NHANH
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {onEditRoom ? (
                    <button
                      type="button"
                      onClick={() => onEditRoom(room)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 transition hover:bg-slate-100 shadow-2xs"
                    >
                      <VsIcon name="edit" className="text-sm text-blue-600" />
                      Chỉnh sửa phòng
                    </button>
                  ) : null}

                  {onToggleBlocked && !isOccupied ? (
                    <button
                      type="button"
                      onClick={() => onToggleBlocked(room)}
                      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition shadow-2xs ${
                        isBlocked
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                          : "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
                      }`}
                    >
                      <VsIcon name={isBlocked ? "task_alt" : "block"} className="text-sm" />
                      {isBlocked ? "Mở khóa phòng" : "Khóa phòng"}
                    </button>
                  ) : null}

                  {rawQrStatus === "ACTIVE" && onQrAction ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onQrAction(room, "rotate")}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800 transition hover:bg-blue-100 shadow-2xs"
                      >
                        <VsIcon name="history" className="text-sm text-blue-600" />
                        Đổi / xoay mã QR
                      </button>
                      <button
                        type="button"
                        onClick={() => onQrAction(room, "deactivate")}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 transition hover:bg-amber-100 shadow-2xs"
                      >
                        <VsIcon name="visibility_off" className="text-sm text-amber-600" />
                        Tạm tắt QR
                      </button>
                    </>
                  ) : onQrAction ? (
                    <button
                      type="button"
                      onClick={() => onQrAction(room, "activate")}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 shadow-2xs"
                    >
                      <VsIcon name="verified" className="text-sm text-emerald-600" />
                      Kích hoạt mã QR
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Right Column: QR Code & Operations - Balanced & Compact */}
            <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl border border-[#1f3d35]/10 bg-white p-4 shadow-xs text-center space-y-3">
              <div className="flex items-center justify-between border-b border-[#1f3d35]/10 pb-1.5">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8a6a13] flex items-center gap-1.5">
                  <VsIcon name="qr_code_scanner" className="text-xs text-[#8a6a13]" />
                  MÃ QR THÔNG MINH
                </h3>
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                  GuestOS
                </span>
              </div>

              {guestQrUrl ? (
                <div className="flex flex-col items-center space-y-2.5 w-full">
                  {/* QR Preview Box with clean compact sizing */}
                  <div className="relative aspect-square w-full max-w-[170px] rounded-2xl border border-slate-200 p-2 bg-white shadow-xs flex items-center justify-center">
                    <BrandedRoomQr
                      ref={qrCodeRef}
                      value={guestQrUrl}
                      size={155}
                      className="h-full w-full"
                      title={`QR GuestOS phòng ${roomNumber}`}
                    />
                  </div>

                  {/* Public Link Box with Copy Button */}
                  <div className="w-full flex items-center gap-1 rounded-xl bg-slate-50 border border-slate-200 p-1">
                    <span
                      className="flex-1 truncate font-mono text-[10px] text-slate-600 px-1 text-left select-all"
                      title={guestQrUrl}
                    >
                      {guestQrUrl}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopyLink()}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700 border border-slate-200 hover:bg-slate-100 transition shadow-2xs"
                      title="Sao chép liên kết khách lưu trú"
                    >
                      <VsIcon name={copied ? "check" : "content_copy"} className="text-xs text-emerald-700" />
                      <span>{copied ? "Đã chép" : "Chép link"}</span>
                    </button>
                  </div>

                  {/* Primary View Full QR Button */}
                  {onOpenQrModal ? (
                    <button
                      type="button"
                      onClick={() => onOpenQrModal(room)}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#17201b] px-3.5 py-2 text-xs font-bold text-[#fff8e8] hover:bg-[#25483f] transition shadow-md focus:outline-none focus:ring-2 focus:ring-[#e8b363]"
                    >
                      <VsIcon name="qr_code" className="text-sm text-[#e8b363]" />
                      <span>Xem / Tải mã QR full size</span>
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center space-y-2.5 w-full">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400 mx-auto">
                    <VsIcon name="qr_code_scanner" className="text-2xl" />
                  </div>
                  <p className="text-xs text-slate-600 font-medium max-w-xs">
                    Phòng này hiện chưa kích hoạt mã QR công khai.
                  </p>
                  {onQrAction ? (
                    <button
                      type="button"
                      onClick={() => onQrAction(room, "activate")}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 transition shadow-md"
                    >
                      <VsIcon name="verified" className="text-xs" />
                      Tạo mã QR ngay
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-[#1f3d35]/15 bg-white px-5 py-3 flex justify-between items-center">
          <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
            <VsIcon name="apartment" className="text-xs text-[#8a6a13]" />
            VietSage Hospitality SaaS · Quản trị phòng
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-slate-100 px-5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition focus:outline-none focus:ring-2 focus:ring-[#e8b363]"
          >
            Đóng (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
