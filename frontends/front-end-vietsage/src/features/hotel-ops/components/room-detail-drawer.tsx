"use client";

import { useEffect, useRef, useState } from "react";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { BrandedRoomQr } from "@/features/hotel-ops/components/branded-room-qr";
import type { HotelRoomSummary } from "@/features/hotel-ops/types/hotel-ops-contract";
import { filterExtraOccupants } from "@/features/hotel-ops/utils/hotel-ops-display";

export type CatalogRoomType = {
  id: string;
  name: string;
  basePrice?: number | null;
  readiness?: string;
};

type RoomDetailDrawerProps = {
  room: HotelRoomSummary | null;
  clientOrigin: string;
  initialMode?: "view" | "edit";
  catalog?: CatalogRoomType[];
  roomTypesLoading?: boolean;
  onClose: () => void;
  onSaveRoom?: (
    roomId: string,
    data: {
      roomNumber: string;
      floor?: string;
      roomTypeId?: string;
      price?: number;
      maxActiveGuestDevices?: number | null;
    },
  ) => Promise<void>;
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

function formatPriceInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return new Intl.NumberFormat("vi-VN").format(Number(digits));
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

export function RoomDetailDrawer(props: Readonly<RoomDetailDrawerProps>) {
  if (!props.room) return null;

  return (
    <RoomDetailDialog
      key={`${props.room.id}:${props.initialMode ?? "view"}`}
      {...props}
      room={props.room}
    />
  );
}

function RoomDetailDialog({
  room,
  clientOrigin,
  initialMode = "view",
  catalog,
  roomTypesLoading = false,
  onClose,
  onSaveRoom,
  onEditRoom,
  onToggleBlocked,
  onQrAction,
  onOpenQrModal,
}: Readonly<Omit<RoomDetailDrawerProps, "room"> & { room: HotelRoomSummary }>) {
  const qrCodeRef = useRef<SVGSVGElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(initialMode === "edit");
  const [isSaving, setIsSaving] = useState(false);

  // Form edit states
  const [formRoomNumber, setFormRoomNumber] = useState(room.roomNumber ?? "");
  const [formFloor, setFormFloor] = useState(room.floor ?? "");
  const [formRoomTypeId, setFormRoomTypeId] = useState(room.roomTypeId ?? "");
  const [formPrice, setFormPrice] = useState(
    room.price !== null && room.price !== undefined && room.price !== ""
      ? String(room.price)
      : "",
  );
  const [formMaxDevices, setFormMaxDevices] = useState(
    room.maxActiveGuestDevices !== null && room.maxActiveGuestDevices !== undefined
      ? String(room.maxActiveGuestDevices)
      : "",
  );
  const [formErrors, setFormErrors] = useState<{ roomNumber?: string; price?: string }>({});

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (isEditing && initialMode !== "edit") {
          setIsEditing(false);
        } else {
          onClose();
        }
      }
    }
    if (room) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [room, isEditing, initialMode, onClose]);

  const roomNumber = room.roomNumber?.trim() || room.id || "--";
  const currentRoomStatus = room.status?.trim().toUpperCase() || "AVAILABLE";
  const roomStatusMeta = ROOM_STATUS_MAP[currentRoomStatus] ?? {
    label: currentRoomStatus,
    bg: "bg-slate-100",
    text: "text-slate-800",
    icon: "info",
  };
  const rawQrStatus = (room.qr?.status ?? room.qrStatus ?? "INACTIVE").trim().toUpperCase();
  const publicQrCode =
    rawQrStatus === "ACTIVE" ? (room.qr?.publicCode?.trim() || null) : null;
  const baseOrigin =
    clientOrigin || (typeof window !== "undefined" ? window.location.origin : "");
  const guestQrUrl = publicQrCode
    ? `${baseOrigin.replace(/\/$/, "")}/g/${encodeURIComponent(publicQrCode)}`
    : null;
  const qrStatusMeta = QR_STATUS_MAP[rawQrStatus] ?? {
    label: rawQrStatus,
    bg: "bg-slate-100",
    text: "text-slate-800",
  };

  const activeStay = room?.activeStay;

  const extraOccupants = activeStay
    ? filterExtraOccupants(activeStay.occupants, activeStay)
    : [];

  function startEditing() {
    setFormRoomNumber(room.roomNumber ?? "");
    setFormFloor(room.floor ?? "");
    setFormRoomTypeId(room.roomTypeId ?? "");
    setFormPrice(
      room.price !== null && room.price !== undefined && room.price !== ""
        ? String(room.price)
        : "",
    );
    setFormMaxDevices(
      room.maxActiveGuestDevices !== null && room.maxActiveGuestDevices !== undefined
        ? String(room.maxActiveGuestDevices)
        : "",
    );
    setFormErrors({});
    setIsEditing(true);
  }

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

  async function handleSaveForm(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!room || !onSaveRoom) return;

    const trimmedNumber = formRoomNumber.trim();
    if (!trimmedNumber) {
      setFormErrors({ roomNumber: "Vui lòng nhập số phòng." });
      return;
    }

    const priceNum = formPrice.trim() ? Number(formPrice.replace(/\D/g, "")) : undefined;
    if (priceNum !== undefined && (!Number.isFinite(priceNum) || priceNum <= 0)) {
      setFormErrors({ price: "Giá phòng phải lớn hơn 0." });
      return;
    }

    setIsSaving(true);
    try {
      await onSaveRoom(room.id, {
        roomNumber: trimmedNumber,
        floor: formFloor.trim() || undefined,
        ...(formRoomTypeId ? { roomTypeId: formRoomTypeId } : {}),
        price: priceNum,
        maxActiveGuestDevices: formMaxDevices.trim()
          ? Number(formMaxDevices.replace(/\D/g, ""))
          : null,
      });
      setIsEditing(false);
    } catch {
      // Error handled by parent toast/swal
    } finally {
      setIsSaving(false);
    }
  }

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

      {/* Centered Modal Container - Spacious max-w-5xl, elegant VietSage design */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-drawer-title"
        className="relative z-10 flex w-full max-w-4xl lg:max-w-5xl flex-col rounded-3xl bg-[#fdfbf7] shadow-[0_28px_80px_rgba(0,0,0,0.38)] border border-[#1f3d35]/20 overflow-hidden my-auto max-h-[92vh] animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1f3d35]/15 bg-[#17201b] px-6 py-4.5 text-[#f8f1e6]">
          <div className="flex items-center gap-3.5 min-w-0">
            {/* Room number badge with warm gold styling */}
            <div className="flex h-11 min-w-[3.75rem] px-3.5 items-center justify-center rounded-2xl bg-[#e8b363] text-[#17201b] shadow-sm font-extrabold text-base tracking-tight shrink-0">
              #{roomNumber}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 id="room-drawer-title" className="text-xl sm:text-2xl font-bold text-[#fff8e8] truncate">
                  Phòng #{roomNumber}
                </h2>
                {isEditing ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-bold uppercase tracking-wider bg-amber-400/20 text-amber-300 border border-amber-400/30">
                    <VsIcon name="edit" className="text-xs" />
                    Đang chỉnh sửa
                  </span>
                ) : (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-bold uppercase tracking-wider shrink-0 ${roomStatusMeta.bg} ${roomStatusMeta.text}`}
                  >
                    <VsIcon name={roomStatusMeta.icon} className="text-xs" />
                    {roomStatusMeta.label}
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-[#d7cbb8] mt-0.5 flex items-center gap-2 truncate">
                <span>
                  Loại phòng: <strong className="text-[#fff8e8] font-semibold">{room.type ?? "Tiêu chuẩn"}</strong>
                </span>
                <span className="text-[#d7cbb8]/40">•</span>
                <span>
                  Vị trí:{" "}
                  <strong className="text-[#fff8e8] font-semibold">
                    {room.floor ? `Tầng ${room.floor}` : "Chưa xác định"}
                  </strong>
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && onSaveRoom ? (
              <button
                type="button"
                onClick={startEditing}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-[#e8b363]/40 bg-[#e8b363]/15 px-3.5 py-2 text-xs font-bold text-[#e8b363] hover:bg-[#e8b363]/25 transition"
                title="Chỉnh sửa thông tin phòng"
              >
                <VsIcon name="edit" className="text-sm" />
                <span>Chỉnh sửa</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#f8f1e6]/15 bg-white/5 text-[#d7cbb8] hover:bg-white/15 hover:text-[#fff8e8] transition focus:outline-none focus:ring-2 focus:ring-[#e8b363]"
              title="Đóng (Esc)"
              aria-label="Đóng chi tiết phòng"
            >
              <VsIcon name="close" className="text-xl" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-7 text-[#17201b] overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left Column: Room Specs, Guest Status OR Inline Edit Form */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
              {isEditing ? (
                /* INLINE EDIT FORM - No second modal, seamless editing in place */
                <form
                  onSubmit={handleSaveForm}
                  className="rounded-2xl border border-[#1f3d35]/15 bg-white p-5 sm:p-6 shadow-xs space-y-4.5"
                >
                  <div className="flex items-center justify-between border-b border-[#1f3d35]/10 pb-3">
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold uppercase tracking-[0.16em] text-[#8a6a13] flex items-center gap-2">
                        <VsIcon name="edit_square" className="text-base text-[#8a6a13]" />
                        CHỈNH SỬA THÔNG TIN PHÒNG
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Cập nhật trực tiếp số phòng, hạng phòng, vị trí tầng, giá và giới hạn thiết bị.
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-100 text-amber-900 border border-amber-200 px-3 py-1 text-xs font-bold shrink-0">
                      Chế độ sửa
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Số phòng */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                        Số phòng <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formRoomNumber}
                        onChange={(e) => {
                          setFormRoomNumber(e.target.value);
                          setFormErrors((prev) => ({ ...prev, roomNumber: undefined }));
                        }}
                        placeholder="Ví dụ: 501"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1f3d35] focus:outline-none focus:ring-2 focus:ring-[#e8b363]/50 transition"
                      />
                      {formErrors.roomNumber ? (
                        <span className="text-xs font-semibold text-rose-600 block">{formErrors.roomNumber}</span>
                      ) : null}
                    </div>

                    {/* Vị trí tầng */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                        Vị trí tầng
                      </label>
                      <input
                        type="text"
                        value={formFloor}
                        onChange={(e) => setFormFloor(e.target.value)}
                        placeholder="Ví dụ: 5"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1f3d35] focus:outline-none focus:ring-2 focus:ring-[#e8b363]/50 transition"
                      />
                    </div>

                    {/* Hạng / Loại phòng */}
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                        Loại / Hạng phòng
                      </label>
                      <select
                        value={formRoomTypeId}
                        onChange={(e) => {
                          const nextId = e.target.value;
                          setFormRoomTypeId(nextId);
                          const matched = catalog?.find((item) => item.id === nextId);
                          if (matched?.basePrice && !formPrice) {
                            setFormPrice(String(matched.basePrice));
                          }
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#1f3d35] focus:outline-none focus:ring-2 focus:ring-[#e8b363]/50 transition"
                      >
                        <option value="">
                          -- {room.type ? `Hiện tại: ${room.type}` : "Chọn loại phòng trong danh mục"} --
                        </option>
                        {catalog
                          ?.filter((item) => !item.id.startsWith("legacy:"))
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}{" "}
                              {item.basePrice
                                ? `• ${new Intl.NumberFormat("vi-VN").format(item.basePrice)} ₫`
                                : ""}
                            </option>
                          ))}
                      </select>
                      {roomTypesLoading ? (
                        <span className="text-[11px] text-slate-400 block">Đang tải danh mục loại phòng...</span>
                      ) : null}
                    </div>

                    {/* Giá riêng của phòng */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                        Giá riêng của phòng (₫)
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatPriceInput(formPrice)}
                        onChange={(e) => {
                          setFormPrice(e.target.value.replace(/\D/g, ""));
                          setFormErrors((prev) => ({ ...prev, price: undefined }));
                        }}
                        placeholder="Ví dụ: 400.000"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-[#1f3d35] focus:outline-none focus:ring-2 focus:ring-[#e8b363]/50 transition"
                      />
                      <span className="text-[11px] text-slate-500 block">
                        Để trống nếu áp dụng giá gốc của loại phòng.
                      </span>
                      {formErrors.price ? (
                        <span className="text-xs font-semibold text-rose-600 block">{formErrors.price}</span>
                      ) : null}
                    </div>

                    {/* Thiết bị tối đa */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                        Thiết bị tối đa
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formMaxDevices}
                        onChange={(e) => setFormMaxDevices(e.target.value.replace(/\D/g, ""))}
                        placeholder="Mặc định: 3"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1f3d35] focus:outline-none focus:ring-2 focus:ring-[#e8b363]/50 transition"
                      />
                      <span className="text-[11px] text-slate-500 block">
                        Số thiết bị khách đăng nhập đồng thời qua GuestOS.
                      </span>
                    </div>
                  </div>

                  {/* Form Action Bar */}
                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditing(false);
                        setFormErrors({});
                      }}
                      disabled={isSaving}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#17201b] hover:bg-[#25483f] px-5 py-2.5 text-xs sm:text-sm font-bold text-[#fff8e8] transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <VsIcon
                        name={isSaving ? "hourglass_empty" : "check"}
                        className={`text-base text-[#e8b363] ${isSaving ? "animate-spin" : ""}`}
                      />
                      <span>{isSaving ? "Đang lưu..." : "Lưu cập nhật"}</span>
                    </button>
                  </div>
                </form>
              ) : (
                /* VIEW MODE - Spacious & Clear */
                <>
                  {/* Room Specs Details */}
                  <div className="rounded-2xl border border-[#1f3d35]/10 bg-white p-4 sm:p-5 shadow-xs">
                    <div className="flex items-center justify-between border-b border-[#1f3d35]/10 pb-2.5 mb-3.5">
                      <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-[#8a6a13] flex items-center gap-2">
                        <VsIcon name="info" className="text-sm text-[#8a6a13]" />
                        THÔNG TIN CƠ BẢN PHÒNG
                      </h3>
                      <span className="text-xs font-semibold text-slate-500">
                        {room.type ?? "Tiêu chuẩn"} • {room.floor ? `Tầng ${room.floor}` : "Chưa phân tầng"}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-xl bg-slate-50/80 p-3 border border-slate-100">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                          Giá niêm yết
                        </span>
                        <p className="font-extrabold text-base sm:text-lg text-emerald-800 mt-1 tabular-nums truncate">
                          {formatVnd(room.price)}
                        </p>
                        <span className="text-[11px] text-slate-400 mt-0.5 block">Theo đêm nghỉ</span>
                      </div>
                      <div className="rounded-xl bg-slate-50/80 p-3 border border-slate-100">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                          Thiết bị tối đa
                        </span>
                        <p className="font-extrabold text-base sm:text-lg text-slate-900 mt-1 truncate">
                          {room.activeGuestDeviceCount ?? 0} / {room.maxActiveGuestDevices ?? 3} TB
                        </p>
                        <span className="text-[11px] text-slate-400 mt-0.5 block">Đăng nhập GuestOS</span>
                      </div>
                      <div className="rounded-xl bg-slate-50/80 p-3 border border-slate-100">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                          Trạng thái QR
                        </span>
                        <p className="font-bold text-sm sm:text-base text-emerald-800 mt-1 truncate flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
                          {qrStatusMeta.label}
                        </p>
                        <span className="text-[11px] text-slate-400 mt-0.5 block">Mã quét đón khách</span>
                      </div>
                    </div>
                  </div>

                  {/* Guest / Occupancy Section */}
                  {activeStay ? (
                    <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-4 sm:p-5 shadow-xs space-y-2.5">
                      <div className="flex items-center justify-between border-b border-blue-200/60 pb-2">
                        <div className="flex items-center gap-2">
                          <VsIcon name="person" className="text-base text-blue-700" />
                          <span className="text-xs font-bold uppercase tracking-[0.14em] text-blue-900">
                            Khách đang lưu trú
                          </span>
                        </div>
                        <span className="rounded-full bg-blue-200 px-2.5 py-0.5 text-xs font-bold text-blue-950">
                          {1 + extraOccupants.length} khách
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div>
                          <strong className="text-base font-extrabold text-blue-950">
                            {activeStay.guestDisplayName || "Chưa có tên"}
                          </strong>
                          <span className="ml-2 text-xs font-semibold text-blue-700">(Chủ phòng)</span>
                        </div>
                        {activeStay.guestPhone ? (
                          <span className="rounded-lg bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-900 flex items-center gap-1">
                            📞 {activeStay.guestPhone}
                          </span>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-blue-950 pt-2 border-t border-blue-200/50">
                        <p>
                          <span className="font-semibold text-blue-800">CCCD:</span>{" "}
                          {activeStay.guestIdentityNumber || "--"}
                        </p>
                        <p>
                          <span className="font-semibold text-blue-800">Mã đặt:</span>{" "}
                          {activeStay.reservationCode || "--"}
                        </p>
                        <p>
                          <span className="font-semibold text-blue-800">Check-in:</span>{" "}
                          {formatDateTime(activeStay.checkedInAt ?? activeStay.plannedCheckInAt)}
                        </p>
                        <p>
                          <span className="font-semibold text-blue-800">Check-out:</span>{" "}
                          {formatDateTime(activeStay.plannedCheckOutAt)}
                        </p>
                      </div>
                      {extraOccupants.length > 0 ? (
                        <div className="flex items-center gap-2 text-xs text-blue-950 pt-2 border-t border-blue-200/50">
                          <span className="font-semibold text-blue-800 shrink-0">Đi cùng:</span>
                          <span className="truncate font-medium text-slate-800">
                            {extraOccupants.map((occ, i) => occ.fullName || `Khách #${i + 1}`).join(", ")}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 sm:p-5 flex items-center gap-3 text-sm text-emerald-950 shadow-xs">
                      <VsIcon name="check_circle" className="text-2xl text-emerald-600 shrink-0" />
                      <div>
                        <strong className="block text-base font-bold text-emerald-950">
                          Phòng trống · Sẵn sàng đón khách mới
                        </strong>
                        <span className="text-slate-600 text-xs sm:text-sm mt-0.5 block">
                          Chưa có lượt lưu trú hoạt động. Khách có thể quét mã QR thông minh bên phải để làm thủ tục nhận phòng.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Quick Action Toolbar */}
                  <div className="rounded-2xl border border-[#1f3d35]/10 bg-white p-4 shadow-xs">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8a6a13] mb-2.5">
                      THAO TÁC NHANH
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (onSaveRoom) {
                            setIsEditing(true);
                          } else if (onEditRoom) {
                            onEditRoom(room);
                          }
                        }}
                        className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-2 text-xs sm:text-sm font-bold text-blue-900 transition hover:bg-blue-100 shadow-2xs"
                        title="Chỉnh sửa phòng"
                      >
                        <VsIcon name="edit" className="text-base text-blue-700" />
                        <span>Chỉnh sửa phòng</span>
                      </button>

                      {onToggleBlocked && !isOccupied ? (
                        <button
                          type="button"
                          onClick={() => onToggleBlocked(room)}
                          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs sm:text-sm font-bold transition shadow-2xs ${
                            isBlocked
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                              : "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
                          }`}
                        >
                          <VsIcon name={isBlocked ? "task_alt" : "block"} className="text-base" />
                          <span>{isBlocked ? "Mở khóa phòng" : "Khóa phòng"}</span>
                        </button>
                      ) : null}

                      {rawQrStatus === "ACTIVE" && onQrAction ? (
                        <>
                          <button
                            type="button"
                            onClick={() => onQrAction(room, "rotate")}
                            className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs sm:text-sm font-bold text-blue-800 transition hover:bg-blue-100 shadow-2xs"
                            title="Đổi / xoay mã QR"
                          >
                            <VsIcon name="history" className="text-base text-blue-600" />
                            <span>Đổi / xoay mã QR</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onQrAction(room, "deactivate")}
                            className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs sm:text-sm font-bold text-amber-800 transition hover:bg-amber-100 shadow-2xs"
                            title="Tạm tắt QR"
                          >
                            <VsIcon name="visibility_off" className="text-base text-amber-600" />
                            <span>Tạm tắt QR</span>
                          </button>
                        </>
                      ) : onQrAction ? (
                        <button
                          type="button"
                          onClick={() => onQrAction(room, "activate")}
                          className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs sm:text-sm font-bold text-emerald-800 transition hover:bg-emerald-100 shadow-2xs"
                          title="Kích hoạt QR"
                        >
                          <VsIcon name="verified" className="text-base text-emerald-600" />
                          <span>Kích hoạt mã QR</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Right Column: QR Code & Operations - Spacious & High Quality */}
            <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl border border-[#1f3d35]/10 bg-white p-5 shadow-xs text-center space-y-4">
              <div className="flex items-center justify-between border-b border-[#1f3d35]/10 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-[#8a6a13] flex items-center gap-1.5">
                  <VsIcon name="qr_code_scanner" className="text-sm text-[#8a6a13]" />
                  MÃ QR THÔNG MINH
                </h3>
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100">
                  GuestOS
                </span>
              </div>

              {guestQrUrl ? (
                <div className="flex flex-col items-center space-y-3 w-full">
                  {/* QR Preview Box with clean, spacious sizing */}
                  <div className="relative aspect-square w-full max-w-[210px] rounded-2xl border border-slate-200 p-3 bg-white shadow-xs flex items-center justify-center mx-auto">
                    <BrandedRoomQr
                      ref={qrCodeRef}
                      value={guestQrUrl}
                      size={185}
                      className="h-full w-full"
                      title={`QR GuestOS phòng ${roomNumber}`}
                    />
                  </div>

                  {/* Public Link Box with Copy Button */}
                  <div className="w-full flex items-center gap-1.5 rounded-xl bg-slate-50 border border-slate-200 p-1.5">
                    <span
                      className="flex-1 truncate font-mono text-xs text-slate-600 px-2 text-left select-all"
                      title={guestQrUrl}
                    >
                      {guestQrUrl}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopyLink()}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-slate-700 border border-slate-200 hover:bg-slate-100 transition shadow-2xs"
                      title="Sao chép liên kết khách lưu trú"
                    >
                      <VsIcon name={copied ? "check" : "content_copy"} className="text-sm text-emerald-700" />
                      <span>{copied ? "Đã chép" : "Chép link"}</span>
                    </button>
                  </div>

                  {/* Primary View Full QR Button */}
                  {onOpenQrModal ? (
                    <button
                      type="button"
                      onClick={() => onOpenQrModal(room)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#17201b] px-4 py-2.5 text-xs sm:text-sm font-bold text-[#fff8e8] hover:bg-[#25483f] transition shadow-md focus:outline-none focus:ring-2 focus:ring-[#e8b363]"
                    >
                      <VsIcon name="qr_code" className="text-base text-[#e8b363]" />
                      <span>Xem &amp; Tải mã QR gốc</span>
                    </button>
                  ) : null}

                  <p className="text-[11px] text-slate-500 leading-relaxed max-w-xs mx-auto">
                    Quét mã để truy cập giao diện GuestOS nhận phòng, dịch vụ và trao đổi trực tiếp với lễ tân.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center space-y-3 w-full">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400 mx-auto">
                    <VsIcon name="qr_code_scanner" className="text-3xl" />
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 font-medium max-w-xs">
                    Phòng này hiện chưa kích hoạt mã QR công khai.
                  </p>
                  {onQrAction ? (
                    <button
                      type="button"
                      onClick={() => onQrAction(room, "activate")}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-emerald-800 transition shadow-md"
                    >
                      <VsIcon name="verified" className="text-sm" />
                      <span>Tạo mã QR ngay</span>
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-[#1f3d35]/15 bg-white px-6 py-3.5 flex justify-between items-center">
          <span className="text-xs text-slate-500 font-medium flex items-center gap-2">
            <VsIcon name="apartment" className="text-sm text-[#8a6a13]" />
            VietSage Hospitality SaaS · Quản trị phòng
          </span>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setFormErrors({});
                }}
                disabled={isSaving}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
              >
                Hủy
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-slate-100 px-5 py-2 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-200 transition focus:outline-none focus:ring-2 focus:ring-[#e8b363]"
            >
              Đóng (Esc)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
