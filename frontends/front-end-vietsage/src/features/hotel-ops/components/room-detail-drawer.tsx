"use client";

import { useMemo, useRef } from "react";

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

const ROOM_STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  AVAILABLE: { label: "Trống", bg: "bg-emerald-100", text: "text-emerald-800" },
  OCCUPIED: { label: "Đang ở", bg: "bg-blue-100", text: "text-blue-800" },
  PROCESSING: { label: "Chờ dọn", bg: "bg-amber-100", text: "text-amber-800" },
  MAINTENANCE: { label: "Bảo trì", bg: "bg-rose-100", text: "text-rose-800" },
  BLOCKED: { label: "Đã khóa", bg: "bg-slate-200", text: "text-slate-800" },
};

const QR_STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  ACTIVE: { label: "Đang hoạt động", bg: "bg-emerald-100", text: "text-emerald-800" },
  INACTIVE: { label: "Tạm tắt", bg: "bg-amber-100", text: "text-amber-800" },
  DISABLED: { label: "Tạm tắt", bg: "bg-amber-100", text: "text-amber-800" },
  REVOKED: { label: "Đã thu hồi", bg: "bg-rose-100", text: "text-rose-800" },
  EXPIRED: { label: "Hết hạn", bg: "bg-slate-200", text: "text-slate-800" },
};

function formatVnd(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "--";
  const num = typeof value === "number" ? value : Number(String(value).replace(/\D/g, ""));
  if (!Number.isFinite(num)) return "--";
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

  const roomNumber = useMemo(() => room?.roomNumber?.trim() || room?.id || "--", [room]);

  const currentRoomStatus = useMemo(
    () => (room?.status?.trim().toUpperCase() || "AVAILABLE"),
    [room?.status]
  );

  const roomStatusMeta = useMemo(
    () => ROOM_STATUS_MAP[currentRoomStatus] ?? { label: currentRoomStatus, bg: "bg-slate-100", text: "text-slate-800" },
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

  const qrStatusMeta = useMemo(() => {
    if (!publicQrCode && rawQrStatus === "INACTIVE") {
      return { label: "Chưa tạo", bg: "bg-slate-100", text: "text-slate-600" };
    }
    return QR_STATUS_MAP[rawQrStatus] ?? { label: rawQrStatus, bg: "bg-slate-100", text: "text-slate-800" };
  }, [publicQrCode, rawQrStatus]);

  const guestQrUrl = useMemo(() => {
    if (!publicQrCode) return null;
    const path = `/g/${encodeURIComponent(publicQrCode)}`;
    return clientOrigin ? `${clientOrigin.replace(/\/$/, "")}${path}` : path;
  }, [publicQrCode, clientOrigin]);

  const activeStay = room?.activeStay;
  const extraOccupants = useMemo(() => {
    if (!activeStay) return [];
    return filterExtraOccupants(activeStay.occupants, activeStay);
  }, [activeStay]);

  if (!room) return null;

  const isBlocked = currentRoomStatus === "BLOCKED";
  const isOccupied = currentRoomStatus === "OCCUPIED";

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-drawer-title"
        className="absolute inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-[#fffaf0] shadow-2xl border-l border-[#1f3d35]/15 transition-transform duration-300 ease-in-out"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1f3d35]/10 bg-[#17201b] px-6 py-5 text-[#f8f1e6]">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#e8b363] text-[#17201b] shadow-md font-bold text-lg">
              #{roomNumber}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="room-drawer-title" className="text-xl font-bold text-[#fff8e8]">
                  Phòng #{roomNumber}
                </h2>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${roomStatusMeta.bg} ${roomStatusMeta.text}`}>
                  {roomStatusMeta.label}
                </span>
              </div>
              <p className="text-xs text-[#d7cbb8] mt-0.5">
                Loại: <span className="font-semibold text-[#f8f1e6]">{room.type ?? "--"}</span> · Tầng: <span className="font-semibold text-[#f8f1e6]">{room.floor ?? "--"}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#f8f1e6]/15 bg-white/5 text-[#d7cbb8] hover:bg-white/15 hover:text-[#fff8e8] transition"
            title="Đóng chi tiết phòng"
            aria-label="Đóng chi tiết phòng"
          >
            <VsIcon name="close" className="text-lg" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 custom-scrollbar text-[#17201b]">
          {/* Quick Action Toolbar inside Drawer */}
          <div className="rounded-2xl border border-[#1f3d35]/10 bg-white p-4 shadow-sm space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8a6a13]">
              THAO TÁC NHANH
            </p>
            <div className="flex flex-wrap gap-2">
              {onEditRoom ? (
                <button
                  type="button"
                  onClick={() => onEditRoom(room)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-800 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  <VsIcon name="edit" className="text-sm text-blue-600" />
                  Chỉnh sửa phòng
                </button>
              ) : null}

              {onToggleBlocked && !isOccupied ? (
                <button
                  type="button"
                  onClick={() => onToggleBlocked(room)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
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
                    className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-800 transition hover:bg-blue-100"
                  >
                    <VsIcon name="history" className="text-sm" />
                    Đổi / xoay mã QR
                  </button>
                  <button
                    type="button"
                    onClick={() => onQrAction(room, "deactivate")}
                    className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-800 transition hover:bg-amber-100"
                  >
                    <VsIcon name="visibility_off" className="text-sm" />
                    Tạm tắt QR
                  </button>
                </>
              ) : onQrAction ? (
                <button
                  type="button"
                  onClick={() => onQrAction(room, "activate")}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100"
                >
                  <VsIcon name="verified" className="text-sm" />
                  Kích hoạt mã QR
                </button>
              ) : null}
            </div>
          </div>

          {/* Room Specs Details */}
          <div className="rounded-2xl border border-[#1f3d35]/10 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-[#8a6a13]">
              THÔNG TIN CƠ BẢN PHÒNG
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <span className="text-xs font-medium text-slate-500">Số phòng</span>
                <p className="font-bold text-slate-900">#{roomNumber}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium text-slate-500">Loại phòng</span>
                <p className="font-bold text-slate-900">{room.type || "--"}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium text-slate-500">Vị trí tầng</span>
                <p className="font-bold text-slate-900">{room.floor ? `Tầng ${room.floor}` : "--"}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium text-slate-500">Giá niêm yết</span>
                <p className="font-bold text-emerald-700">{formatVnd(room.price)}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium text-slate-500">Thiết bị tối đa</span>
                <p className="font-bold text-slate-900">
                  {room.activeGuestDeviceCount ?? 0} / {room.maxActiveGuestDevices ?? 3} thiết bị
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium text-slate-500">Trạng thái QR</span>
                <div>
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${qrStatusMeta.bg} ${qrStatusMeta.text}`}>
                    {qrStatusMeta.label}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Active Guest Information (if occupied) */}
          {activeStay ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-blue-800 flex items-center gap-2">
                  <VsIcon name="person" className="text-base" />
                  KHÁCH ĐANG LƯU TRÚ DỰ ÁN
                </h3>
                <span className="rounded-full bg-blue-200 px-2.5 py-0.5 text-xs font-bold text-blue-900">
                  {1 + extraOccupants.length} Khách
                </span>
              </div>
              <div className="space-y-3 text-sm text-blue-950">
                <div className="flex items-center justify-between border-b border-blue-200/60 pb-2">
                  <div>
                    <p className="font-bold text-base">{activeStay.guestDisplayName || "Chưa có tên"}</p>
                    <p className="text-xs text-blue-700 font-semibold">Chủ đặt phòng đại diện</p>
                  </div>
                  {activeStay.guestPhone ? (
                    <span className="rounded-lg bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-800">
                      📞 {activeStay.guestPhone}
                    </span>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <p><span className="font-semibold text-blue-800">Số CCCD:</span> {activeStay.guestIdentityNumber || "--"}</p>
                  <p><span className="font-semibold text-blue-800">Mã booking:</span> {activeStay.reservationCode || "--"}</p>
                  <p><span className="font-semibold text-blue-800">Nhận phòng:</span> {formatDateTime(activeStay.checkedInAt ?? activeStay.plannedCheckInAt)}</p>
                  <p><span className="font-semibold text-blue-800">Trả phòng dự kiến:</span> {formatDateTime(activeStay.plannedCheckOutAt)}</p>
                </div>
                {extraOccupants.length > 0 ? (
                  <div className="pt-2 border-t border-blue-200/60">
                    <p className="text-xs font-bold text-blue-800 mb-1">Khách ở cùng ({extraOccupants.length} người):</p>
                    <div className="space-y-1">
                      {extraOccupants.map((occ, i) => (
                        <div key={occ.id || i} className="text-xs bg-white/80 rounded-lg p-2 flex justify-between">
                          <span className="font-medium">{occ.fullName || `Khách ở cùng #${i + 1}`}</span>
                          <span className="text-slate-500">{occ.identityNumber || occ.phone || ""}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* QR Code Section */}
          <div className="rounded-2xl border border-[#1f3d35]/10 bg-white p-5 shadow-sm space-y-4 text-center">
            <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-[#8a6a13] text-left">
              MÃ QR THÔNG MINH (GUESTOS)
            </h3>
            {guestQrUrl ? (
              <div className="flex flex-col items-center space-y-3">
                <div className="relative aspect-square w-full max-w-[240px] rounded-xl border border-slate-200 p-2 bg-white shadow-inner flex items-center justify-center">
                  <BrandedRoomQr
                    ref={qrCodeRef}
                    value={guestQrUrl}
                    size={220}
                    className="h-full w-full"
                    title={`QR GuestOS phòng ${roomNumber}`}
                  />
                </div>
                <p className="text-xs font-medium text-slate-500 break-all max-w-full px-2">
                  {guestQrUrl}
                </p>
                {onOpenQrModal ? (
                  <button
                    type="button"
                    onClick={() => onOpenQrModal(room)}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#17201b] px-4 py-2 text-xs font-bold text-[#fff8e8] hover:bg-[#25483f] transition shadow"
                  >
                    <VsIcon name="qr_code" className="text-sm text-[#e8b363]" />
                    Xem / Tải mã QR full size
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-6 text-center space-y-3">
                <VsIcon name="qr_code_scanner" className="text-4xl text-slate-400 mx-auto" />
                <p className="text-xs text-slate-600 font-medium">
                  Phòng này chưa kích hoạt mã QR công khai.
                </p>
                {onQrAction ? (
                  <button
                    type="button"
                    onClick={() => onQrAction(room, "activate")}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 transition shadow"
                  >
                    <VsIcon name="verified" className="text-sm" />
                    Tạo mã QR ngay
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="border-t border-[#1f3d35]/10 bg-white px-6 py-4 flex justify-between items-center">
          <span className="text-xs text-slate-500 font-medium">VietSage Hospitality SaaS</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-slate-100 px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
