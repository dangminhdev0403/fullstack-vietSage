"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SwalVietSage,
  escapeHtml,
  formatEarlyCheckInConfirmHtml,
  showConfirmDialog,
  showErrorAlert,
  showSuccessAlert,
  showWarningAlert,
} from "@/libs/swal";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import { CheckInWorkspace } from "@/features/local-biometric/components/check-in-workspace";
import type { CheckInStayFields } from "@/features/local-biometric/types/check-in-workspace";
import { BrandedRoomQr } from "@/features/hotel-ops/components/branded-room-qr";
import { formatFriendlyCheckInError } from "@/features/hotel-ops/utils/check-in-error";
import {
  FrontDeskRoomDetailPanel,
  resolveRoomStatusModel,
} from "@/features/hotel-ops/components/front-desk-room-detail-panel";
import { FrontDeskArrivalDetailPanel } from "@/features/hotel-ops/components/front-desk-arrival-detail-panel";
import { DailyMovementsModal } from "@/features/hotel-ops/components/daily-movements-modal";
import { staffRoomsResource } from "@/features/hotel-ops/resources/staff-rooms-resource";
import { roomPlanResource } from "@/features/hotel-ops/resources/room-plan-resource";
import { invalidateHotelRealtimeQueries } from "@/features/hotel-ops/utils/invalidate-hotel-realtime-queries";
import {
  filterExtraOccupants,
  formatMoney,
} from "@/features/hotel-ops/utils/hotel-ops-display";
import { getArrivalDateRange } from "@/features/hotel-ops/utils/arrival-date-range";
import type {
  BookingSourcePartnerItem,
  BulkReservationInput,
  HotelArrival,
  HotelCheckInResult,
  HotelOpsPage,
  HotelRoomSummary,
  HotelStaySummary,
  RoomPlanBlock,
} from "@/features/hotel-ops/types/hotel-ops-contract";
import { TapeChartView } from "@/features/hotel-ops/components/tape-chart/tape-chart-view";
import { BookingConfirmationModal } from "@/features/hotel-ops/components/booking-confirmation-modal";
import { useRoomViewStore } from "@/features/hotel-ops/store/room-view-store";
import { channelManagerResource } from "@/features/channel-manager/api/channel-manager.resource";
import type { SimulatedBookingItem } from "@/features/channel-manager/types/channel-manager.types";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";

export type PrebookedServiceItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

const PREBOOKED_SERVICE_PRESETS = [
  { name: "Ăn sáng buffet", defaultPrice: 70000 },
  { name: "Đưa đón sân bay", defaultPrice: 250000 },
  { name: "Kê giường phụ", defaultPrice: 150000 },
  { name: "Thuê xe máy", defaultPrice: 120000 },
  { name: "Giặt là lấy ngay", defaultPrice: 50000 },
  { name: "Setup hoa & bánh", defaultPrice: 200000 },
];

function generatePartnerCode(name: string): string {
  const clean = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  const prefix = clean.slice(0, 8) || "PARTNER";
  const suffix = Math.floor(100 + Math.random() * 900).toString();
  return `${prefix}_${suffix}`;
}

function formatVnDateStr(ymd: string): string {
  if (!ymd) return "";
  const parts = ymd.slice(0, 10).split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return ymd;
}

function getVnWeekday(ymd: string): string {
  if (!ymd) return "";
  const d = new Date(`${ymd}T00:00:00`);
  const days = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
  return days[d.getDay()] || "";
}

export type StaffRoomsClientProps = {
  hotelId: string;
  initialRoomsPage: HotelOpsPage<HotelRoomSummary>;
  canManageRooms: boolean;
  canManageReservations?: boolean;
  canManageStays: boolean;
  canViewBilling?: boolean;
  canCheckoutBilling?: boolean;
  canCheckOutStay?: boolean;
  canCheckInStay?: boolean;
  initialFlow?: string;
  initialBusinessDate?: string;
  initialArrivalRange?: string;
  initialQuery?: string;
  initialStatus?: RoomStatusFilter | string;
  isHousekeeping?: boolean;
  enabledFeatures?: readonly string[];
  initialView?: "grid" | "tape-chart";
  initialStartDate?: string;
  initialViewMode?: "week" | "biweek" | "month";
  baseRoutePrefix?: string;
  currentUser?: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
};

type RoomStatusFilter =
  | "all"
  | "available"
  | "reserved"
  | "occupied"
  | "overdue"
  | "processing"
  | "maintenance"
  | "blocked";

type RoomQrPreview = {
  room: HotelRoomSummary;
  guestUrl: string | null;
};

const statusFilters: Array<{ value: RoomStatusFilter; label: string }> = [
  { value: "all", label: "Tất cả" },
  { value: "available", label: "Trống" },
  { value: "reserved", label: "Đặt trước" },
  { value: "occupied", label: "Đang có khách" },
  { value: "overdue", label: "Quá hạn trả" },
  { value: "processing", label: "Chờ dọn" },
  { value: "maintenance", label: "Bảo trì" },
  { value: "blocked", label: "Đã khóa" },
];

function localDateTime(offsetDays: number, hour: number): string {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  value.setHours(hour, 0, 0, 0);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function toVietnamDateString(
  dateVal: string | Date | null | undefined,
): string | null {
  if (!dateVal) return null;
  try {
    const d = typeof dateVal === "string" ? new Date(dateVal) : dateVal;
    if (isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return null;
  }
}

function formatTimeOnly(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}

function formatPriceInput(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return "";
  return new Intl.NumberFormat("vi-VN").format(Number(digits));
}

function getRoomNumber(room: HotelRoomSummary): string {
  return room.roomNumber?.trim() || room.id;
}

function getRoomQrValue(room: HotelRoomSummary): string | null {
  const qrStatus = (room.qr?.status ?? room.qrStatus ?? "INACTIVE")
    .trim()
    .toUpperCase();
  if (qrStatus !== "ACTIVE") return null;
  return room.qr?.publicCode?.trim() || null;
}

function getGuestQrUrl(room: HotelRoomSummary, origin: string): string | null {
  const qrValue = getRoomQrValue(room);
  if (!qrValue) return null;
  return `${origin.replace(/\/$/, "")}/g/${encodeURIComponent(qrValue)}`;
}

function isOverdueCheckOut(room: HotelRoomSummary): boolean {
  if (!room.activeStay) return false;
  const stay = room.activeStay;
  if (stay.checkedOutAt) return false;
  if (!stay.plannedCheckOutAt) return false;
  const stayStatus = (stay.status || "").toUpperCase();
  if (
    stayStatus !== "ACTIVE" &&
    stayStatus !== "CHECKED_IN" &&
    stayStatus !== "CHECKOUT_PENDING"
  ) {
    return false;
  }
  return new Date(stay.plannedCheckOutAt).getTime() < Date.now();
}

function getRoomStatus(room: HotelRoomSummary): RoomStatusFilter {
  if (isOverdueCheckOut(room)) return "overdue";
  const status = (room.physicalStatus || room.status)?.toUpperCase();
  if (status === "OCCUPIED" || (!room.physicalStatus && room.activeStay)) return "occupied";
  if (status === "RESERVED") return "reserved";
  if (status === "PROCESSING") return "processing";
  if (status === "BLOCKED") return "blocked";
  if (status === "MAINTENANCE" || status === "OUT_OF_SERVICE")
    return "maintenance";
  return "available";
}

function getProjectedRoomStatus(room: HotelRoomSummary): RoomStatusFilter {
  const projected = (room.projectedStatus || room.status || "").toUpperCase();
  if (projected === "OCCUPIED") return "occupied";
  if (
    projected === "RESERVED" ||
    (!room.activeStay && Boolean(room.projectedReservation))
  )
    return "reserved";
  if (projected === "PROCESSING") return "processing";
  if (projected === "BLOCKED") return "blocked";
  if (projected === "MAINTENANCE" || projected === "OUT_OF_SERVICE")
    return "maintenance";
  return "available";
}

function getEffectiveRoomStatus(
  room: HotelRoomSummary,
  isFuture: boolean,
): RoomStatusFilter {
  const status = resolveRoomStatusModel(room, { isFuture }).operational.status;
  return status === "all" ? "available" : status;
}

function roomStatusLabel(status: RoomStatusFilter): string {
  if (status === "overdue") return "QUÁ HẠN TRẢ PHÒNG";
  if (status === "available") return "TRỐNG";
  if (status === "reserved") return "ĐÃ ĐẶT TRƯỚC";
  if (status === "occupied") return "ĐANG Ở";
  if (status === "processing") return "CHỜ DỌN";
  if (status === "maintenance") return "BẢO TRÌ";
  if (status === "blocked") return "ĐÃ KHÓA";
  return "TẤT CẢ";
}

function roomStatusBadgeClass(status: RoomStatusFilter): string {
  const base =
    "shrink-0 whitespace-nowrap px-2.5 py-0.5 text-xs font-black rounded-lg border shadow-2xs tracking-wide";
  if (status === "overdue")
    return `${base} bg-rose-50 text-rose-700 border-rose-300`;
  if (status === "reserved")
    return `${base} bg-purple-50 text-purple-800 border-purple-300`;
  if (status === "occupied")
    return `${base} bg-sky-50 text-sky-800 border-sky-300`;
  if (status === "processing")
    return `${base} bg-amber-50 text-amber-900 border-amber-300`;
  if (status === "maintenance")
    return `${base} bg-rose-50 text-rose-800 border-rose-300`;
  if (status === "blocked")
    return `${base} bg-slate-100 text-slate-800 border-slate-300`;
  return `${base} bg-emerald-50 text-emerald-800 border-emerald-300`;
}

function roomCardClass(status: RoomStatusFilter): string {
  if (status === "overdue")
    return "border-2 border-rose-300/90 hover:border-rose-500 bg-gradient-to-b from-rose-50/75 via-white/95 to-rose-50/35 text-slate-950 shadow-xs hover:shadow-md hover:shadow-rose-500/10 transition-all cursor-pointer";
  if (status === "reserved")
    return "border-2 border-purple-300/90 hover:border-purple-500 bg-gradient-to-b from-purple-50/75 via-white/95 to-purple-50/35 text-slate-950 shadow-xs hover:shadow-md hover:shadow-purple-500/10 transition-all cursor-pointer";
  if (status === "occupied")
    return "border-2 border-sky-300/90 hover:border-sky-500 bg-gradient-to-b from-sky-50/75 via-white/95 to-blue-50/35 text-slate-950 shadow-xs hover:shadow-md hover:shadow-sky-500/10 transition-all cursor-pointer";
  if (status === "processing")
    return "border-2 border-amber-300/90 hover:border-amber-500 bg-gradient-to-b from-amber-50/75 via-white/95 to-amber-50/35 text-slate-950 shadow-xs hover:shadow-md hover:shadow-amber-500/10 transition-all cursor-pointer";
  if (status === "maintenance")
    return "border-2 border-rose-300/80 hover:border-rose-400 bg-gradient-to-b from-rose-50/50 via-white/95 to-slate-50/40 text-slate-950 shadow-xs hover:shadow-md transition-all cursor-pointer";
  if (status === "blocked")
    return "border-2 border-slate-300 hover:border-slate-400 bg-gradient-to-b from-slate-100/70 via-white/95 to-slate-50/40 text-slate-950 shadow-xs hover:shadow-md transition-all cursor-pointer";
  return "border-2 border-emerald-300/90 hover:border-emerald-500 bg-gradient-to-b from-emerald-50/75 via-white/95 to-emerald-50/35 text-slate-950 shadow-xs hover:shadow-md hover:shadow-emerald-500/10 transition-all cursor-pointer";
}

function renderRoomAmbientGlow(status: RoomStatusFilter) {
  if (status === "overdue") {
    return (
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
        aria-hidden="true"
      >
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-rose-400/20 blur-2xl" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-rose-300/15 blur-2xl" />
      </div>
    );
  }
  if (status === "reserved") {
    return (
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
        aria-hidden="true"
      >
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-purple-400/20 blur-2xl" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-indigo-300/15 blur-2xl" />
      </div>
    );
  }
  if (status === "occupied") {
    return (
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
        aria-hidden="true"
      >
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-sky-400/20 blur-2xl" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-blue-300/15 blur-2xl" />
      </div>
    );
  }
  if (status === "processing") {
    return (
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
        aria-hidden="true"
      >
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-amber-400/25 blur-2xl" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-amber-300/15 blur-2xl" />
      </div>
    );
  }
  if (status === "maintenance") {
    return (
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
        aria-hidden="true"
      >
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-rose-400/15 blur-2xl" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-slate-300/20 blur-2xl" />
      </div>
    );
  }
  if (status === "blocked") {
    return (
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
        aria-hidden="true"
      >
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-slate-400/15 blur-2xl" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-slate-300/15 blur-2xl" />
      </div>
    );
  }
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
      aria-hidden="true"
    >
      <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-emerald-400/20 blur-2xl" />
      <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-emerald-300/15 blur-2xl" />
    </div>
  );
}

function isAvailable(room: HotelRoomSummary): boolean {
  return getRoomStatus(room) === "available";
}

function StayOccupantsViewer({
  stay,
}: {
  stay: NonNullable<HotelRoomSummary["activeStay"]>;
}) {
  const [selectedGuestIndex, setSelectedGuestIndex] = useState(0);

  const extraOccupants = useMemo(() => {
    return filterExtraOccupants(stay.occupants, stay);
  }, [stay]);

  const totalGuests = 1 + extraOccupants.length;
  const currentOccupant =
    selectedGuestIndex > 0 ? extraOccupants[selectedGuestIndex - 1] : null;

  return (
    <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-left shadow-2xs">
      <div className="flex flex-col gap-2.5 border-b border-blue-200/80 pb-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">
            Khách đang lưu trú ({totalGuests} người)
          </p>
        </div>

        <nav className="flex items-center gap-1.5 overflow-x-auto overflow-y-hidden py-0.5">
          <button
            type="button"
            onClick={() => setSelectedGuestIndex(0)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
              selectedGuestIndex === 0
                ? "bg-blue-700 text-white shadow-sm shadow-blue-700/20"
                : "bg-blue-100/90 text-blue-900 hover:bg-blue-200/80"
            }`}
          >
            <VsIcon name="person" className="text-sm" />
            Đại diện (Chủ phòng)
          </button>
          {extraOccupants.map((occ, idx) => (
            <button
              key={occ.id || idx}
              type="button"
              onClick={() => setSelectedGuestIndex(idx + 1)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                selectedGuestIndex === idx + 1
                  ? "bg-blue-700 text-white shadow-sm shadow-blue-700/20"
                  : "bg-blue-100/90 text-blue-900 hover:bg-blue-200/80"
              }`}
            >
              <VsIcon name="group" className="text-sm" />
              Khách ở cùng {idx + 1}
            </button>
          ))}
        </nav>
      </div>

      {!currentOccupant ? (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-base font-extrabold text-blue-950">
              {stay.guestDisplayName || "Khách đại diện"}
            </p>
            <span className="rounded-lg bg-blue-200/80 px-2 py-0.5 text-xs font-bold text-blue-900">
              Chủ đặt phòng
            </span>
          </div>
          <div className="mt-2.5 grid gap-2 text-xs text-blue-900 sm:grid-cols-2">
            <p>
              <span className="font-bold text-blue-950">SĐT:</span>{" "}
              {stay.guestPhone || "chưa có"}
            </p>
            <p>
              <span className="font-bold text-blue-950">Mã đặt phòng:</span>{" "}
              {stay.reservationCode || "chưa có"}
            </p>
            <p>
              <span className="font-bold text-blue-950">Số CCCD:</span>{" "}
              {stay.guestIdentityNumber || "chưa có"}
            </p>
            <p>
              <span className="font-bold text-blue-950">Ngày sinh:</span>{" "}
              {stay.guestDateOfBirth || "chưa có"}
            </p>
            <p>
              <span className="font-bold text-blue-950">Giới tính:</span>{" "}
              {stay.guestGender || "chưa có"}
            </p>
            <p>
              <span className="font-bold text-blue-950">Quốc tịch:</span>{" "}
              {stay.guestNationality || "chưa có"}
            </p>
            <p className="sm:col-span-2">
              <span className="font-bold text-blue-950">
                Địa chỉ thường trú:
              </span>{" "}
              {stay.guestResidencePlace || "chưa có"}
            </p>
            <p>
              <span className="font-bold text-blue-950">Nhận phòng:</span>{" "}
              {formatDateTime(stay.checkedInAt ?? stay.plannedCheckInAt)}
            </p>
            <p>
              <span className="font-bold text-blue-950">Trả phòng:</span>{" "}
              {formatDateTime(stay.plannedCheckOutAt)}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-base font-extrabold text-blue-950">
              {currentOccupant.fullName || `Khách ở cùng ${selectedGuestIndex}`}
            </p>
            <span className="rounded-lg bg-amber-200/90 px-2 py-0.5 text-xs font-bold text-amber-950">
              Khách ở cùng #{selectedGuestIndex}
            </span>
          </div>
          <div className="mt-2.5 grid gap-2 text-xs text-blue-900 sm:grid-cols-2">
            <p>
              <span className="font-bold text-blue-950">SĐT:</span>{" "}
              {currentOccupant.phone || "chưa có"}
            </p>
            <p>
              <span className="font-bold text-blue-950">Số CCCD:</span>{" "}
              {currentOccupant.identityNumber || "chưa có"}
            </p>
            <p>
              <span className="font-bold text-blue-950">Ngày sinh:</span>{" "}
              {currentOccupant.dateOfBirth || "chưa có"}
            </p>
            <p>
              <span className="font-bold text-blue-950">Giới tính:</span>{" "}
              {currentOccupant.gender || "chưa có"}
            </p>
            <p>
              <span className="font-bold text-blue-950">Quốc tịch:</span>{" "}
              {currentOccupant.nationality || "chưa có"}
            </p>
            <p className="sm:col-span-2">
              <span className="font-bold text-blue-950">
                Địa chỉ thường trú:
              </span>{" "}
              {currentOccupant.residencePlace || "chưa có"}
            </p>
            <p>
              <span className="font-bold text-blue-950">
                Chủ phòng đại diện:
              </span>{" "}
              {stay.guestDisplayName}
            </p>
            <p>
              <span className="font-bold text-blue-950">Mã đặt phòng:</span>{" "}
              {stay.reservationCode || "chưa có"}
            </p>
            <p>
              <span className="font-bold text-blue-950">Nhận phòng:</span>{" "}
              {formatDateTime(stay.checkedInAt ?? stay.plannedCheckInAt)}
            </p>
            <p>
              <span className="font-bold text-blue-950">Trả phòng:</span>{" "}
              {formatDateTime(stay.plannedCheckOutAt)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function renderPaginationButtons(
  currentPage: number,
  totalPages: number,
  onPageChange: (p: number) => void,
) {
  const buttons: React.ReactNode[] = [];

  buttons.push(
    <button
      key="prev"
      type="button"
      onClick={() => onPageChange(Math.max(1, currentPage - 1))}
      disabled={currentPage <= 1}
      className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs sm:text-sm font-extrabold text-slate-800 transition hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
    >
      Trước
    </button>,
  );

  const range = (start: number, end: number) => {
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };

  const pages: (number | string)[] = [];
  if (totalPages <= 5) {
    pages.push(...range(1, totalPages));
  } else {
    if (currentPage <= 3) {
      pages.push(...range(1, 4), "...", totalPages);
    } else if (currentPage >= totalPages - 2) {
      pages.push(1, "...", ...range(totalPages - 3, totalPages));
    } else {
      pages.push(
        1,
        "...",
        currentPage - 1,
        currentPage,
        currentPage + 1,
        "...",
        totalPages,
      );
    }
  }

  pages.forEach((p, idx) => {
    if (p === "...") {
      buttons.push(
        <span
          key={`ellipsis-${idx}`}
          className="px-1 text-sm font-bold text-slate-500 select-none"
        >
          ...
        </span>,
      );
    } else {
      const pageNum = p as number;
      buttons.push(
        <button
          key={`page-${pageNum}`}
          type="button"
          onClick={() => onPageChange(pageNum)}
          className={`h-9 min-w-[36px] rounded-lg px-2 text-xs sm:text-sm font-extrabold transition cursor-pointer ${
            pageNum === currentPage
              ? "bg-sky-700 text-white shadow-sm border border-sky-800"
              : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 shadow-2xs"
          }`}
        >
          {pageNum}
        </button>,
      );
    }
  });

  buttons.push(
    <button
      key="next"
      type="button"
      onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
      disabled={currentPage >= totalPages}
      className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs sm:text-sm font-extrabold text-slate-800 transition hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
    >
      Tiếp theo
    </button>,
  );

  return <div className="flex items-center gap-1.5">{buttons}</div>;
}

export function StaffRoomsClient({
  hotelId,
  initialRoomsPage,
  canManageRooms,
  canManageReservations = false,
  canManageStays,
  canViewBilling = false,
  canCheckoutBilling = false,
  canCheckOutStay = false,
  canCheckInStay = false,
  initialFlow,
  initialBusinessDate,
  initialArrivalRange,
  initialQuery,
  initialStatus,
  isHousekeeping = false,
  enabledFeatures,
  initialView,
  initialStartDate,
  initialViewMode,
  baseRoutePrefix,
  currentUser,
}: StaffRoomsClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const apiBase = `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}`;

  const todayYmd = useMemo(() => {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }, []);

  const tomorrowYmd = useMemo(() => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(tmr);
  }, []);

  const [businessDate, setBusinessDate] = useState<string>(() =>
    isHousekeeping ? todayYmd : initialBusinessDate || todayYmd,
  );
  const isFutureDate =
    !isHousekeeping && Boolean(businessDate && businessDate > todayYmd);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(100);
  const [inputQuery, setInputQuery] = useState(initialQuery ?? "");
  const [query, setQuery] = useState(initialQuery ?? "");
  const [floor, setFloor] = useState("all");
  const [type, setType] = useState("all");
  const [zone, setZone] = useState("all");
  const [expandedFloors, setExpandedFloors] = useState<Set<string>>(new Set());
  const [selectedFloorTab, setSelectedFloorTab] = useState<string>("all");

  const toggleFloorCollapse = (floorTitle: string) => {
    setExpandedFloors((prev) => {
      const next = new Set(prev);
      if (next.has(floorTitle)) {
        next.delete(floorTitle);
      } else {
        next.add(floorTitle);
      }
      return next;
    });
  };

  const collapseAllFloors = () => {
    setExpandedFloors(new Set());
  };

  const expandAllFloors = (allFloorTitles: string[]) => {
    setExpandedFloors(new Set(allFloorTitles));
  };
  const [housekeepingViewMode, setHousekeepingViewMode] = useState<
    "tasklist" | "grid"
  >("tasklist");
  const defaultStatus: RoomStatusFilter = useMemo(() => {
    const s = initialStatus?.toLowerCase();
    if (
      s === "available" ||
      s === "reserved" ||
      s === "occupied" ||
      s === "overdue" ||
      s === "processing" ||
      s === "maintenance" ||
      s === "blocked"
    ) {
      return s;
    }
    return isHousekeeping ? "processing" : "all";
  }, [initialStatus, isHousekeeping]);

  const [status, setStatus] = useState<RoomStatusFilter>(defaultStatus);
  const hasActiveFilters = Boolean(
    inputQuery.trim() ||
    floor !== "all" ||
    type !== "all" ||
    zone !== "all" ||
    status !== defaultStatus,
  );

  const resetFilters = () => {
    setInputQuery("");
    setFloor("all");
    setType("all");
    setZone("all");
    setStatus(defaultStatus);
    setSelectedFloorTab("all");
    setPage(1);
  };
  const [selectedRoom, setSelectedRoom] = useState<HotelRoomSummary | null>(
    () =>
      initialFlow === "check-in" && canManageStays && !isHousekeeping
        ? (initialRoomsPage.items.find(isAvailable) ?? null)
        : null,
  );
  const [roomQrPreview, setRoomQrPreview] = useState<RoomQrPreview | null>(
    null,
  );
  const [selectedContextRoom, setSelectedContextRoom] =
    useState<HotelRoomSummary | null>(null);
  const cardTriggerRefMap = useRef<Map<string, HTMLElement>>(new Map());
  const activeTriggerRef = useRef<HTMLElement | null>(null);
  const floorScrollRefMap = useRef<Map<string, HTMLDivElement>>(new Map());

  const scrollFloorRow = (floorTitle: string, offset: number) => {
    const el = floorScrollRefMap.current.get(floorTitle);
    if (el) {
      el.scrollBy({ left: offset, behavior: "smooth" });
    }
  };

  function openRoomContextPanel(
    room: HotelRoomSummary,
    triggerEl?: HTMLElement | null,
  ) {
    if (triggerEl) {
      activeTriggerRef.current = triggerEl;
    } else {
      activeTriggerRef.current = cardTriggerRefMap.current.get(room.id) ?? null;
    }
    setSelectedContextRoom(room);
  }
  const [isCheckInOpen, setIsCheckInOpen] = useState(
    initialFlow === "check-in" &&
      canManageStays &&
      !isHousekeeping &&
      initialRoomsPage.items.some(isAvailable),
  );
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [activeReservationCheckIn, setActiveReservationCheckIn] = useState<{
    reservationId: string;
    guestDisplayName?: string;
    roomId: string | null;
    updatedAt?: string | null;
  } | null>(null);
  const [customCheckInInitialFields, setCustomCheckInInitialFields] =
    useState<Partial<CheckInStayFields> | null>(null);

  // Available Room Action Choice Modal
  const [availableRoomChoice, setAvailableRoomChoice] =
    useState<HotelRoomSummary | null>(null);

  // Operational View Mode: "grid" (Sơ đồ phòng) vs "tape-chart" (Kế hoạch phòng)
  const storedViewMode = useRoomViewStore((s) => s.viewModeMap[hotelId]);
  const setStoredViewMode = useRoomViewStore((s) => s.setViewMode);

  const [operationalViewMode, setOperationalViewMode] = useState<
    "grid" | "tape-chart"
  >(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const urlView = sp.get("view") || sp.get("tab");
      if (
        urlView === "tape-chart" ||
        urlView === "room-plan" ||
        urlView === "plan"
      ) {
        return "tape-chart";
      }
      if (urlView === "grid" || urlView === "rooms") {
        return "grid";
      }
    }
    if (initialView) return initialView;
    if (storedViewMode) return storedViewMode;
    return "grid";
  });

  const handleOperationalViewModeChange = useCallback(
    (mode: "grid" | "tape-chart") => {
      setOperationalViewMode(mode);
      setStoredViewMode(hotelId, mode);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (mode === "tape-chart") {
          url.searchParams.set("view", "tape-chart");
        } else {
          url.searchParams.delete("view");
          url.searchParams.delete("tab");
          url.searchParams.delete("startDate");
          url.searchParams.delete("viewMode");
        }
        window.history.replaceState(null, "", url.toString());
      }
    },
    [hotelId, setStoredViewMode],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncFromUrl = () => {
      const sp = new URLSearchParams(window.location.search);
      const urlView = sp.get("view") || sp.get("tab");
      if (
        urlView === "tape-chart" ||
        urlView === "room-plan" ||
        urlView === "plan"
      ) {
        setOperationalViewMode("tape-chart");
      } else if (urlView === "grid" || urlView === "rooms") {
        setOperationalViewMode("grid");
      }
    };
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && operationalViewMode === "tape-chart") {
      const url = new URL(window.location.href);
      if (
        url.searchParams.get("view") !== "tape-chart" &&
        url.searchParams.get("tab") !== "room-plan"
      ) {
        url.searchParams.set("view", "tape-chart");
        window.history.replaceState(null, "", url.toString());
      }
    }
  }, [operationalViewMode]);

  // Future Reservation State
  const [isReservationOpen, setIsReservationOpen] = useState(
    initialFlow === "reservation" && !isHousekeeping,
  );
  const [reservationRoomId, setReservationRoomId] = useState<string>("");
  const [initialReservationRoomId, setInitialReservationRoomId] =
    useState<string>("");
  const [reservationGuestName, setReservationGuestName] = useState<string>("");
  const [reservationGuestPhone, setReservationGuestPhone] =
    useState<string>("");
  const [reservationCheckIn, setReservationCheckIn] = useState<string>(() => {
    const d = new Date();
    if (initialBusinessDate && initialBusinessDate > todayYmd) {
      const parts = initialBusinessDate.split("-").map(Number);
      if (parts[0] && parts[1] && parts[2]) {
        d.setFullYear(parts[0], parts[1] - 1, parts[2]);
      }
    } else {
      d.setDate(d.getDate() + 1);
    }
    d.setHours(14, 0, 0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
  });
  const [reservationCheckOut, setReservationCheckOut] = useState<string>(() => {
    const d = new Date();
    if (initialBusinessDate && initialBusinessDate > todayYmd) {
      const parts = initialBusinessDate.split("-").map(Number);
      if (parts[0] && parts[1] && parts[2]) {
        d.setFullYear(parts[0], parts[1] - 1, parts[2]);
      }
      d.setDate(d.getDate() + 1);
    } else {
      d.setDate(d.getDate() + 2);
    }
    d.setHours(12, 0, 0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
  });
  const [reservationNightlyRate, setReservationNightlyRate] =
    useState<string>("");
  const [reservationSubmitting, setReservationSubmitting] =
    useState<boolean>(false);
  const reservationPriceInputRef = useRef<HTMLInputElement>(null);

  // Single Reservation Channel Source, Partner & Staff/Sale
  const [reservationSourceCategory, setReservationSourceCategory] = useState<
    "DIRECT" | "OTA" | "TA" | "CORPORATE" | "OTHER"
  >("DIRECT");
  const [reservationSourcePartnerId, setReservationSourcePartnerId] = useState<string>("");
  const [reservationCustomPartnerName, setReservationCustomPartnerName] = useState<string>("");
  const [reservationIsAddingNewPartner, setReservationIsAddingNewPartner] = useState(false);
  const [reservationIsCustomNightlyRates, setReservationIsCustomNightlyRates] = useState(false);
  const [reservationNightlyRates, setReservationNightlyRates] = useState<Record<string, number>>({});
  const [reservationPrebookedServices, setReservationPrebookedServices] = useState<PrebookedServiceItem[]>([]);

  // Bulk Reservation (Lane D) State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<"auto" | "manual">("auto");
  const [bulkRoomTypeCounts, setBulkRoomTypeCounts] = useState<Record<string, number>>({});
  const [bulkLeadName, setBulkLeadName] = useState("");
  const [bulkCheckInDate, setBulkCheckInDate] = useState("");
  const [bulkCheckOutDate, setBulkCheckOutDate] = useState("");
  const [bulkSelectedRoomIds, setBulkSelectedRoomIds] = useState<Set<string>>(
    new Set(),
  );
  const [bulkConflictRoomIds, setBulkConflictRoomIds] = useState<Set<string>>(
    new Set(),
  );
  const [bulkSearchQuery, setBulkSearchQuery] = useState("");
  const [bulkFloorFilter, setBulkFloorFilter] = useState("all");
  const [bulkTypeFilter, setBulkTypeFilter] = useState("all");
  const [bulkUniformPrice, setBulkUniformPrice] = useState("");
  const [bulkRoomCustomPrices, setBulkRoomCustomPrices] = useState<
    Record<string, number | null>
  >({});
  const [bulkRoomTypeCustomPrices, setBulkRoomTypeCustomPrices] = useState<
    Record<string, number | null>
  >({});

  // Bulk Reservation Channel Source, Partner & Staff/Sale
  const [bulkSourceCategory, setBulkSourceCategory] = useState<
    "DIRECT" | "OTA" | "TA" | "CORPORATE" | "OTHER"
  >("DIRECT");
  const [bulkSourcePartnerId, setBulkSourcePartnerId] = useState<string>("");
  const [bulkCustomPartnerName, setBulkCustomPartnerName] = useState<string>("");
  const [bulkIsAddingNewPartner, setBulkIsAddingNewPartner] = useState(false);
  const [bulkIsCustomNightlyRates, setBulkIsCustomNightlyRates] = useState(false);
  const [bulkNightlyRates, setBulkNightlyRates] = useState<Record<string, number>>({});
  const [bulkPrebookedServices, setBulkPrebookedServices] = useState<PrebookedServiceItem[]>([]);

  // Booking Source Partners Query
  const bookingPartnersQuery = useQuery({
    ...staffRoomsResource.bind({ hotelId }).queries.bookingPartners.options(undefined),
    enabled: Boolean(!isHousekeeping && (isReservationOpen || isBulkModalOpen)),
  });
  const createBookingPartnerMutation = useMutation(
    staffRoomsResource.bind({ hotelId }).mutations.createBookingPartner.options(),
  );

  const bookingPartnersList = useMemo<BookingSourcePartnerItem[]>(
    () => (Array.isArray(bookingPartnersQuery.data) ? bookingPartnersQuery.data : []),
    [bookingPartnersQuery.data],
  );

  const bulkReservationsMutation = useMutation(
    staffRoomsResource
      .bind({ hotelId })
      .mutations.createBulkReservations.options(),
  );
  const isBulkSubmitting = bulkReservationsMutation.isPending;

  const [confirmationModalState, setConfirmationModalState] = useState<{
    isOpen: boolean;
    mode: "single" | "group";
    reservationId?: string | null;
    groupCode?: string | null;
    autoPrint?: boolean;
  }>({ isOpen: false, mode: "single" });

  const roomPlanScope = useMemo(
    () => roomPlanResource.bind({ hotelId }),
    [hotelId],
  );

  const bulkPlanQueryRange = useMemo(() => {
    if (
      !bulkCheckInDate ||
      !bulkCheckOutDate ||
      bulkCheckInDate >= bulkCheckOutDate
    ) {
      return { from: todayYmd, to: todayYmd };
    }
    const inTime = new Date(`${bulkCheckInDate}T00:00:00.000Z`).getTime();
    const outTime = new Date(`${bulkCheckOutDate}T00:00:00.000Z`).getTime();
    const diffDays = Math.round((outTime - inTime) / (1000 * 60 * 60 * 24));
    if (diffDays > 30) {
      const maxTo = new Date(inTime + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      return { from: bulkCheckInDate, to: maxTo };
    }
    return { from: bulkCheckInDate, to: bulkCheckOutDate };
  }, [bulkCheckInDate, bulkCheckOutDate, todayYmd]);

  const shouldQueryBulkPlan =
    isBulkModalOpen &&
    Boolean(
      bulkCheckInDate &&
        bulkCheckOutDate &&
        bulkCheckInDate < bulkCheckOutDate,
    );

  const { data: bulkPlanData, isFetching: isBulkPlanFetching } = useQuery({
    ...roomPlanScope.queries.plan.options({
      from: bulkPlanQueryRange.from,
      to: bulkPlanQueryRange.to,
    }),
    enabled: shouldQueryBulkPlan,
    staleTime: 30_000,
  });

  function openBulkReservationModal() {
    if (isHousekeeping) return;
    const defaultIn =
      businessDate && businessDate > todayYmd ? businessDate : tomorrowYmd;
    const inDateObj = new Date(defaultIn);
    inDateObj.setDate(inDateObj.getDate() + 1);
    const defaultOut = new Date(
      inDateObj.getTime() - inDateObj.getTimezoneOffset() * 60_000,
    )
      .toISOString()
      .slice(0, 10);

    setBulkMode("auto");
    setBulkRoomTypeCounts({});
    setBulkLeadName("");
    setBulkCheckInDate(defaultIn);
    setBulkCheckOutDate(defaultOut);
    setBulkSelectedRoomIds(new Set());
    setBulkConflictRoomIds(new Set());
    setBulkSearchQuery("");
    setBulkFloorFilter("all");
    setBulkTypeFilter("all");
    setBulkUniformPrice("");
    setBulkRoomCustomPrices({});
    setBulkRoomTypeCustomPrices({});
    setIsBulkModalOpen(true);
  }

  function incrementRoomTypeCount(roomTypeId: string, maxAvailable?: number) {
    setBulkRoomTypeCounts((prev) => {
      const current = prev[roomTypeId] || 0;
      if (typeof maxAvailable === "number" && current >= maxAvailable) {
        void showWarningAlert(
          "Không đủ phòng trống",
          `Loại phòng này hiện chỉ còn ${maxAvailable} phòng trống trong khoảng thời gian đã chọn.`,
        );
        return prev;
      }
      const total = Object.values(prev).reduce((a, b) => a + b, 0);
      if (total >= 50) {
        void showWarningAlert("Giới hạn", "Chỉ được đặt tối đa 50 phòng trong một lần đặt theo đoàn.");
        return prev;
      }
      return { ...prev, [roomTypeId]: current + 1 };
    });
  }

  function decrementRoomTypeCount(roomTypeId: string) {
    setBulkRoomTypeCounts((prev) => {
      const current = prev[roomTypeId] || 0;
      if (current <= 1) {
        const next = { ...prev };
        delete next[roomTypeId];
        return next;
      }
      return { ...prev, [roomTypeId]: current - 1 };
    });
  }

  function handleBulkCheckInChange(newInDate: string) {
    setBulkCheckInDate(newInDate);
    if (bulkCheckOutDate && bulkCheckOutDate <= newInDate) {
      const inDateObj = new Date(newInDate);
      inDateObj.setDate(inDateObj.getDate() + 1);
      const nextOut = new Date(
        inDateObj.getTime() - inDateObj.getTimezoneOffset() * 60_000,
      )
        .toISOString()
        .slice(0, 10);
      setBulkCheckOutDate(nextOut);
    }
  }

  function toggleBulkRoom(roomId: string) {
    setBulkSelectedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) {
        next.delete(roomId);
      } else {
        if (next.size >= 50) {
          void showWarningAlert(
            "Giới hạn phòng",
            "Chỉ được chọn tối đa 50 phòng trong một lần đặt theo đoàn.",
          );
          return prev;
        }
        next.add(roomId);
        if (bulkUniformPrice && bulkUniformPrice.replace(/\D/g, "")) {
          const num = Number(bulkUniformPrice.replace(/\D/g, ""));
          setBulkRoomCustomPrices((p) => ({ ...p, [roomId]: num }));
        }
      }
      return next;
    });
    setBulkConflictRoomIds((prev) => {
      if (prev.has(roomId)) {
        const next = new Set(prev);
        next.delete(roomId);
        return next;
      }
      return prev;
    });
  }

  function selectAllAvailableBulkRooms(roomList: HotelRoomSummary[]) {
    const uniformNum =
      bulkUniformPrice && bulkUniformPrice.replace(/\D/g, "")
        ? Number(bulkUniformPrice.replace(/\D/g, ""))
        : undefined;

    setBulkSelectedRoomIds((prev) => {
      const next = new Set(prev);
      for (const r of roomList) {
        if (next.size >= 50) break;
        next.add(r.id);
      }
      return next;
    });

    if (uniformNum !== undefined) {
      setBulkRoomCustomPrices((prev) => {
        const next = { ...prev };
        for (const r of roomList) {
          next[r.id] = uniformNum;
        }
        return next;
      });
    }
  }

  function clearAllBulkRooms() {
    setBulkSelectedRoomIds(new Set());
    setBulkRoomCustomPrices({});
  }

  function applyUniformPriceToAllSelected() {
    const rawDigits = bulkUniformPrice.replace(/\D/g, "");
    if (!rawDigits) return;
    const num = Number(rawDigits);
    setBulkRoomCustomPrices((prev) => {
      const next = { ...prev };
      for (const id of bulkSelectedRoomIds) {
        next[id] = num;
      }
      return next;
    });
  }

  function handleBulkRoomPriceChange(roomId: string, rawVal: string) {
    const digits = rawVal.replace(/\D/g, "");
    const val = digits ? Number(digits) : 0;
    setBulkRoomCustomPrices((prev) => ({
      ...prev,
      [roomId]: val,
    }));
  }

  function resetBulkRoomPrice(roomId: string) {
    setBulkRoomCustomPrices((prev) => {
      const next = { ...prev };
      delete next[roomId];
      return next;
    });
  }

  function handleBulkRoomTypePriceChange(roomTypeId: string, rawVal: string) {
    const digits = rawVal.replace(/\D/g, "");
    const val = digits ? Number(digits) : 0;
    setBulkRoomTypeCustomPrices((prev) => ({
      ...prev,
      [roomTypeId]: val,
    }));
  }

  useEffect(() => {
    if (!isBulkModalOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !isBulkSubmitting) {
        setIsBulkModalOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isBulkModalOpen, isBulkSubmitting]);

  // Arrivals State
  const initialRange =
    initialArrivalRange === "today" || initialArrivalRange === "week"
      ? initialArrivalRange
      : "tomorrow";
  const [isArrivalsOpen, setIsArrivalsOpen] = useState(
    initialFlow === "arrivals",
  );
  const [arrivalsRange, setArrivalsRange] = useState<
    "today" | "tomorrow" | "week"
  >(initialRange);
  const [arrivalsList, setArrivalsList] = useState<HotelArrival[]>([]);
  const [arrivalsLoading, setArrivalsLoading] = useState(false);

  // Daily Movements (Khách đến & Khách đi trong ngày) Modal State
  const [isDailyMovementsOpen, setIsDailyMovementsOpen] = useState(false);
  const [dailyMovementsTab, setDailyMovementsTab] = useState<"arrivals" | "departures">("arrivals");
  const [selectedArrivalForDetail, setSelectedArrivalForDetail] = useState<HotelArrival | null>(null);

  function handleBusinessDateChange(newDate: string) {
    setBusinessDate(newDate);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (newDate && newDate !== todayYmd) {
        url.searchParams.set("businessDate", newDate);
      } else {
        url.searchParams.delete("businessDate");
      }
      window.history.replaceState(null, "", url.toString());
    }
  }

  function stepBusinessDate(offsetDays: number) {
    const currentDate = businessDate || todayYmd;
    const [year, month, day] = currentDate.split("-").map(Number);
    if (!year || !month || !day) return;
    const target = new Date(year, month - 1, day);
    target.setDate(target.getDate() + offsetDays);
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(target);
    handleBusinessDateChange(ymd);
  }

  function openFutureReservationModal(room?: HotelRoomSummary) {
    if (room?.id) {
      const physicalStatus = getRoomStatus(room);
      const isPhysicallyBusy =
        physicalStatus === "occupied" ||
        physicalStatus === "overdue" ||
        Boolean(room.activeStay && !room.activeStay.checkedOutAt);
      if (isPhysicallyBusy) {
        void showWarningAlert(
          "Phòng đang có khách",
          `Phòng ${getRoomNumber(room)} hiện chưa check-out hoặc chưa xử lý gia hạn. Vui lòng chọn phòng trống khác để đặt trước.`,
        );
        return;
      }
      setReservationRoomId(room.id);
      setInitialReservationRoomId(room.id);
      if (room.price) {
        setReservationNightlyRate(String(room.price));
      }
    } else {
      setReservationRoomId("");
      setInitialReservationRoomId("");
    }
    if (businessDate && businessDate > todayYmd) {
      const checkInD = new Date(businessDate);
      checkInD.setHours(14, 0, 0, 0);
      setReservationCheckIn(
        new Date(checkInD.getTime() - checkInD.getTimezoneOffset() * 60_000)
          .toISOString()
          .slice(0, 16),
      );
      const checkOutD = new Date(businessDate);
      checkOutD.setDate(checkOutD.getDate() + 1);
      checkOutD.setHours(12, 0, 0, 0);
      setReservationCheckOut(
        new Date(checkOutD.getTime() - checkOutD.getTimezoneOffset() * 60_000)
          .toISOString()
          .slice(0, 16),
      );
    }
    setIsReservationOpen(true);
  }

  async function submitFutureReservation(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!reservationGuestName.trim()) {
      await showWarningAlert(
        "Thiếu thông tin",
        "Vui lòng nhập họ và tên khách lưu trú.",
      );
      return;
    }
    if (!reservationCheckIn || !reservationCheckOut) {
      await showWarningAlert(
        "Thiếu thông tin",
        "Vui lòng chọn thời gian nhận và trả phòng.",
      );
      return;
    }

    const confirmResult = await showConfirmDialog({
      title: "Xác nhận tạo đặt phòng?",
      text: `Bạn có chắc chắn muốn tạo đặt phòng mới cho khách ${reservationGuestName.trim()}?`,
      confirmText: "Tạo đặt phòng",
      cancelText: "Hủy bỏ",
    });
    if (!confirmResult.isConfirmed) return;

    setReservationSubmitting(true);
    try {
      const checkInIso = new Date(reservationCheckIn).toISOString();
      const checkOutIso = new Date(reservationCheckOut).toISOString();

      let effectivePartnerId =
        reservationSourcePartnerId && reservationSourcePartnerId !== "NEW"
          ? reservationSourcePartnerId
          : null;
      if (
        reservationSourceCategory !== "DIRECT" &&
        (reservationSourcePartnerId === "NEW" || reservationIsAddingNewPartner) &&
        reservationCustomPartnerName.trim()
      ) {
        try {
          const createdPartner = await createBookingPartnerMutation.mutateAsync({
            name: reservationCustomPartnerName.trim(),
            code: generatePartnerCode(reservationCustomPartnerName.trim()),
            category: reservationSourceCategory,
            notes: "Tự động tạo từ đặt phòng trước",
          });
          effectivePartnerId = createdPartner.id;
        } catch (err) {
          console.error("Lỗi tự động tạo đối tác:", err);
        }
      }

      const chargeLines: Array<{
        lineType: "ROOM_NIGHT" | "EXTRA";
        serviceDate?: string;
        nameSnapshot: string;
        quantity: number;
        unitPriceSnapshot: number;
        totalSnapshot: number;
        currency: string;
      }> = [];

      const baseRateNum = reservationNightlyRate
        ? Number(reservationNightlyRate.replace(/\D/g, "")) || 0
        : selectedReservationRoom?.price
          ? Number(selectedReservationRoom.price)
          : 0;

      if (reservationIsCustomNightlyRates && reservationNightDates.length > 0) {
        for (const d of reservationNightDates) {
          const rateForNight = reservationNightlyRates[d] ?? baseRateNum;
          chargeLines.push({
            lineType: "ROOM_NIGHT",
            serviceDate: `${d}T14:00:00+07:00`,
            nameSnapshot: `Tiền phòng đêm ${formatVnDateStr(d)}`,
            quantity: 1,
            unitPriceSnapshot: rateForNight,
            totalSnapshot: rateForNight,
            currency: "VND",
          });
        }
      }

      for (const s of reservationPrebookedServices) {
        if (s.name.trim() && s.unitPrice >= 0 && s.quantity > 0) {
          chargeLines.push({
            lineType: "EXTRA",
            nameSnapshot: s.name.trim(),
            quantity: s.quantity,
            unitPriceSnapshot: s.unitPrice,
            totalSnapshot: s.total,
            currency: "VND",
          });
        }
      }

      const payload: Record<string, unknown> = {
        guestDisplayName: reservationGuestName.trim(),
        plannedCheckInAt: checkInIso,
        plannedCheckOutAt: checkOutIso,
        sourceCategory: reservationSourceCategory,
        sourcePartnerId: effectivePartnerId,
        bookingOwnerUserId: currentUser?.id || null,
        ...(chargeLines.length > 0 ? { chargeLines } : {}),
      };
      if (reservationGuestPhone.trim()) {
        payload.guestPhone = reservationGuestPhone.trim();
      }
      if (reservationRoomId.trim()) {
        payload.roomId = reservationRoomId.trim();
      }
      if (baseRateNum > 0) {
        payload.nightlyRateSnapshot = baseRateNum;
      }

      const res = await requestInternalApiEnvelope<HotelArrival>(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations`,
        {
          method: "POST",
          body: payload,
        },
      );

      setIsReservationOpen(false);
      setReservationGuestName("");
      setReservationGuestPhone("");
      setReservationNightlyRate("");
      setReservationRoomId("");
      setReservationSourceCategory("DIRECT");
      setReservationSourcePartnerId("");
      setReservationCustomPartnerName("");
      setReservationIsAddingNewPartner(false);
      setReservationNightlyRates({});
      setReservationIsCustomNightlyRates(false);
      setReservationPrebookedServices([]);

      const createdGuestName = res.data?.guestDisplayName || reservationGuestName;
      const reservationCode = (res.data as any)?.reservationCode || (res.data as any)?.code || (res.data as any)?.id || "";
      const createdReservationId = res.data?.id;

      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      void refetch();

      await SwalVietSage.fire({
        icon: "success",
        title: "Tạo đặt phòng thành công!",
        html: `
          <div style="font-size:14px;color:#334155;display:flex;flex-direction:column;gap:14px;margin-top:2px;">
            <p style="margin:0;text-align:center;color:#475569;font-size:14px;line-height:1.5;">
              Đã tạo thành công đặt phòng cho khách <strong>${escapeHtml(createdGuestName)}</strong>.
            </p>
            ${reservationCode ? `
            <div style="padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
              <div style="text-align:left;">
                <span style="font-size:12px;color:#64748b;font-weight:500;display:block;margin-bottom:2px;">Mã xác nhận đặt phòng</span>
                <strong style="font-size:16px;color:#0f172a;letter-spacing:0.5px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">${escapeHtml(reservationCode)}</strong>
              </div>
              <button id="swal-btn-copy-single-code" type="button" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;background:#ffffff;border:1px solid #cbd5e1;color:#1e293b;font-weight:600;font-size:12px;cursor:pointer;transition:all 0.15s ease;box-shadow:0 1px 2px rgba(0,0,0,0.05);white-space:nowrap;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                <span id="swal-single-copy-label">Sao chép</span>
              </button>
            </div>
            ` : ""}
            ${createdReservationId ? `
            <button id="swal-btn-print-single-voucher" type="button" style="display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:10px 16px;border-radius:12px;background:#1e3a8a;color:#ffffff;font-weight:700;font-size:13px;cursor:pointer;border:none;box-shadow:0 1px 3px rgba(0,0,0,0.1);transition:background 0.15s ease;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="14" y="14"/></svg>
              <span>In / Tải phiếu xác nhận gửi khách</span>
            </button>
            ` : ""}
          </div>
        `,
        showConfirmButton: true,
        confirmButtonText: "Hoàn tất",
        didOpen: () => {
          const copyBtn = document.getElementById("swal-btn-copy-single-code");
          const copyLabel = document.getElementById("swal-single-copy-label");
          if (copyBtn && reservationCode) {
            copyBtn.addEventListener("click", () => {
              void navigator.clipboard.writeText(reservationCode);
              if (copyLabel) copyLabel.innerText = "Đã sao chép";
              copyBtn.style.borderColor = "#86efac";
              copyBtn.style.color = "#166534";
              copyBtn.style.backgroundColor = "#f0fdf4";
              setTimeout(() => {
                if (copyLabel) copyLabel.innerText = "Sao chép";
                copyBtn.style.borderColor = "#cbd5e1";
                copyBtn.style.color = "#1e293b";
                copyBtn.style.backgroundColor = "#ffffff";
              }, 2000);
            });
          }

          const printBtn = document.getElementById("swal-btn-print-single-voucher");
          if (printBtn && createdReservationId) {
            printBtn.addEventListener("click", () => {
              SwalVietSage.close();
              setConfirmationModalState({
                isOpen: true,
                mode: "single",
                reservationId: createdReservationId,
              });
            });
          }
        },
      });
    } catch (err: unknown) {
      const errorObj = err as {
        status?: number;
        data?: { actionable?: boolean; detail?: string; code?: string };
        message?: string;
      };

      if (
        errorObj?.status === 409 ||
        errorObj?.data?.code === "INTERVAL_CONFLICT"
      ) {
        const conflictDetail =
          errorObj.data?.detail ||
          errorObj.message ||
          "Phòng đã có khách lưu trú hoặc xung đột với lịch đặt phòng khác trong khoảng thời gian này. Vui lòng chọn phòng khác hoặc thay đổi thời gian lưu trú.";

        await SwalVietSage.fire({
          icon: "warning",
          title: "Xung đột lịch đặt phòng",
          html: `
            <div style="font-size:14px;color:#475569;text-align:left;line-height:1.6">
              ${conflictDetail}
            </div>
          `,
          confirmButtonText: "Đổi phòng / Đổi ngày",
          showCancelButton: true,
          cancelButtonText: "Đóng",
        });
      } else {
        await showErrorAlert(
          "Không thể tạo đặt phòng",
          err instanceof Error ? err.message : "Đã có lỗi xảy ra.",
        );
      }
    } finally {
      setReservationSubmitting(false);
    }
  }

  async function loadArrivals(range: "today" | "tomorrow" | "week") {
    setArrivalsLoading(true);
    const { from, to } = getArrivalDateRange(range, todayYmd);

    try {
      const res = await requestInternalApiEnvelope<HotelOpsPage<HotelArrival>>(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/arrivals?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=100`,
        { method: "GET" },
      );
      setArrivalsList(res.data?.items ?? []);
    } catch (err) {
      await showErrorAlert(
        "Không thể tải danh sách khách đặt trước",
        err instanceof Error ? err.message : "Đã có lỗi xảy ra.",
      );
    } finally {
      setArrivalsLoading(false);
    }
  }


  useEffect(() => {
    let ignore = false;
    const { from, to } = getArrivalDateRange("week", todayYmd);
    requestInternalApiEnvelope<HotelOpsPage<HotelArrival>>(
      `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/arrivals?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=100`,
      { method: "GET" },
    )
      .then((res) => {
        if (!ignore) {
          setArrivalsList(res.data?.items ?? []);
        }
      })
      .catch(() => {
        // Background load on mount: do not block UI with alert
      });
    return () => {
      ignore = true;
    };
  }, [hotelId, todayYmd]);

  async function handleAssignRoom(arrival: HotelArrival) {
    if (!canManageReservations) return;
    const availableRooms = rooms.filter((r) => {
      const physicalStatus = getRoomStatus(r);
      const isPhysicallyBusy =
        physicalStatus === "occupied" ||
        physicalStatus === "overdue" ||
        Boolean(r.activeStay && !r.activeStay.checkedOutAt);
      if (isPhysicallyBusy && r.id !== arrival.roomId) return false;
      if (
        (physicalStatus === "maintenance" ||
          physicalStatus === "blocked" ||
          physicalStatus === "processing") &&
        r.id !== arrival.roomId
      ) {
        return false;
      }
      return physicalStatus === "available" || r.id === arrival.roomId;
    });

    if (availableRooms.length === 0) {
      await showWarningAlert(
        "Không có phòng trống",
        "Hiện không có phòng nào ở trạng thái TRỐNG để gán cho đơn đặt này.",
      );
      return;
    }

    const optionsHtml = availableRooms
      .map(
        (r) =>
          `<option value="${r.id}" ${r.id === arrival.roomId ? "selected" : ""}>Phòng ${getRoomNumber(r)} (${r.type || "Tiêu chuẩn"})</option>`,
      )
      .join("");

    const { value: selectedRoomId } = await SwalVietSage.fire({
      title: `Gán / Đổi phòng cho khách ${arrival.guestDisplayName}`,
      html: `
        <div style="font-size:14px;color:#475569;margin-bottom:12px;text-align:left">
          Chọn phòng từ danh sách phòng trống khả dụng:
        </div>
        <select id="swal-assign-room-select" style="width:100%;padding:10px;border-radius:8px;border:1px solid #cbd5e1;font-size:14px">
          ${optionsHtml}
        </select>
      `,
      showCancelButton: true,
      confirmButtonText: "Xác nhận gán phòng",
      cancelButtonText: "Hủy",
      preConfirm: () => {
        const select = document.getElementById(
          "swal-assign-room-select",
        ) as HTMLSelectElement | null;
        return select?.value;
      },
    });

    if (!selectedRoomId) return;

    try {
      await requestInternalApiEnvelope(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/${encodeURIComponent(arrival.id)}/room`,
        {
          method: "PUT",
          body: { roomId: selectedRoomId },
        },
      );
      await showSuccessAlert(
        "Đã gán phòng thành công",
        `Đã gán phòng cho khách ${arrival.guestDisplayName}.`,
      );
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      void refetch();
      if (isArrivalsOpen) {
        void loadArrivals(arrivalsRange);
      }
    } catch (err) {
      await showErrorAlert(
        "Không thể gán phòng",
        err instanceof Error ? err.message : "Đã có lỗi xảy ra.",
      );
    }
  }

  function handleCheckInArrival(arrival: HotelArrival) {
    if (!canCheckInStay) return;
    if (!arrival.roomId) {
      void showWarningAlert(
        "Chưa gán phòng",
        "Vui lòng gán phòng cho khách trước khi làm thủ tục nhận phòng.",
      );
      return;
    }

    const room = rooms.find((r) => r.id === arrival.roomId);
    if (!room) {
      void showWarningAlert(
        "Không tìm thấy phòng",
        "Phòng được gán không tồn tại trong danh sách phòng.",
      );
      return;
    }

    setSelectedRoom(room);
    setActiveReservationCheckIn({
      reservationId: arrival.id,
      guestDisplayName: arrival.guestDisplayName,
      roomId: arrival.roomId,
      updatedAt: arrival.updatedAt,
    });
    setCustomCheckInInitialFields({
      guestDisplayName: arrival.guestDisplayName,
      guestPhone: arrival.guestPhone || "",
      plannedCheckOutAt: arrival.plannedCheckOutAt,
      reservationCode: arrival.reservationCode,
      plannedCheckInAt: arrival.plannedCheckInAt,
      notes: arrival.notes ?? undefined,
    });
    setSubmitError(undefined);
    setIsArrivalsOpen(false);
    setIsCheckInOpen(true);
  }

  useEffect(() => {
    const handler = setTimeout(() => {
      setQuery(inputQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [inputQuery]);

  const {
    data: roomsPage,
    isFetching,
    refetch,
    isError,
    error,
  } = useQuery({
    ...staffRoomsResource.bind({ hotelId }).queries.list.options({
      page,
      limit: pageSize,
      q: query,
      status: isFutureDate ? "all" : status,
      floor,
      zone,
      type,
      vipOnly: false,
      businessDate: isFutureDate ? businessDate : undefined,
    }),
    refetchInterval: operationalViewMode === "grid" ? 60_000 : false,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
    initialData:
      page === 1 &&
      pageSize === 100 &&
      !query &&
      status === defaultStatus &&
      floor === "all" &&
      type === "all" &&
      businessDate ===
        (isHousekeeping ? todayYmd : initialBusinessDate || todayYmd)
        ? {
            ...initialRoomsPage,
            items: initialRoomsPage.items.slice(0, 100),
            total: initialRoomsPage.total ?? initialRoomsPage.items.length,
            totalPages: Math.max(
              1,
              Math.ceil(
                (initialRoomsPage.total ?? initialRoomsPage.items.length) / 100,
              ),
            ),
            limit: 100,
          }
        : undefined,
  });

  const isUnassigned =
    isError &&
    (Boolean(error?.message?.includes("chưa được gán phòng")) ||
      Boolean(error?.message?.includes("Chưa gán phòng")) ||
      (error as { status?: number })?.status === 403);

  const rooms = roomsPage?.items ?? [];

  const activeMovementsTargetYmd = businessDate || todayYmd;

  const todayArrivalsList = useMemo(() => {
    return arrivalsList.filter((arr) => {
      const arrYmd = arr.plannedCheckInAt ? arr.plannedCheckInAt.slice(0, 10) : "";
      return arrYmd === activeMovementsTargetYmd;
    });
  }, [arrivalsList, activeMovementsTargetYmd]);

  const todayDeparturesList = useMemo(() => {
    const list: Array<{
      room: HotelRoomSummary;
      stay: HotelStaySummary;
      status: "DUE_TODAY" | "OVERDUE" | "CHECKED_OUT";
    }> = [];
    for (const room of rooms) {
      const stay = room.activeStay;
      if (!stay) continue;

      const outYmd = stay.plannedCheckOutAt ? stay.plannedCheckOutAt.slice(0, 10) : "";
      const actualOutYmd = stay.checkedOutAt ? stay.checkedOutAt.slice(0, 10) : "";

      if (stay.checkedOutAt && actualOutYmd === activeMovementsTargetYmd) {
        list.push({ room, stay, status: "CHECKED_OUT" });
      } else if (!stay.checkedOutAt) {
        if (outYmd === activeMovementsTargetYmd) {
          list.push({ room, stay, status: "DUE_TODAY" });
        } else if (outYmd && outYmd < activeMovementsTargetYmd) {
          list.push({ room, stay, status: "OVERDUE" });
        }
      }
    }
    return list;
  }, [rooms, activeMovementsTargetYmd]);
  const floors = useMemo(() => {
    const rawFloors = roomsPage?.floors ?? initialRoomsPage.floors ?? [];
    return [...new Set(rawFloors)].sort((a, b) => a.localeCompare(b));
  }, [roomsPage?.floors, initialRoomsPage.floors]);

  const types = useMemo(() => {
    const rawTypes = roomsPage?.types ?? initialRoomsPage.types ?? [];
    return [...new Set(rawTypes)].sort((a, b) => a.localeCompare(b));
  }, [roomsPage?.types, initialRoomsPage.types]);

  const zones = useMemo(() => {
    const all = roomsPage?.items ?? initialRoomsPage.items ?? [];
    const set = new Set<string>();
    for (const r of all) {
      const z = (r as any).zone;
      if (z && String(z).trim()) set.add(String(z).trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [roomsPage?.items, initialRoomsPage.items]);

  const selectedReservationRoom = rooms.find((r) => r.id === reservationRoomId);
  const initialReservationRoom = rooms.find(
    (r) => r.id === initialReservationRoomId,
  );

  const availableReservationRooms = rooms.filter((r) => {
    const physicalStatus = getRoomStatus(r);
    const isPhysicallyBusy =
      physicalStatus === "occupied" ||
      physicalStatus === "overdue" ||
      Boolean(r.activeStay && !r.activeStay.checkedOutAt);
    if (isPhysicallyBusy) return false;

    if (
      physicalStatus === "processing" ||
      physicalStatus === "maintenance" ||
      physicalStatus === "blocked"
    ) {
      return false;
    }

    if (isFutureDate) {
      if (r.projectedStay || r.projectedReservation) return false;
      const effective = getEffectiveRoomStatus(r, true);
      if (effective !== "available") return false;
    }

    return true;
  });

  const boundChannelResource = useMemo(
    () => channelManagerResource.bind({ hotelId, roleScope: "owner" }),
    [hotelId],
  );

  const { data: otaBookings = [] } = useQuery({
    ...boundChannelResource.queries.simulatedBookings.options(
      undefined as never,
    ),
    enabled: !isHousekeeping,
    refetchInterval: operationalViewMode === "grid" ? 30_000 : false,
    staleTime: 10_000,
  });

  const { incomingOtaByRoomNumber } = useMemo(() => {
    const map = new Map<string, SimulatedBookingItem>();

    for (const b of otaBookings) {
      if (b.status === "CANCELLED") continue;
      const isTodayArrival = Boolean(
        b.checkInDate &&
        b.checkOutDate &&
        b.checkInDate <= todayYmd &&
        b.checkOutDate >= todayYmd,
      );
      const notCheckedIn =
        !b.stayStatus ||
        b.stayStatus === "PENDING" ||
        b.stayStatus === "CANCELLED";

      if (b.status === "CONFIRMED" && notCheckedIn && isTodayArrival) {
        if (b.roomNumber) {
          map.set(b.roomNumber.trim().toUpperCase(), b);
        }
      }
    }

    return {
      incomingOtaByRoomNumber: map,
    };
  }, [otaBookings, todayYmd]);

  function isRoomConflictingForDates(
    r: HotelRoomSummary,
    checkInStr: string,
    checkOutStr: string,
    planBlocks?: RoomPlanBlock[],
  ): boolean {
    if (!checkInStr || !checkOutStr) return false;

    const inYmd = checkInStr.includes("T")
      ? checkInStr.slice(0, 10)
      : checkInStr;
    const outYmd = checkOutStr.includes("T")
      ? checkOutStr.slice(0, 10)
      : checkOutStr;

    if (inYmd >= outYmd) return false;

    const checkInTime = checkInStr.includes("T")
      ? new Date(checkInStr).getTime()
      : new Date(`${inYmd}T14:00:00+07:00`).getTime();
    const checkOutTime = checkOutStr.includes("T")
      ? new Date(checkOutStr).getTime()
      : new Date(`${outYmd}T12:00:00+07:00`).getTime();

    if (
      isNaN(checkInTime) ||
      isNaN(checkOutTime) ||
      checkOutTime <= checkInTime
    ) {
      return false;
    }

    // 1. Scoped query from bulkPlanData.blocks: kiểm tra giao thoa chính xác khoảng ngày
    if (planBlocks && planBlocks.length > 0) {
      for (const block of planBlocks) {
        if (block.roomId !== r.id) continue;
        if (block.status === "CANCELLED" || block.status === "NO_SHOW") continue;
        const bStart = block.startDate ? block.startDate.slice(0, 10) : "";
        const bEnd = block.endDate ? block.endDate.slice(0, 10) : "";
        if (bStart && bEnd && inYmd < bEnd && outYmd > bStart) {
          return true;
        }
      }
    }

    const physicalStatus = getRoomStatus(r);
    const isTodayOrPast = inYmd <= todayYmd;

    // 2. Case: Đặt trong hiện tại (check-in hôm nay)
    // Nếu khách nhận phòng ngay hôm nay: các phòng đang có khách ở, quá hạn trả, hoặc đang chờ dọn dẹp đều chưa thể nhận phòng
    if (isTodayOrPast) {
      if (
        physicalStatus === "occupied" ||
        physicalStatus === "overdue" ||
        physicalStatus === "processing" ||
        Boolean(r.activeStay && !r.activeStay.checkedOutAt)
      ) {
        return true;
      }
    }

    // 3. Khách đang lưu trú (activeStay)
    if (
      r.activeStay &&
      !r.activeStay.checkedOutAt &&
      r.activeStay.plannedCheckOutAt
    ) {
      const stayEndStr = toVietnamDateString(r.activeStay.plannedCheckOutAt);
      const stayStartStr =
        toVietnamDateString(
          r.activeStay.checkedInAt ?? r.activeStay.plannedCheckInAt,
        ) ?? todayYmd;

      if (stayEndStr && inYmd < stayEndStr && outYmd > stayStartStr) {
        return true;
      }

      const sEnd = new Date(r.activeStay.plannedCheckOutAt).getTime();
      const sStart = r.activeStay.checkedInAt
        ? new Date(r.activeStay.checkedInAt).getTime()
        : r.activeStay.plannedCheckInAt
          ? new Date(r.activeStay.plannedCheckInAt).getTime()
          : 0;
      if (sStart < checkOutTime && sEnd > checkInTime) {
        return true;
      }
    }

    // 4. Lịch đặt trước đã phân bổ phòng (projectedReservation)
    if (
      r.projectedReservation?.plannedCheckInAt &&
      r.projectedReservation?.plannedCheckOutAt
    ) {
      const pIn = toVietnamDateString(r.projectedReservation.plannedCheckInAt);
      const pOut = toVietnamDateString(r.projectedReservation.plannedCheckOutAt);
      if (pIn && pOut && inYmd < pOut && outYmd > pIn) {
        return true;
      }
      const resStart = new Date(
        r.projectedReservation.plannedCheckInAt,
      ).getTime();
      const resEnd = new Date(
        r.projectedReservation.plannedCheckOutAt,
      ).getTime();
      if (resStart < checkOutTime && resEnd > checkInTime) {
        return true;
      }
    }

    // 5. Lịch đặt trước sắp tới (upcomingReservation)
    if (
      r.upcomingReservation?.plannedCheckInAt &&
      r.upcomingReservation?.plannedCheckOutAt
    ) {
      const uIn = toVietnamDateString(r.upcomingReservation.plannedCheckInAt);
      const uOut = toVietnamDateString(r.upcomingReservation.plannedCheckOutAt);
      if (uIn && uOut && inYmd < uOut && outYmd > uIn) {
        return true;
      }
      const resStart = new Date(
        r.upcomingReservation.plannedCheckInAt,
      ).getTime();
      const resEnd = new Date(
        r.upcomingReservation.plannedCheckOutAt,
      ).getTime();
      if (resStart < checkOutTime && resEnd > checkInTime) {
        return true;
      }
    }

    // 6. Danh sách khách đặt trước (arrivalsList)
    for (const arr of arrivalsList) {
      if (arr.roomId !== r.id) continue;
      if (
        arr.status === "CHECKED_IN" ||
        arr.status === "CANCELLED" ||
        arr.status === "NO_SHOW"
      ) {
        continue;
      }
      const aStart = toVietnamDateString(arr.plannedCheckInAt);
      const aEnd = toVietnamDateString(arr.plannedCheckOutAt);
      if (aStart && aEnd && inYmd < aEnd && outYmd > aStart) {
        return true;
      }
      const aStartTime = new Date(arr.plannedCheckInAt).getTime();
      const aEndTime = new Date(arr.plannedCheckOutAt).getTime();
      if (aStartTime < checkOutTime && aEndTime > checkInTime) {
        return true;
      }
    }

    // 7. Kênh OTA
    if (otaBookings && otaBookings.length > 0) {
      const roomNum = getRoomNumber(r).toUpperCase();
      for (const ota of otaBookings) {
        if (ota.status === "CANCELLED" || !ota.roomNumber) continue;
        if (ota.roomNumber.trim().toUpperCase() !== roomNum) continue;
        const oIn = ota.checkInDate ? ota.checkInDate.slice(0, 10) : "";
        const oOut = ota.checkOutDate ? ota.checkOutDate.slice(0, 10) : "";
        if (oIn && oOut && inYmd < oOut && outYmd > oIn) {
          return true;
        }
      }
    }

    return false;
  }

  const roomPoolMap = useMemo(() => {
    const map = new Map<string, HotelRoomSummary>();
    for (const r of initialRoomsPage.items) {
      map.set(r.id, r);
    }
    for (const r of rooms) {
      map.set(r.id, r);
    }
    if (bulkPlanData?.rooms) {
      for (const pr of bulkPlanData.rooms) {
        if (!map.has(pr.id)) {
          map.set(pr.id, {
            id: pr.id,
            hotelId,
            roomNumber: pr.roomNumber,
            floor: pr.floor,
            type: pr.roomTypeName || (pr as { type?: string }).type || "Tiêu chuẩn",
            roomTypeId: pr.roomTypeId || undefined,
            status: pr.status as any,
            physicalStatus: (pr as { physicalStatus?: string }).physicalStatus || pr.status,
            price: pr.price ?? null,
            createdAt: "",
            updatedAt: "",
          } as HotelRoomSummary);
        }
      }
    }
    return map;
  }, [initialRoomsPage.items, rooms, bulkPlanData?.rooms, hotelId]);

  const roomPool = useMemo(() => Array.from(roomPoolMap.values()), [roomPoolMap]);

  const bulkCandidateRooms = useMemo(() => {
    return roomPool.map((room) => {
      const physicalStatus = getRoomStatus(room);
      const isOverdueNow =
        physicalStatus === "overdue" ||
        Boolean(room.statusConflictCode?.toUpperCase().includes("OVERDUE"));
      const isOverdueConflict =
        isOverdueNow && Boolean(bulkCheckInDate && bulkCheckInDate <= todayYmd);
      const isConflicting =
        isRoomConflictingForDates(
          room,
          bulkCheckInDate,
          bulkCheckOutDate,
          bulkPlanData?.blocks,
        ) ||
        bulkConflictRoomIds.has(room.id) ||
        isOverdueConflict;
      const isUnavailable =
        physicalStatus === "maintenance" || physicalStatus === "blocked";
      return {
        room,
        isConflicting,
        isUnavailable,
        isSelectable: !isConflicting && !isUnavailable,
      };
    });
  }, [
    roomPool,
    bulkCheckInDate,
    bulkCheckOutDate,
    bulkConflictRoomIds,
    bulkPlanData?.blocks,
    todayYmd,
    arrivalsList,
    otaBookings,
  ]);

  const roomTypeSummaryList = useMemo(() => {
    const map = new Map<
      string,
      {
        roomTypeId: string;
        name: string;
        availableCount: number;
        totalCount: number;
        price: number | null;
      }
    >();

    for (const { room, isSelectable } of bulkCandidateRooms) {
      const name = room.type?.trim() || "Tiêu chuẩn";
      const roomTypeId = room.roomTypeId || name;
      const existing = map.get(name);
      const roomPrice = typeof room.price === "number" ? room.price : null;

      if (!existing) {
        map.set(name, {
          roomTypeId,
          name,
          availableCount: isSelectable ? 1 : 0,
          totalCount: 1,
          price: roomPrice,
        });
      } else {
        existing.totalCount += 1;
        if (isSelectable) {
          existing.availableCount += 1;
        }
        if (existing.roomTypeId === name && room.roomTypeId) {
          existing.roomTypeId = room.roomTypeId;
        }
        if (!existing.price && roomPrice) {
          existing.price = roomPrice;
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [bulkCandidateRooms]);

  const bulkTotalAutoCount = useMemo(
    () => Object.values(bulkRoomTypeCounts).reduce((a, b) => a + b, 0),
    [bulkRoomTypeCounts],
  );

  const hasOverallocatedRoomType = useMemo(
    () =>
      roomTypeSummaryList.some(
        (rt) => (bulkRoomTypeCounts[rt.roomTypeId] || 0) > rt.availableCount,
      ),
    [roomTypeSummaryList, bulkRoomTypeCounts],
  );

  useEffect(() => {
    if (!isBulkModalOpen) return;
    setBulkRoomTypeCounts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [rtId, count] of Object.entries(next)) {
        const rt = roomTypeSummaryList.find((item) => item.roomTypeId === rtId);
        const max = rt?.availableCount ?? 0;
        if (count > max) {
          changed = true;
          if (max <= 0) {
            delete next[rtId];
          } else {
            next[rtId] = max;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [roomTypeSummaryList, isBulkModalOpen]);

  const filteredBulkRooms = bulkCandidateRooms.filter(({ room }) => {
    if (bulkFloorFilter !== "all" && room.floor !== bulkFloorFilter)
      return false;
    if (
      bulkTypeFilter !== "all" &&
      (room.type || "Tiêu chuẩn") !== bulkTypeFilter
    )
      return false;
    if (bulkSearchQuery.trim()) {
      const q = bulkSearchQuery.trim().toLowerCase();
      const num = (room.roomNumber || "").toLowerCase();
      const t = (room.type || "").toLowerCase();
      if (!num.includes(q) && !t.includes(q)) return false;
    }
    return true;
  });

  const bulkNightsCount = useMemo(() => {
    if (!bulkCheckInDate || !bulkCheckOutDate) return 1;
    const inTime = new Date(bulkCheckInDate).getTime();
    const outTime = new Date(bulkCheckOutDate).getTime();
    if (isNaN(inTime) || isNaN(outTime) || outTime <= inTime) return 1;
    return Math.max(1, Math.round((outTime - inTime) / (1000 * 60 * 60 * 24)));
  }, [bulkCheckInDate, bulkCheckOutDate]);

  const bulkNightDates = useMemo(() => {
    if (!bulkCheckInDate || !bulkCheckOutDate) return [];
    const start = new Date(`${bulkCheckInDate.slice(0, 10)}T00:00:00`);
    const end = new Date(`${bulkCheckOutDate.slice(0, 10)}T00:00:00`);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return [];
    const dates: string[] = [];
    const cur = new Date(start);
    while (cur < end) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, "0");
      const d = String(cur.getDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${d}`);
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }, [bulkCheckInDate, bulkCheckOutDate]);

  const reservationNightDates = useMemo(() => {
    if (!reservationCheckIn || !reservationCheckOut) return [];
    const start = new Date(reservationCheckIn);
    const end = new Date(reservationCheckOut);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return [];
    const dates: string[] = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    while (cur < endDate) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, "0");
      const d = String(cur.getDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${d}`);
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }, [reservationCheckIn, reservationCheckOut]);

  const addBulkPrebookedService = useCallback(
    (name: string, defaultPrice: number = 0) => {
      setBulkPrebookedServices((prev) => [
        ...prev,
        {
          id: `prebook_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name,
          quantity: 1,
          unitPrice: defaultPrice,
          total: defaultPrice,
        },
      ]);
    },
    [],
  );

  const updateBulkPrebookedService = useCallback(
    (id: string, updates: Partial<PrebookedServiceItem>) => {
      setBulkPrebookedServices((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          const next = { ...item, ...updates };
          next.total = Math.max(0, (next.quantity || 1) * (next.unitPrice || 0));
          return next;
        }),
      );
    },
    [],
  );

  const removeBulkPrebookedService = useCallback((id: string) => {
    setBulkPrebookedServices((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const addReservationPrebookedService = useCallback(
    (name: string, defaultPrice: number = 0) => {
      setReservationPrebookedServices((prev) => [
        ...prev,
        {
          id: `res_prebook_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name,
          quantity: 1,
          unitPrice: defaultPrice,
          total: defaultPrice,
        },
      ]);
    },
    [],
  );

  const updateReservationPrebookedService = useCallback(
    (id: string, updates: Partial<PrebookedServiceItem>) => {
      setReservationPrebookedServices((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          const next = { ...item, ...updates };
          next.total = Math.max(0, (next.quantity || 1) * (next.unitPrice || 0));
          return next;
        }),
      );
    },
    [],
  );

  const removeReservationPrebookedService = useCallback((id: string) => {
    setReservationPrebookedServices((prev) =>
      prev.filter((item) => item.id !== id),
    );
  }, []);

  const bulkEstimatedServicesTotal = useMemo(
    () => bulkPrebookedServices.reduce((sum, s) => sum + (s.total || 0), 0),
    [bulkPrebookedServices],
  );

  const bulkEstimatedTotalPrice = useMemo(() => {
    let roomTotal = 0;
    if (bulkMode === "auto") {
      for (const rt of roomTypeSummaryList) {
        const count = bulkRoomTypeCounts[rt.roomTypeId] || 0;
        if (count > 0) {
          const defaultRate =
            bulkRoomTypeCustomPrices[rt.roomTypeId] ?? rt.price ?? 0;
          if (bulkIsCustomNightlyRates && bulkNightDates.length > 0) {
            const sumOfNights = bulkNightDates.reduce(
              (sum, d) => sum + (bulkNightlyRates[d] ?? defaultRate),
              0,
            );
            roomTotal += sumOfNights * count;
          } else {
            roomTotal += defaultRate * count * bulkNightsCount;
          }
        }
      }
    } else {
      for (const roomId of bulkSelectedRoomIds) {
        const room = roomPoolMap.get(roomId);
        const defaultRate =
          bulkRoomCustomPrices[roomId] ??
          (typeof room?.price === "number" ? room.price : 0);
        if (bulkIsCustomNightlyRates && bulkNightDates.length > 0) {
          const sumOfNights = bulkNightDates.reduce(
            (sum, d) => sum + (bulkNightlyRates[d] ?? defaultRate),
            0,
          );
          roomTotal += sumOfNights;
        } else {
          roomTotal += defaultRate * bulkNightsCount;
        }
      }
    }

    return roomTotal + bulkEstimatedServicesTotal;
  }, [
    bulkMode,
    bulkRoomTypeCounts,
    bulkRoomTypeCustomPrices,
    roomTypeSummaryList,
    bulkSelectedRoomIds,
    bulkRoomCustomPrices,
    bulkNightsCount,
    roomPoolMap,
    bulkIsCustomNightlyRates,
    bulkNightDates,
    bulkNightlyRates,
    bulkEstimatedServicesTotal,
  ]);

  const bulkEstimatedRoomsTotal = useMemo(
    () => Math.max(0, bulkEstimatedTotalPrice - bulkEstimatedServicesTotal),
    [bulkEstimatedTotalPrice, bulkEstimatedServicesTotal],
  );

  const reservationEstimatedServicesTotal = useMemo(
    () =>
      reservationPrebookedServices.reduce(
        (sum, s) => sum + (s.total || 0),
        0,
      ),
    [reservationPrebookedServices],
  );

  const reservationEstimatedRoomsTotal = useMemo(() => {
    const baseRateNum = reservationNightlyRate
      ? Number(reservationNightlyRate.replace(/\D/g, "")) || 0
      : selectedReservationRoom?.price
        ? Number(selectedReservationRoom.price)
        : 0;

    if (reservationIsCustomNightlyRates && reservationNightDates.length > 0) {
      return reservationNightDates.reduce(
        (sum, d) => sum + (reservationNightlyRates[d] ?? baseRateNum),
        0,
      );
    }
    return baseRateNum * Math.max(1, reservationNightDates.length);
  }, [
    reservationNightlyRate,
    selectedReservationRoom?.price,
    reservationIsCustomNightlyRates,
    reservationNightDates,
    reservationNightlyRates,
  ]);

  const reservationEstimatedTotalPrice = useMemo(
    () => reservationEstimatedRoomsTotal + reservationEstimatedServicesTotal,
    [reservationEstimatedRoomsTotal, reservationEstimatedServicesTotal],
  );

  function renderBulkNightlyRatesSection() {
    if (bulkNightDates.length < 2) return null;

    return (
      <div className="rounded-2xl border border-purple-200/90 bg-purple-50/40 p-3.5 transition-all">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 text-purple-700">
              <VsIcon name="calendar_month" className="text-base" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-purple-950">
                  Giá các đêm khác nhau
                </span>
                <span className="rounded-full bg-purple-200/80 px-2 py-0.5 text-xs font-bold text-purple-900 whitespace-nowrap">
                  {bulkNightDates.length} đêm
                </span>
              </div>
              <p className="text-xs text-purple-800/80 mt-0.5 text-pretty">
                Tùy chỉnh đơn giá theo từng đêm (ngày lễ, cuối tuần hoặc giá khuyến mãi theo ngày).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBulkIsCustomNightlyRates((prev) => !prev)}
            className="px-3 py-1.5 rounded-xl border border-purple-300 bg-white text-xs font-bold text-purple-800 hover:bg-purple-100 transition whitespace-nowrap cursor-pointer shadow-2xs"
          >
            {bulkIsCustomNightlyRates ? "Tắt tùy chỉnh riêng" : "Tùy chỉnh giá từng đêm"}
          </button>
        </div>

        {bulkIsCustomNightlyRates && (
          <div className="mt-3 pt-3 border-t border-purple-200/70">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {bulkNightDates.map((dateStr, idx) => {
                const weekday = getVnWeekday(dateStr);
                const currentVal = bulkNightlyRates[dateStr] ?? "";
                return (
                  <div
                    key={dateStr}
                    className="p-2.5 rounded-xl bg-white border border-purple-200 shadow-2xs flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-slate-800">
                        Đêm {idx + 1} ({weekday})
                      </span>
                      <span className="text-slate-500 font-medium">
                        {formatVnDateStr(dateStr)}
                      </span>
                    </div>
                    <div className="relative flex items-center mt-1">
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="Theo giá loại phòng"
                        value={formatPriceInput(currentVal)}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, "");
                          setBulkNightlyRates((prev) => ({
                            ...prev,
                            [dateStr]: digits ? Number(digits) : 0,
                          }));
                        }}
                        className="w-full text-xs font-bold text-purple-950 bg-purple-50/30 border border-purple-200 rounded-lg pl-2 pr-9 py-1.5 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 outline-none"
                      />
                      <span className="absolute right-2 text-xs font-semibold text-slate-400 pointer-events-none">
                        đ
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderBulkPrebookedServicesSection() {
    return (
      <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4 sm:p-5 transition-all">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 shadow-2xs shrink-0">
              <VsIcon name="add_shopping_cart" className="text-lg" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900">
                Phụ thu & Dịch vụ đặt trước
              </span>
              {bulkPrebookedServices.length > 0 ? (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 whitespace-nowrap">
                  {bulkPrebookedServices.length} mục · {formatMoney({ price: bulkEstimatedServicesTotal, currency: "VND" })}
                </span>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={() => addBulkPrebookedService("", 0)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100 transition whitespace-nowrap cursor-pointer shadow-2xs"
          >
            <VsIcon name="add" className="text-sm" />
            <span>Thêm dịch vụ</span>
          </button>
        </div>

        {/* Quick preset buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-1 pb-1">
          <span className="text-xs font-bold text-slate-500 mr-0.5">
            Gợi ý nhanh:
          </span>
          {PREBOOKED_SERVICE_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => addBulkPrebookedService(preset.name, preset.defaultPrice)}
              className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 text-xs font-semibold text-slate-700 hover:text-emerald-900 transition cursor-pointer shadow-2xs whitespace-nowrap"
            >
              <VsIcon name="add" className="text-xs text-emerald-600 group-hover:scale-110 transition-transform" />
              <span>{preset.name}</span>
              <span className="text-slate-400 font-normal">
                ({new Intl.NumberFormat("vi-VN").format(preset.defaultPrice)}₫)
              </span>
            </button>
          ))}
        </div>

        {/* Prebooked Services List */}
        {bulkPrebookedServices.length > 0 ? (
          <div className="mt-3 divide-y divide-slate-200/80 rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
            <div className="grid grid-cols-12 gap-3 bg-slate-100/90 px-4 py-2.5 text-xs font-bold text-slate-600 uppercase tracking-wider">
              <div className="col-span-5">Tên dịch vụ / Phụ thu</div>
              <div className="col-span-2 text-center">Số lượng</div>
              <div className="col-span-2 text-right">Đơn giá (₫)</div>
              <div className="col-span-3 text-right pr-2">Thành tiền</div>
            </div>
            {bulkPrebookedServices.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-12 gap-3 px-4 py-2.5 items-center hover:bg-slate-50/80 transition text-xs"
              >
                <div className="col-span-5">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => updateBulkPrebookedService(item.id, { name: e.target.value })}
                    placeholder="Nhập tên dịch vụ..."
                    className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition"
                  />
                </div>
                <div className="col-span-2 flex items-center justify-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => updateBulkPrebookedService(item.id, { quantity: Math.max(1, item.quantity - 1) })}
                    className="h-8 w-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center font-bold text-slate-700 transition cursor-pointer shadow-2xs"
                  >
                    -
                  </button>
                  <span className="w-7 text-center font-bold text-slate-800 text-xs">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateBulkPrebookedService(item.id, { quantity: item.quantity + 1 })}
                    className="h-8 w-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center font-bold text-slate-700 transition cursor-pointer shadow-2xs"
                  >
                    +
                  </button>
                </div>
                <div className="col-span-2 text-right">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatPriceInput(item.unitPrice)}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      updateBulkPrebookedService(item.id, { unitPrice: digits ? Number(digits) : 0 });
                    }}
                    placeholder="0"
                    className="w-full h-9 px-3 text-right rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition"
                  />
                </div>
                <div className="col-span-3 flex items-center justify-end gap-2">
                  <span className="font-bold text-slate-900 text-xs sm:text-sm whitespace-nowrap">
                    {formatMoney({ price: item.total, currency: "VND" })}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeBulkPrebookedService(item.id)}
                    className="h-8 w-8 text-slate-400 hover:text-rose-600 rounded-lg flex items-center justify-center hover:bg-rose-50 transition cursor-pointer"
                    title="Xóa dịch vụ này"
                  >
                    <VsIcon name="delete" className="text-base" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  function renderReservationNightlyRatesSection() {
    if (reservationNightDates.length < 2) return null;

    const baseRateNum = reservationNightlyRate
      ? Number(reservationNightlyRate.replace(/\D/g, "")) || 0
      : selectedReservationRoom?.price
        ? Number(selectedReservationRoom.price)
        : 0;

    return (
      <div className="rounded-2xl border border-emerald-200/90 bg-emerald-50/40 p-3.5 transition-all">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <VsIcon name="calendar_month" className="text-base" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-emerald-950">
                  Giá các đêm khác nhau
                </span>
                <span className="rounded-full bg-emerald-200/80 px-2 py-0.5 text-xs font-bold text-emerald-900 whitespace-nowrap">
                  {reservationNightDates.length} đêm
                </span>
              </div>
              <p className="text-xs text-emerald-800/80 mt-0.5 text-pretty">
                Tùy chỉnh giá riêng từng đêm (cuối tuần, lễ hội hoặc thỏa thuận theo ngày).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReservationIsCustomNightlyRates((prev) => !prev)}
            className="px-3 py-1.5 rounded-xl border border-emerald-300 bg-white text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition whitespace-nowrap cursor-pointer shadow-2xs"
          >
            {reservationIsCustomNightlyRates ? "Tắt tùy chỉnh riêng" : "Tùy chỉnh giá từng đêm"}
          </button>
        </div>

        {reservationIsCustomNightlyRates && (
          <div className="mt-3 pt-3 border-t border-emerald-200/70">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {reservationNightDates.map((dateStr, idx) => {
                const weekday = getVnWeekday(dateStr);
                const currentVal = reservationNightlyRates[dateStr] ?? baseRateNum;
                return (
                  <div
                    key={dateStr}
                    className="p-2.5 rounded-xl bg-white border border-emerald-200 shadow-2xs flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-slate-800">
                        Đêm {idx + 1} ({weekday})
                      </span>
                      <span className="text-slate-500 font-medium">
                        {formatVnDateStr(dateStr)}
                      </span>
                    </div>
                    <div className="relative flex items-center mt-1">
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder={baseRateNum > 0 ? String(baseRateNum) : "0"}
                        value={formatPriceInput(currentVal)}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, "");
                          setReservationNightlyRates((prev) => ({
                            ...prev,
                            [dateStr]: digits ? Number(digits) : 0,
                          }));
                        }}
                        className="w-full text-xs font-bold text-emerald-950 bg-emerald-50/30 border border-emerald-200 rounded-lg pl-2 pr-9 py-1.5 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 outline-none"
                      />
                      <span className="absolute right-2 text-xs font-semibold text-slate-400 pointer-events-none">
                        đ
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderReservationPrebookedServicesSection() {
    return (
      <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4 sm:p-5 transition-all">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 shadow-2xs shrink-0">
              <VsIcon name="add_shopping_cart" className="text-lg" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900">
                Phụ thu & Dịch vụ đặt trước
              </span>
              {reservationPrebookedServices.length > 0 ? (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 whitespace-nowrap">
                  {reservationPrebookedServices.length} mục · {formatMoney({ price: reservationEstimatedServicesTotal, currency: "VND" })}
                </span>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={() => addReservationPrebookedService("", 0)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100 transition whitespace-nowrap cursor-pointer shadow-2xs"
          >
            <VsIcon name="add" className="text-sm" />
            <span>Thêm dịch vụ</span>
          </button>
        </div>

        {/* Quick presets */}
        <div className="flex flex-wrap items-center gap-2 pt-1 pb-1">
          <span className="text-xs font-bold text-slate-500 mr-0.5">
            Gợi ý nhanh:
          </span>
          {PREBOOKED_SERVICE_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => addReservationPrebookedService(preset.name, preset.defaultPrice)}
              className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 text-xs font-semibold text-slate-700 hover:text-emerald-900 transition cursor-pointer shadow-2xs whitespace-nowrap"
            >
              <VsIcon name="add" className="text-xs text-emerald-600 group-hover:scale-110 transition-transform" />
              <span>{preset.name}</span>
              <span className="text-slate-400 font-normal">
                ({new Intl.NumberFormat("vi-VN").format(preset.defaultPrice)}₫)
              </span>
            </button>
          ))}
        </div>

        {/* List of services */}
        {reservationPrebookedServices.length > 0 ? (
          <div className="mt-3 divide-y divide-slate-200/80 rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
            <div className="grid grid-cols-12 gap-3 bg-slate-100/90 px-4 py-2.5 text-xs font-bold text-slate-600 uppercase tracking-wider">
              <div className="col-span-5">Tên dịch vụ / Phụ thu</div>
              <div className="col-span-2 text-center">Số lượng</div>
              <div className="col-span-2 text-right">Đơn giá (₫)</div>
              <div className="col-span-3 text-right pr-2">Thành tiền</div>
            </div>
            {reservationPrebookedServices.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-12 gap-3 px-4 py-2.5 items-center hover:bg-slate-50/80 transition text-xs"
              >
                <div className="col-span-5">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => updateReservationPrebookedService(item.id, { name: e.target.value })}
                    placeholder="Nhập tên dịch vụ..."
                    className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition"
                  />
                </div>
                <div className="col-span-2 flex items-center justify-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => updateReservationPrebookedService(item.id, { quantity: Math.max(1, item.quantity - 1) })}
                    className="h-8 w-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center font-bold text-slate-700 transition cursor-pointer shadow-2xs"
                  >
                    -
                  </button>
                  <span className="w-7 text-center font-bold text-slate-800 text-xs">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateReservationPrebookedService(item.id, { quantity: item.quantity + 1 })}
                    className="h-8 w-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center font-bold text-slate-700 transition cursor-pointer shadow-2xs"
                  >
                    +
                  </button>
                </div>
                <div className="col-span-2 text-right">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatPriceInput(item.unitPrice)}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      updateReservationPrebookedService(item.id, { unitPrice: digits ? Number(digits) : 0 });
                    }}
                    placeholder="0"
                    className="w-full h-9 px-3 text-right rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition"
                  />
                </div>
                <div className="col-span-3 flex items-center justify-end gap-2">
                  <span className="font-bold text-slate-900 text-xs sm:text-sm whitespace-nowrap">
                    {formatMoney({ price: item.total, currency: "VND" })}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeReservationPrebookedService(item.id)}
                    className="h-8 w-8 text-slate-400 hover:text-rose-600 rounded-lg flex items-center justify-center hover:bg-rose-50 transition cursor-pointer"
                    title="Xóa dịch vụ này"
                  >
                    <VsIcon name="delete" className="text-base" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  async function submitBulkReservations(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (isBulkSubmitting) return;

    const trimmedLeadName = bulkLeadName.trim();
    if (!trimmedLeadName || trimmedLeadName.length < 2) {
      await showWarningAlert(
        "Thiếu thông tin",
        "Vui lòng nhập họ và tên người đại diện / trưởng đoàn (tối thiểu 2 ký tự).",
      );
      return;
    }

    if (!bulkCheckInDate || !bulkCheckOutDate) {
      await showWarningAlert(
        "Thiếu thông tin",
        "Vui lòng chọn ngày nhận phòng và ngày trả phòng hợp lệ.",
      );
      return;
    }

    if (bulkCheckInDate >= bulkCheckOutDate) {
      await showWarningAlert(
        "Thời gian không hợp lệ",
        "Ngày trả phòng phải sau ngày nhận phòng ít nhất 1 đêm.",
      );
      return;
    }

    const isAuto = bulkMode === "auto";

    if (isAuto) {
      const totalRoomsCount = Object.values(bulkRoomTypeCounts).reduce(
        (a, b) => a + b,
        0,
      );
      if (totalRoomsCount < 1) {
        await showWarningAlert(
          "Chưa chọn phòng",
          "Vui lòng chọn số lượng ít nhất 1 phòng thuộc các loại phòng để đặt trước.",
        );
        return;
      }
      if (totalRoomsCount > 50) {
        await showWarningAlert(
          "Vượt quá số lượng",
          "Chỉ được đặt tối đa 50 phòng trong một lần đặt theo đoàn.",
        );
        return;
      }

      for (const rt of roomTypeSummaryList) {
        const count = bulkRoomTypeCounts[rt.roomTypeId] || 0;
        if (count > rt.availableCount) {
          await showWarningAlert(
            "Không đủ phòng trống",
            `Loại phòng "${rt.name}" chỉ còn ${rt.availableCount} phòng trống trong khoảng thời gian đã chọn (bạn đang chọn ${count} phòng). Vui lòng giảm số lượng hoặc chọn ngày khác.`,
          );
          return;
        }
      }
    } else {
      if (bulkSelectedRoomIds.size < 1) {
        await showWarningAlert(
          "Chưa chọn phòng",
          "Vui lòng chọn ít nhất 1 phòng trống từ danh sách để tiếp tục.",
        );
        return;
      }

      if (bulkSelectedRoomIds.size > 50) {
        await showWarningAlert(
          "Vượt quá số lượng",
          "Chỉ được chọn tối đa 50 phòng trong một lần đặt theo đoàn.",
        );
        return;
      }
    }

    try {
      const allocations = isAuto
        ? Object.entries(bulkRoomTypeCounts)
            .filter(([_, count]) => count > 0)
            .map(([roomTypeId, quantity]) => {
              const customRate = bulkRoomTypeCustomPrices[roomTypeId];
              const rt = roomTypeSummaryList.find((item) => item.roomTypeId === roomTypeId);
              return {
                roomTypeId: rt?.roomTypeId ?? roomTypeId,
                quantity,
                ...(customRate !== undefined && customRate !== null
                  ? { rate: customRate }
                  : {}),
              };
            })
        : undefined;

      const roomRates: Record<string, number> = {};
      if (!isAuto) {
        for (const roomId of bulkSelectedRoomIds) {
          const room = roomPoolMap.get(roomId);
          const customPrice = bulkRoomCustomPrices[roomId];
          const effectivePrice =
            customPrice !== undefined && customPrice !== null
              ? customPrice
              : typeof room?.price === "number"
                ? room.price
                : null;
          if (effectivePrice !== null && effectivePrice !== undefined) {
            roomRates[roomId] = effectivePrice;
          }
        }
      }

      const uniformRateNum = bulkUniformPrice.replace(/\D/g, "")
        ? Number(bulkUniformPrice.replace(/\D/g, ""))
        : undefined;

      const formattedCheckIn = bulkCheckInDate.includes("T")
        ? bulkCheckInDate
        : `${bulkCheckInDate}T14:00:00+07:00`;
      const formattedCheckOut = bulkCheckOutDate.includes("T")
        ? bulkCheckOutDate
        : `${bulkCheckOutDate}T12:00:00+07:00`;

      // Resolve Booking Partner if new partner was typed
      let effectivePartnerId =
        bulkSourcePartnerId && bulkSourcePartnerId !== "NEW"
          ? bulkSourcePartnerId
          : null;
      if (
        bulkSourceCategory !== "DIRECT" &&
        (bulkSourcePartnerId === "NEW" || bulkIsAddingNewPartner) &&
        bulkCustomPartnerName.trim()
      ) {
        try {
          const createdPartner = await createBookingPartnerMutation.mutateAsync({
            name: bulkCustomPartnerName.trim(),
            code: generatePartnerCode(bulkCustomPartnerName.trim()),
            category: bulkSourceCategory,
            notes: "Tự động tạo từ đặt phòng đoàn",
          });
          effectivePartnerId = createdPartner.id;
        } catch (err) {
          console.error("Lỗi tự động tạo đối tác:", err);
        }
      }

      // Build Charge Lines (Nightly rates & Pre-booked extras)
      const chargeLines: Array<{
        lineType: "ROOM_NIGHT" | "EXTRA";
        serviceDate?: string;
        nameSnapshot: string;
        quantity: number;
        unitPriceSnapshot: number;
        totalSnapshot: number;
        currency: string;
      }> = [];

      if (bulkIsCustomNightlyRates && bulkNightDates.length > 0) {
        for (const d of bulkNightDates) {
          const rateForNight = bulkNightlyRates[d] ?? uniformRateNum ?? 0;
          chargeLines.push({
            lineType: "ROOM_NIGHT",
            serviceDate: `${d}T14:00:00+07:00`,
            nameSnapshot: `Tiền phòng đêm ${formatVnDateStr(d)}`,
            quantity: 1,
            unitPriceSnapshot: rateForNight,
            totalSnapshot: rateForNight,
            currency: "VND",
          });
        }
      }

      for (const s of bulkPrebookedServices) {
        if (s.name.trim() && s.unitPrice >= 0 && s.quantity > 0) {
          chargeLines.push({
            lineType: "EXTRA",
            nameSnapshot: s.name.trim(),
            quantity: s.quantity,
            unitPriceSnapshot: s.unitPrice,
            totalSnapshot: s.total,
            currency: "VND",
          });
        }
      }

      const payload: BulkReservationInput = isAuto
        ? {
            leadGuestName: trimmedLeadName,
            checkInDate: formattedCheckIn,
            checkOutDate: formattedCheckOut,
            allocations,
            autoAssign: true,
            ...(uniformRateNum !== undefined ? { rate: uniformRateNum } : {}),
            ...(chargeLines.length > 0 ? { chargeLines } : {}),
            sourceCategory: bulkSourceCategory,
            sourcePartnerId: effectivePartnerId,
            bookingOwnerUserId: currentUser?.id || null,
          }
        : {
            leadGuestName: trimmedLeadName,
            checkInDate: formattedCheckIn,
            checkOutDate: formattedCheckOut,
            roomIds: Array.from(bulkSelectedRoomIds),
            roomRates,
            ...(uniformRateNum !== undefined ? { rate: uniformRateNum } : {}),
            ...(chargeLines.length > 0 ? { chargeLines } : {}),
            sourceCategory: bulkSourceCategory,
            sourcePartnerId: effectivePartnerId,
            bookingOwnerUserId: currentUser?.id || null,
          };

      const result = await bulkReservationsMutation.mutateAsync(payload);

      setIsBulkModalOpen(false);
      setBulkSelectedRoomIds(new Set());
      setBulkConflictRoomIds(new Set());
      setBulkRoomTypeCounts({});
      setBulkRoomCustomPrices({});
      setBulkRoomTypeCustomPrices({});
      setBulkUniformPrice("");
      setBulkLeadName("");
      setBulkSourceCategory("DIRECT");
      setBulkSourcePartnerId("");
      setBulkCustomPartnerName("");
      setBulkIsAddingNewPartner(false);
      setBulkNightlyRates({});
      setBulkIsCustomNightlyRates(false);
      setBulkPrebookedServices([]);

      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      void refetch();

      await SwalVietSage.fire({
        icon: "success",
        title: "Tạo đặt trước thành công!",
        html: `
          <div style="font-size:14px;color:#334155;display:flex;flex-direction:column;gap:14px;margin-top:2px;">
            <p style="margin:0;text-align:center;color:#475569;font-size:14px;line-height:1.5;">
              Đã tạo thành công <strong>${result.reservations.length}</strong> đặt phòng${trimmedLeadName ? ` cho đoàn <strong>${trimmedLeadName}</strong>` : ""}.
            </p>
            <div style="padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
              <div style="text-align:left;">
                <span style="font-size:12px;color:#64748b;font-weight:500;display:block;margin-bottom:2px;">Mã đoàn</span>
                <strong style="font-size:16px;color:#0f172a;letter-spacing:0.5px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">${result.groupCode}</strong>
              </div>
              <button id="swal-btn-copy-bulk-code" type="button" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;background:#ffffff;border:1px solid #cbd5e1;color:#1e293b;font-weight:600;font-size:12px;cursor:pointer;transition:all 0.15s ease;box-shadow:0 1px 2px rgba(0,0,0,0.05);white-space:nowrap;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                <span id="swal-copy-label">Sao chép</span>
              </button>
            </div>
            <button id="swal-btn-print-bulk-voucher" type="button" style="display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:10px 16px;border-radius:12px;background:#1e3a8a;color:#ffffff;font-weight:700;font-size:13px;cursor:pointer;border:none;box-shadow:0 1px 3px rgba(0,0,0,0.1);transition:background 0.15s ease;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="14" y="14"/></svg>
              <span>In / Tải phiếu xác nhận đoàn</span>
            </button>
          </div>
        `,
        showConfirmButton: true,
        confirmButtonText: "Hoàn tất",
        didOpen: () => {
          const btn = document.getElementById("swal-btn-copy-bulk-code");
          const label = document.getElementById("swal-copy-label");
          if (btn) {
            btn.addEventListener("click", () => {
              void navigator.clipboard.writeText(result.groupCode);
              if (label) label.innerText = "Đã sao chép";
              btn.style.borderColor = "#86efac";
              btn.style.color = "#166534";
              btn.style.backgroundColor = "#f0fdf4";
              setTimeout(() => {
                if (label) label.innerText = "Sao chép";
                btn.style.borderColor = "#cbd5e1";
                btn.style.color = "#1e293b";
                btn.style.backgroundColor = "#ffffff";
              }, 2000);
            });
          }

          const printBtn = document.getElementById("swal-btn-print-bulk-voucher");
          if (printBtn) {
            printBtn.addEventListener("click", () => {
              SwalVietSage.close();
              setConfirmationModalState({
                isOpen: true,
                mode: "group",
                groupCode: result.groupCode,
              });
            });
          }
        },
      });
    } catch (err: unknown) {
      const errorObj = err as {
        status?: number;
        data?: {
          code?: string;
          detail?: string;
          message?: string;
          unavailableRoomIds?: string[];
          conflictRoomIds?: string[];
          roomIds?: string[];
        };
        message?: string;
      };

      if (
        errorObj?.status === 409 ||
        errorObj?.data?.code === "BULK_RESERVATION_CONFLICT"
      ) {
        const rawUnavailable =
          errorObj.data?.unavailableRoomIds ||
          errorObj.data?.conflictRoomIds ||
          errorObj.data?.roomIds ||
          [];
        const conflictSet = new Set(
          Array.isArray(rawUnavailable) ? rawUnavailable : [],
        );
        setBulkConflictRoomIds(conflictSet);

        const conflictRoomNames = Array.from(conflictSet)
          .map((id) => {
            const found = roomPoolMap.get(id) || rooms.find((r) => r.id === id);
            if (found?.roomNumber) {
              return `P.${found.roomNumber}`;
            }
            if (/^\d+[A-Za-z]?$/.test(id)) {
              return `P.${id}`;
            }
            return null;
          })
          .filter((name): name is string => Boolean(name));

        let conflictDetailMsg = "";
        if (conflictRoomNames.length > 0) {
          conflictDetailMsg = `Các phòng sau đã có lịch đặt hoặc không khả dụng trong khoảng thời gian này: <strong>${conflictRoomNames.join(", ")}</strong>.`;
        } else {
          const rawMsg =
            errorObj.data?.detail ||
            errorObj.data?.message ||
            errorObj.message;
          if (
            !rawMsg ||
            rawMsg === "BULK_RESERVATION_CONFLICT" ||
            rawMsg === "ROOM_RESERVATION_OVERLAP" ||
            rawMsg === "ROOM_NOT_AVAILABLE"
          ) {
            conflictDetailMsg =
              "Một số phòng đã chọn bị trùng lịch đặt hoặc không khả dụng trong khoảng thời gian này.";
          } else {
            conflictDetailMsg = rawMsg;
          }
        }

        await SwalVietSage.fire({
          icon: "warning",
          title: "Xung đột lịch đặt phòng",
          html: `
            <div style="text-align:left;font-size:14px;color:#334155;line-height:1.6;">
              <p style="margin:0;">${conflictDetailMsg}</p>
            </div>
          `,
          confirmButtonText: "Đã hiểu",
        });
      } else {
        const msg =
          errorObj?.data?.detail ||
          errorObj?.data?.message ||
          errorObj?.message ||
          "Không thể tạo đặt phòng hàng loạt. Vui lòng kiểm tra lại.";
        await showErrorAlert("Lỗi đặt phòng", msg);
      }
    }
  }

  function handleReservationNightlyRateChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const input = e.target;
    const rawValue = input.value;
    const selectionStart = input.selectionStart ?? rawValue.length;

    const digitsBeforeCursor = rawValue
      .slice(0, selectionStart)
      .replace(/\D/g, "").length;
    const rawDigits = rawValue.replace(/\D/g, "");
    setReservationNightlyRate(rawDigits);

    const formatted = rawDigits
      ? new Intl.NumberFormat("vi-VN").format(Number(rawDigits))
      : "";

    requestAnimationFrame(() => {
      if (reservationPriceInputRef.current) {
        let count = 0;
        let newCursor = 0;
        if (digitsBeforeCursor === 0) {
          newCursor = 0;
        } else {
          for (let i = 0; i < formatted.length; i++) {
            if (/\d/.test(formatted[i])) count++;
            if (count === digitsBeforeCursor) {
              newCursor = i + 1;
              break;
            }
          }
        }
        reservationPriceInputRef.current.setSelectionRange(
          newCursor,
          newCursor,
        );
      }
    });
  }

  function handleReservationPriceKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (e.key === "Backspace") {
      const input = e.currentTarget;
      const start = input.selectionStart;
      const end = input.selectionEnd;
      if (start !== null && start === end && start > 0) {
        if (input.value[start - 1] === ".") {
          e.preventDefault();
          const before = input.value.slice(0, start - 2);
          const after = input.value.slice(start);
          const newRaw = before + after;
          const rawDigits = newRaw.replace(/\D/g, "");
          setReservationNightlyRate(rawDigits);
          const formatted = rawDigits
            ? new Intl.NumberFormat("vi-VN").format(Number(rawDigits))
            : "";
          const digitsBefore = before.replace(/\D/g, "").length;
          requestAnimationFrame(() => {
            if (reservationPriceInputRef.current) {
              let count = 0;
              let newCursor = 0;
              if (digitsBefore === 0) {
                newCursor = 0;
              } else {
                for (let i = 0; i < formatted.length; i++) {
                  if (/\d/.test(formatted[i])) count++;
                  if (count === digitsBefore) {
                    newCursor = i + 1;
                    break;
                  }
                }
              }
              reservationPriceInputRef.current.setSelectionRange(
                newCursor,
                newCursor,
              );
            }
          });
        }
      }
    }
  }

  const { todayArrivalByRoomId, upcomingArrivalByRoomId } = useMemo(() => {
    const todayMap = new Map<string, HotelArrival>();
    const upcomingMap = new Map<string, HotelArrival>();

    const sorted = [...arrivalsList].sort(
      (a, b) =>
        new Date(a.plannedCheckInAt).getTime() -
        new Date(b.plannedCheckInAt).getTime(),
    );

    const activeTargetDate = businessDate || todayYmd;

    for (const arr of sorted) {
      if (!arr.roomId || arr.status === "CHECKED_IN") continue;
      const checkInYmd = arr.plannedCheckInAt
        ? arr.plannedCheckInAt.slice(0, 10)
        : "";
      const checkOutYmd = arr.plannedCheckOutAt
        ? arr.plannedCheckOutAt.slice(0, 10)
        : "";

      const isForActiveDate = Boolean(
        checkInYmd &&
        checkOutYmd &&
        checkInYmd <= activeTargetDate &&
        checkOutYmd >= activeTargetDate,
      );

      if (isForActiveDate) {
        if (!todayMap.has(arr.roomId)) {
          todayMap.set(arr.roomId, arr);
        }
      } else if (checkInYmd && checkInYmd > activeTargetDate) {
        if (!upcomingMap.has(arr.roomId)) {
          upcomingMap.set(arr.roomId, arr);
        }
      }
    }

    return {
      todayArrivalByRoomId: todayMap,
      upcomingArrivalByRoomId: upcomingMap,
    };
  }, [arrivalsList, businessDate, todayYmd]);

  function getRoomReservationDetails(room: HotelRoomSummary) {
    const todayArrival = todayArrivalByRoomId.get(room.id);
    const upcomingArrival = upcomingArrivalByRoomId.get(room.id);

    if (room.projectedReservation) {
      return {
        isReservedToday: true,
        isUpcoming: false,
        arrival: todayArrival ?? null,
        guestDisplayName: room.projectedReservation.guestDisplayName,
        guestPhone: room.projectedReservation.guestPhone,
        reservationCode: room.projectedReservation.reservationCode,
        plannedCheckInAt: room.projectedReservation.plannedCheckInAt,
        plannedCheckOutAt: room.projectedReservation.plannedCheckOutAt,
        status: room.projectedReservation.status,
      };
    }

    if (todayArrival) {
      return {
        isReservedToday: true,
        isUpcoming: false,
        arrival: todayArrival,
        guestDisplayName: todayArrival.guestDisplayName,
        guestPhone: todayArrival.guestPhone,
        reservationCode: todayArrival.reservationCode,
        plannedCheckInAt: todayArrival.plannedCheckInAt,
        plannedCheckOutAt: todayArrival.plannedCheckOutAt,
        status: todayArrival.status,
      };
    }

    if (room.upcomingReservation) {
      const isUpToday =
        room.upcomingReservation.plannedCheckInAt?.slice(0, 10) ===
        (businessDate || todayYmd);
      return {
        isReservedToday: isUpToday,
        isUpcoming: !isUpToday,
        arrival: null,
        guestDisplayName: room.upcomingReservation.guestDisplayName,
        guestPhone: room.upcomingReservation.guestPhone,
        reservationCode: room.upcomingReservation.reservationCode,
        plannedCheckInAt: room.upcomingReservation.plannedCheckInAt,
        plannedCheckOutAt: room.upcomingReservation.plannedCheckOutAt,
        status: room.upcomingReservation.status,
      };
    }

    if (upcomingArrival) {
      return {
        isReservedToday: false,
        isUpcoming: true,
        arrival: upcomingArrival,
        guestDisplayName: upcomingArrival.guestDisplayName,
        guestPhone: upcomingArrival.guestPhone,
        reservationCode: upcomingArrival.reservationCode,
        plannedCheckInAt: upcomingArrival.plannedCheckInAt,
        plannedCheckOutAt: upcomingArrival.plannedCheckOutAt,
        status: upcomingArrival.status,
      };
    }

    return null;
  }

  const rawFilteredRooms =
    status !== "all"
      ? rooms.filter((r) => getEffectiveRoomStatus(r, isFutureDate) === status)
      : rooms;

  const filteredRooms =
    zone !== "all"
      ? rawFilteredRooms.filter(
          (r) => String((r as any).zone || "").trim() === zone,
        )
      : rawFilteredRooms;

  async function confirmRoomReady(room: HotelRoomSummary) {
    const roomNum = getRoomNumber(room);
    const confirmation = await showConfirmDialog({
      icon: "question",
      title: `Xác nhận phòng ${roomNum} đã sẵn sàng?`,
      text: "Xác nhận phòng đã được dọn dẹp sạch sẽ và sẵn sàng đón khách mới.",
      confirmText: "Xác nhận sẵn sàng",
      cancelText: "Hủy",
    });

    if (!confirmation.isConfirmed) return;

    try {
      await requestInternalApiEnvelope(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/rooms/${encodeURIComponent(room.id)}/ready`,
        {
          method: "PATCH",
          body: { expectedUpdatedAt: room.updatedAt },
        },
      );
      await showSuccessAlert(
        `Phòng ${roomNum} đã sẵn sàng!`,
        "Trạng thái phòng đã chuyển thành TRỐNG.",
      );
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      void refetch();
    } catch (error) {
      await showErrorAlert(
        "Không thể cập nhật trạng thái phòng",
        error instanceof Error ? error.message : "Vui lòng thử lại.",
      );
    }
  }

  let reservationConflict: { room: HotelRoomSummary; message: string } | null =
    null;
  if (
    isReservationOpen &&
    reservationRoomId &&
    reservationCheckIn &&
    reservationCheckOut
  ) {
    const checkInTime = new Date(reservationCheckIn).getTime();
    const checkOutTime = new Date(reservationCheckOut).getTime();
    if (
      !isNaN(checkInTime) &&
      !isNaN(checkOutTime) &&
      checkOutTime > checkInTime
    ) {
      const room = rooms.find((r) => r.id === reservationRoomId);
      if (room) {
        if (
          room.activeStay &&
          !room.activeStay.checkedOutAt &&
          room.activeStay.plannedCheckOutAt
        ) {
          const stayEnd = new Date(room.activeStay.plannedCheckOutAt).getTime();
          const stayStart = room.activeStay.checkedInAt
            ? new Date(room.activeStay.checkedInAt).getTime()
            : room.activeStay.plannedCheckInAt
              ? new Date(room.activeStay.plannedCheckInAt).getTime()
              : 0;
          if (stayStart < checkOutTime && stayEnd > checkInTime) {
            reservationConflict = {
              room,
              message: `Phòng ${getRoomNumber(room)} đang có khách lưu trú (${room.activeStay.guestDisplayName}) với hạn trả phòng đến ${formatDateTime(room.activeStay.plannedCheckOutAt)}.`,
            };
          }
        }

        if (
          !reservationConflict &&
          room.projectedReservation?.plannedCheckInAt &&
          room.projectedReservation?.plannedCheckOutAt
        ) {
          const resStart = new Date(
            room.projectedReservation.plannedCheckInAt,
          ).getTime();
          const resEnd = new Date(
            room.projectedReservation.plannedCheckOutAt,
          ).getTime();
          if (resStart < checkOutTime && resEnd > checkInTime) {
            reservationConflict = {
              room,
              message: `Phòng ${getRoomNumber(room)} đã có khách đặt trước (${room.projectedReservation.guestDisplayName}) từ ${formatDateTime(room.projectedReservation.plannedCheckInAt)} đến ${formatDateTime(room.projectedReservation.plannedCheckOutAt)}.`,
            };
          }
        }

        if (
          !reservationConflict &&
          room.upcomingReservation?.plannedCheckInAt &&
          room.upcomingReservation?.plannedCheckOutAt
        ) {
          const resStart = new Date(
            room.upcomingReservation.plannedCheckInAt,
          ).getTime();
          const resEnd = new Date(
            room.upcomingReservation.plannedCheckOutAt,
          ).getTime();
          if (resStart < checkOutTime && resEnd > checkInTime) {
            reservationConflict = {
              room,
              message: `Phòng ${getRoomNumber(room)} đã có lịch đặt trước sắp tới (${room.upcomingReservation.guestDisplayName}) từ ${formatDateTime(room.upcomingReservation.plannedCheckInAt)} đến ${formatDateTime(room.upcomingReservation.plannedCheckOutAt)}.`,
            };
          }
        }

        if (!reservationConflict) {
          for (const arr of arrivalsList) {
            if (arr.roomId === room.id && arr.status !== "CHECKED_IN") {
              const arrStart = new Date(arr.plannedCheckInAt).getTime();
              const arrEnd = new Date(arr.plannedCheckOutAt).getTime();
              if (arrStart < checkOutTime && arrEnd > checkInTime) {
                reservationConflict = {
                  room,
                  message: `Phòng ${getRoomNumber(room)} đã có khách đặt trước (${arr.guestDisplayName}) từ ${formatDateTime(arr.plannedCheckInAt)} đến ${formatDateTime(arr.plannedCheckOutAt)}.`,
                };
                break;
              }
            }
          }
        }

        if (!reservationConflict) {
          const roomNum = getRoomNumber(room).toUpperCase();
          for (const ota of otaBookings) {
            if (
              ota.roomNumber?.trim().toUpperCase() === roomNum &&
              ota.status !== "CANCELLED" &&
              ota.checkInDate &&
              ota.checkOutDate
            ) {
              const otaStart = new Date(
                `${ota.checkInDate}T14:00:00`,
              ).getTime();
              const otaEnd = new Date(`${ota.checkOutDate}T12:00:00`).getTime();
              if (otaStart < checkOutTime && otaEnd > checkInTime) {
                reservationConflict = {
                  room,
                  message: `Phòng ${getRoomNumber(room)} đã có lịch nhận phòng OTA ${ota.otaName} (${ota.guestName}) từ ${ota.checkInDate} đến ${ota.checkOutDate}.`,
                };
                break;
              }
            }
          }
        }
      }
    }
  }

  const suggestedAlternativeRooms: HotelRoomSummary[] =
    reservationConflict &&
    isReservationOpen &&
    reservationCheckIn &&
    reservationCheckOut
      ? rooms
          .filter((r) => {
            if (r.id === reservationRoomId) return false;
            if (r.status === "MAINTENANCE" || r.status === "BLOCKED")
              return false;
            return !isRoomConflictingForDates(
              r,
              reservationCheckIn,
              reservationCheckOut,
            );
          })
          .sort((a, b) => {
            const targetType = reservationConflict?.room.type;
            const aSame = a.type === targetType ? 1 : 0;
            const bSame = b.type === targetType ? 1 : 0;
            if (aSame !== bSame) return bSame - aSame;
            return getRoomNumber(a).localeCompare(getRoomNumber(b), undefined, {
              numeric: true,
            });
          })
          .slice(0, 5)
      : [];

  const totalItems =
    roomsPage?.total ??
    roomsPage?.totalItems ??
    initialRoomsPage.total ??
    rooms.length;
  const totalPages =
    roomsPage?.totalPages ?? Math.max(1, Math.ceil(totalItems / pageSize));

  const currentByStatus = useMemo(() => {
    return {
      available:
        roomsPage?.byStatus?.available ??
        initialRoomsPage.byStatus?.available ??
        0,
      occupied:
        roomsPage?.byStatus?.occupied ??
        initialRoomsPage.byStatus?.occupied ??
        0,
      processing:
        roomsPage?.byStatus?.processing ??
        initialRoomsPage.byStatus?.processing ??
        0,
      maintenance:
        roomsPage?.byStatus?.maintenance ??
        initialRoomsPage.byStatus?.maintenance ??
        0,
    };
  }, [roomsPage?.byStatus, initialRoomsPage.byStatus]);

  function printActiveStayList() {
    const printedAt = new Date();
    const midnight = new Date(printedAt);
    midnight.setHours(0, 0, 0, 0);
    const activeStays = rooms
      .map((room) => ({ room, stay: room.activeStay }))
      .filter(({ stay }) => {
        if (!stay || stay.checkedOutAt) return false;
        const checkedInAt = new Date(
          stay.checkedInAt ?? stay.plannedCheckInAt ?? stay.createdAt ?? 0,
        );
        return checkedInAt >= midnight && checkedInAt <= printedAt;
      });
    const popup = window.open("", "vietsage-stay-list");
    if (!popup) return;
    const rows = activeStays
      .flatMap(({ room, stay }) => {
        const cccd = stay?.guestIdentityNumber || "chưa có";
        const dob = stay?.guestDateOfBirth || "chưa có";
        const gender = stay?.guestGender || "chưa có";
        const nationality = stay?.guestNationality || "chưa có";
        const address = stay?.guestResidencePlace || "chưa có";
        const phone = stay?.guestPhone || "chưa có";
        const checkIn = formatDateTime(
          stay?.checkedInAt ?? stay?.plannedCheckInAt,
        );

        const primaryRow = `<tr><td><strong>${getRoomNumber(room)}</strong></td><td><strong>${stay?.guestDisplayName ?? "chưa có"}</strong> <span style="font-size:11px;color:#0284c7;font-weight:600">(Đại diện)</span></td><td>${cccd}</td><td>${dob}</td><td>${gender}</td><td>${nationality}</td><td>${address}</td><td>${phone}</td><td>${checkIn}</td></tr>`;

        const extraOccupants = filterExtraOccupants(stay?.occupants, stay);
        const occupantRows = extraOccupants.map((occ) => {
          const occCccd = occ.identityNumber || "chưa có";
          const occDob = occ.dateOfBirth || "chưa có";
          const occGender = occ.gender || "chưa có";
          const occNationality = occ.nationality || "chưa có";
          const occAddress = occ.residencePlace || "chưa có";
          const occPhone = occ.phone || "chưa có";
          return `<tr><td style="color:#64748b;font-size:12px">↳ ${getRoomNumber(room)}</td><td>${occ.fullName} <span style="font-size:11px;color:#475569">(Ở cùng)</span></td><td>${occCccd}</td><td>${occDob}</td><td>${occGender}</td><td>${occNationality}</td><td>${occAddress}</td><td>${occPhone}</td><td>${checkIn}</td></tr>`;
        });

        return [primaryRow, ...occupantRows];
      })
      .join("");
    popup.document.write(
      `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Danh sách lưu trú</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#17201b}h1{margin:0 0 8px}p{color:#5d6a61}table{border-collapse:collapse;width:100%;margin-top:24px}th,td{border:1px solid #cbd5ce;padding:9px;text-align:left;font-size:13px}th{background:#eef3ee}</style></head><body><h1>Danh sách khách đang lưu trú</h1><p>Khách sạn ${hotelId} · In lúc ${formatDateTime(printedAt.toISOString())}</p><table><thead><tr><th>Phòng</th><th>Họ tên</th><th>Số CCCD</th><th>Ngày sinh</th><th>Giới tính</th><th>Quốc tịch</th><th>Địa chỉ</th><th>Số điện thoại</th><th>Nhận phòng</th></tr></thead><tbody>${rows || '<tr><td colspan="9">Không có khách lưu trú từ 0h hôm nay đến thời điểm in.</td></tr>'}</tbody></table><script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}</script></body></html>`,
    );
    popup.document.close();
  }

  function handleCheckInReservationGeneric(
    room: HotelRoomSummary,
    res: {
      guestDisplayName: string;
      guestPhone?: string | null;
      plannedCheckOutAt: string;
      reservationCode?: string;
      arrival?: HotelArrival | null;
    },
  ) {
    if (!canCheckInStay) return;
    const reservationId =
      res.arrival?.id ||
      room.projectedReservation?.id ||
      room.upcomingReservation?.id ||
      "";
    setSelectedRoom(room);
    setActiveReservationCheckIn({
      reservationId,
      guestDisplayName: res.guestDisplayName,
      roomId: res.arrival?.roomId ?? room.id,
      updatedAt: res.arrival?.updatedAt,
    });
    setCustomCheckInInitialFields({
      guestDisplayName: res.guestDisplayName,
      guestPhone: res.guestPhone || "",
      plannedCheckOutAt: res.plannedCheckOutAt,
      reservationCode: res.reservationCode,
      plannedCheckInAt: res.arrival?.plannedCheckInAt,
      notes: res.arrival?.notes ?? undefined,
    });
    setSubmitError(undefined);
    setIsArrivalsOpen(false);
    setIsCheckInOpen(true);
  }

  function openWalkIn(room: HotelRoomSummary) {
    if (!isAvailable(room) || !canManageStays) return;

    // Collision Guard: if room is reserved today, alert receptionist immediately
    const conflictRes = getRoomReservationDetails(room);
    if (conflictRes?.isReservedToday) {
      const guestName = conflictRes.guestDisplayName;
      const checkInTime = formatDateTime(conflictRes.plannedCheckInAt);
      void showConfirmDialog({
        icon: "warning",
        title: `Phòng ${getRoomNumber(room)} đã có khách đặt trước!`,
        html: `
          <div class="w-full text-left space-y-3 font-sans pt-1">
            <div class="rounded-2xl border border-amber-200/90 bg-amber-50/70 p-3.5 sm:p-4 space-y-2.5 shadow-2xs">
              <div class="flex items-center justify-between text-xs">
                <span class="font-semibold text-amber-800">Phòng thao tác</span>
                <span class="px-2.5 py-0.5 rounded-lg bg-white border border-amber-300 text-amber-900 font-bold text-xs sm:text-sm">Phòng ${escapeHtml(getRoomNumber(room))}</span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="font-semibold text-amber-800">Khách đã đặt trước</span>
                <strong class="text-slate-900 text-sm font-bold truncate max-w-[200px]">${escapeHtml(guestName)}</strong>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="font-semibold text-amber-800">Giờ nhận dự kiến</span>
                <span class="font-bold text-slate-700 text-xs sm:text-sm">${escapeHtml(checkInTime)}</span>
              </div>
            </div>
            <p class="text-xs text-slate-600 text-pretty">
              Phòng này đã có đơn giữ chỗ trong hôm nay. Bạn có muốn làm thủ tục nhận phòng cho khách đặt trước này không?
            </p>
          </div>
        `,
        confirmText: `Nhận phòng cho ${guestName}`,
        cancelText: "Hủy bỏ",
      }).then((confirmation) => {
        if (confirmation.isConfirmed) {
          if (conflictRes.arrival) {
            handleCheckInArrival(conflictRes.arrival);
          } else {
            handleCheckInReservationGeneric(room, conflictRes);
          }
        }
      });
      return;
    }

    setActiveReservationCheckIn(null);
    setCustomCheckInInitialFields(null);
    setSelectedRoom(room);
    setSubmitError(undefined);
    setIsCheckInOpen(true);
  }

  async function toggleRoomBlocked(room: HotelRoomSummary) {
    const isBlocked = getRoomStatus(room) === "blocked";
    const confirmation = await showConfirmDialog({
      icon: isBlocked ? "question" : "warning",
      title: isBlocked
        ? `Mở khóa phòng ${getRoomNumber(room)}?`
        : `Khóa phòng ${getRoomNumber(room)}?`,
      text: isBlocked
        ? "Phòng sẽ trở lại trạng thái TRỐNG và có thể được sử dụng."
        : "Phòng sẽ không thể được đặt, gán đặt phòng hoặc nhận phòng cho đến khi mở khóa.",
      confirmText: isBlocked ? "Mở khóa phòng" : "Khóa phòng",
      cancelText: "Hủy",
    });

    if (!confirmation.isConfirmed) return;

    try {
      await requestInternalApiEnvelope(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/rooms/${encodeURIComponent(room.id)}/status`,
        {
          method: "PATCH",
          body: {
            status: isBlocked ? "AVAILABLE" : "BLOCKED",
            expectedUpdatedAt: room.updatedAt,
          },
        },
      );
      await showSuccessAlert(
        isBlocked ? "Đã mở khóa phòng" : "Đã khóa phòng",
        isBlocked
          ? "Phòng đã trở lại trạng thái khả dụng."
          : "Phòng đã được khóa an toàn.",
      );
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      void refetch();
    } catch (error) {
      await showErrorAlert(
        "Không thể cập nhật trạng thái phòng",
        error instanceof Error ? error.message : "Vui lòng thử lại.",
      );
    }
  }

  async function updateRoomStatus(
    room: HotelRoomSummary,
    targetStatus: "AVAILABLE" | "PROCESSING" | "MAINTENANCE" | "BLOCKED",
  ) {
    const labels: Record<string, string> = {
      AVAILABLE: "TRỐNG",
      PROCESSING: "CHỜ DỌN",
      MAINTENANCE: "BẢO TRÌ",
      BLOCKED: "ĐÃ KHÓA",
    };
    const roomNum = getRoomNumber(room);
    const confirmation = await showConfirmDialog({
      icon: "question",
      title: `Chuyển phòng ${roomNum} sang ${labels[targetStatus]}?`,
      text: `Xác nhận cập nhật trạng thái phòng ${roomNum}.`,
      confirmText: "Xác nhận chuyển",
      cancelText: "Hủy",
    });

    if (!confirmation.isConfirmed) return;

    try {
      await requestInternalApiEnvelope(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/rooms/${encodeURIComponent(room.id)}/status`,
        {
          method: "PATCH",
          body: { status: targetStatus, expectedUpdatedAt: room.updatedAt },
        },
      );
      await showSuccessAlert(
        `Phòng ${roomNum} đã chuyển sang ${labels[targetStatus]}!`,
        "Cập nhật trạng thái thành công.",
      );
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      void refetch();
    } catch (error) {
      await showErrorAlert(
        "Không thể cập nhật trạng thái phòng",
        error instanceof Error ? error.message : "Vui lòng thử lại.",
      );
    }
  }

  async function handleProcessingRoomClick(room: HotelRoomSummary) {
    const roomNum = getRoomNumber(room);
    await SwalVietSage.fire({
      title: `Cập nhật trạng thái phòng ${roomNum}`,
      html: `
        <div style="font-size:14px;color:#475569;margin-bottom:14px;text-align:center;">Phòng <strong>${roomNum}</strong> đang ở trạng thái <strong>Chờ dọn dẹp</strong>. Chọn thao tác:</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button id="swal-btn-available" style="padding:10px 16px;border-radius:10px;background:#059669;color:#ffffff;font-weight:600;font-size:13px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.15s ease;">
            Đã dọn xong (Chuyển sang Trống)
          </button>
          ${
            canCheckInStay || canManageStays
              ? `
          <button id="swal-btn-ready-checkin" style="padding:10px 16px;border-radius:10px;background:#ffffff;border:1px solid #cbd5e1;color:#1e293b;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s ease;">
            Xác nhận sạch & mở nhận phòng ngay
          </button>
          `
              : ""
          }
          <button id="swal-btn-maintenance" style="padding:10px 16px;border-radius:10px;background:#ffffff;border:1px solid #cbd5e1;color:#1e293b;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s ease;">
            Chuyển sang bảo trì
          </button>
          ${
            canManageRooms
              ? `
          <button id="swal-btn-blocked" style="padding:10px 16px;border-radius:10px;background:#ffffff;border:1px solid #fecaca;color:#b91c1c;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s ease;">
            Khóa phòng tạm thời
          </button>
          `
              : ""
          }
        </div>
      `,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: "Đóng",
      didOpen: () => {
        const btnAvailable = document.getElementById("swal-btn-available");
        const btnReadyCheckIn = document.getElementById(
          "swal-btn-ready-checkin",
        );
        const btnMaintenance = document.getElementById("swal-btn-maintenance");
        const btnBlocked = document.getElementById("swal-btn-blocked");

        btnAvailable?.addEventListener("click", () => {
          SwalVietSage.close();
          void confirmRoomReady(room);
        });
        btnReadyCheckIn?.addEventListener("click", async () => {
          SwalVietSage.close();
          try {
            await requestInternalApiEnvelope(
              `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/rooms/${encodeURIComponent(room.id)}/ready`,
              {
                method: "PATCH",
                body: { expectedUpdatedAt: room.updatedAt },
              },
            );
            await invalidateHotelRealtimeQueries(queryClient, hotelId);
            void refetch();
            setAvailableRoomChoice({ ...room, status: "AVAILABLE" });
          } catch (error) {
            await showErrorAlert(
              "Không thể cập nhật trạng thái phòng",
              error instanceof Error ? error.message : "Vui lòng thử lại.",
            );
          }
        });
        btnMaintenance?.addEventListener("click", () => {
          SwalVietSage.close();
          void updateRoomStatus(room, "MAINTENANCE");
        });
        btnBlocked?.addEventListener("click", () => {
          SwalVietSage.close();
          void toggleRoomBlocked(room);
        });
      },
    });
  }

  async function handleBlockedRoomClick(room: HotelRoomSummary) {
    const roomNum = getRoomNumber(room);
    await SwalVietSage.fire({
      title: `Cập nhật trạng thái phòng ${roomNum}`,
      html: `
        <div style="font-size:14px;color:#475569;margin-bottom:14px;text-align:center;">Phòng <strong>${roomNum}</strong> đang ở trạng thái <strong>Đã khóa</strong>. Chọn thao tác:</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button id="swal-btn-available" style="padding:10px 16px;border-radius:10px;background:#059669;color:#ffffff;font-weight:600;font-size:13px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.15s ease;">
            Mở khóa phòng (Chuyển sang Trống)
          </button>
          <button id="swal-btn-maintenance" style="padding:10px 16px;border-radius:10px;background:#ffffff;border:1px solid #cbd5e1;color:#1e293b;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s ease;">
            Chuyển sang bảo trì
          </button>
          <button id="swal-btn-processing" style="padding:10px 16px;border-radius:10px;background:#ffffff;border:1px solid #cbd5e1;color:#1e293b;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s ease;">
            Chuyển sang chờ dọn dẹp
          </button>
        </div>
      `,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: "Đóng",
      didOpen: () => {
        const btnAvailable = document.getElementById("swal-btn-available");
        const btnMaintenance = document.getElementById("swal-btn-maintenance");
        const btnProcessing = document.getElementById("swal-btn-processing");

        btnAvailable?.addEventListener("click", () => {
          SwalVietSage.close();
          void updateRoomStatus(room, "AVAILABLE");
        });
        btnMaintenance?.addEventListener("click", () => {
          SwalVietSage.close();
          void updateRoomStatus(room, "MAINTENANCE");
        });
        btnProcessing?.addEventListener("click", () => {
          SwalVietSage.close();
          void updateRoomStatus(room, "PROCESSING");
        });
      },
    });
  }

  async function handleMaintenanceRoomClick(room: HotelRoomSummary) {
    const roomNum = getRoomNumber(room);
    await SwalVietSage.fire({
      title: `Cập nhật trạng thái phòng ${roomNum}`,
      html: `
        <div style="font-size:14px;color:#475569;margin-bottom:14px;text-align:center;">Phòng <strong>${roomNum}</strong> đang ở trạng thái <strong>Bảo trì</strong>. Chọn thao tác:</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button id="swal-btn-available" style="padding:10px 16px;border-radius:10px;background:#059669;color:#ffffff;font-weight:600;font-size:13px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.15s ease;">
            Hoàn thành bảo trì (Chuyển sang Trống)
          </button>
          ${
            canManageRooms
              ? `
          <button id="swal-btn-blocked" style="padding:10px 16px;border-radius:10px;background:#ffffff;border:1px solid #fecaca;color:#b91c1c;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s ease;">
            Khóa phòng tạm thời
          </button>
          `
              : ""
          }
          <button id="swal-btn-processing" style="padding:10px 16px;border-radius:10px;background:#ffffff;border:1px solid #cbd5e1;color:#1e293b;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s ease;">
            Chuyển sang chờ dọn dẹp
          </button>
        </div>
      `,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: "Đóng",
      didOpen: () => {
        const btnAvailable = document.getElementById("swal-btn-available");
        const btnBlocked = document.getElementById("swal-btn-blocked");
        const btnProcessing = document.getElementById("swal-btn-processing");

        btnAvailable?.addEventListener("click", () => {
          SwalVietSage.close();
          void updateRoomStatus(room, "AVAILABLE");
        });
        btnBlocked?.addEventListener("click", () => {
          SwalVietSage.close();
          void updateRoomStatus(room, "BLOCKED");
        });
        btnProcessing?.addEventListener("click", () => {
          SwalVietSage.close();
          void updateRoomStatus(room, "PROCESSING");
        });
      },
    });
  }

  async function handleExtendStayModal(room: HotelRoomSummary) {
    const stay = room.activeStay;
    if (!stay?.id) return;
    const roomNum = getRoomNumber(room);
    const defaultNewCheckOut = localDateTime(1, 12);

    const { value: newCheckOut } = await SwalVietSage.fire({
      title: `Gia hạn lưu trú phòng ${roomNum}`,
      html: `
        <div style="font-size:14px;color:#475569;margin-bottom:12px;text-align:left">
          Khách: <strong>${stay.guestDisplayName || "Chưa rõ"}</strong><br/>
          Thời gian trả phòng cũ: <span style="color:#dc2626;font-weight:700">${formatDateTime(stay.plannedCheckOutAt)}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;text-align:left">
          <label style="font-size:13px;font-weight:700;color:#334155">Thời gian trả phòng mới:</label>
          <input id="swal-input-checkout" type="datetime-local" value="${defaultNewCheckOut}" style="padding:10px;border-radius:8px;border:1px solid #cbd5e1;font-size:14px;width:100%" />
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Xác nhận gia hạn",
      cancelButtonText: "Hủy",
      preConfirm: () => {
        const input = document.getElementById(
          "swal-input-checkout",
        ) as HTMLInputElement | null;
        if (!input || !input.value) {
          SwalVietSage.showValidationMessage(
            "Vui lòng chọn thời gian check-out mới",
          );
          return false;
        }
        return input.value;
      },
    });

    if (!newCheckOut) return;

    try {
      await requestInternalApiEnvelope(
        `${apiBase}/stays/${encodeURIComponent(stay.id)}`,
        {
          method: "PATCH",
          body: { plannedCheckOutAt: new Date(newCheckOut).toISOString() },
        },
      );
      await showSuccessAlert(
        `Đã gia hạn phòng ${roomNum}!`,
        `Thời gian check-out mới: ${formatDateTime(newCheckOut)}`,
      );
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      void refetch();
    } catch (error) {
      await showErrorAlert(
        "Không thể gia hạn phòng",
        error instanceof Error ? error.message : "Vui lòng thử lại.",
      );
    }
  }

  function handleOtaFastCheckIn(
    booking: SimulatedBookingItem,
    room: HotelRoomSummary,
  ) {
    if (!booking.reservationId) {
      void showWarningAlert(
        "Chưa liên kết Đặt phòng",
        "Đơn này chưa có mã reservationId trên hệ thống.",
      );
      return;
    }

    setSelectedRoom(room);
    setActiveReservationCheckIn({
      reservationId: booking.reservationId,
      guestDisplayName: booking.guestName,
      roomId: room.id,
    });
    setCustomCheckInInitialFields({
      guestDisplayName: booking.guestName,
      guestPhone: booking.guestPhone || "",
      plannedCheckOutAt: booking.checkOutDate || localDateTime(1, 12),
    });
    setSubmitError(undefined);
    setIsCheckInOpen(true);
  }

  const handledFlowCheckInRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || handledFlowCheckInRef.current) return;
    if (!rooms.length && !otaBookings.length) return;

    const search = window.location.search;
    if (!search.includes("flow=")) return;

    const params = new URLSearchParams(search);
    const flow = params.get("flow");
    if (flow !== "check-in") return;

    const reservationId = params.get("reservationId");
    const roomNumber = params.get("roomNumber");

    const matchingOta = reservationId
      ? otaBookings.find((b) => b.reservationId === reservationId)
      : roomNumber
        ? incomingOtaByRoomNumber.get(roomNumber.trim().toUpperCase())
        : undefined;

    const targetRoom = roomNumber
      ? rooms.find(
          (r) =>
            getRoomNumber(r).toUpperCase() === roomNumber.trim().toUpperCase(),
        )
      : reservationId
        ? rooms.find((r) => r.projectedReservation?.id === reservationId)
        : undefined;

    const timer = setTimeout(() => {
      if (matchingOta && targetRoom) {
        handledFlowCheckInRef.current = true;
        handleOtaFastCheckIn(matchingOta, targetRoom);
      } else if (targetRoom && targetRoom.projectedReservation) {
        handledFlowCheckInRef.current = true;
        setSelectedRoom(targetRoom);
        setActiveReservationCheckIn({
          reservationId: targetRoom.projectedReservation.id,
          guestDisplayName: targetRoom.projectedReservation.guestDisplayName,
          roomId: targetRoom.id,
        });
        setCustomCheckInInitialFields({
          guestDisplayName: targetRoom.projectedReservation.guestDisplayName,
          plannedCheckOutAt: targetRoom.projectedReservation.plannedCheckOutAt,
        });
        setSubmitError(undefined);
        setIsCheckInOpen(true);
      } else if (targetRoom && isAvailable(targetRoom) && canManageStays) {
        handledFlowCheckInRef.current = true;
        setActiveReservationCheckIn(null);
        setCustomCheckInInitialFields(null);
        setSelectedRoom(targetRoom);
        setSubmitError(undefined);
        setIsCheckInOpen(true);
      } else {
        handledFlowCheckInRef.current = true;
      }
    }, 0);

    const url = new URL(window.location.href);
    url.searchParams.delete("flow");
    url.searchParams.delete("reservationId");
    url.searchParams.delete("roomNumber");
    window.history.replaceState(
      {},
      "",
      url.pathname + (url.search ? url.search : ""),
    );

    return () => clearTimeout(timer);
  }, [rooms, otaBookings, incomingOtaByRoomNumber, canManageStays]);

  function handleCardClick(
    room: HotelRoomSummary,
    triggerEl?: HTMLElement | null,
  ) {
    if (isHousekeeping) {
      if (getRoomStatus(room) === "processing") {
        void confirmRoomReady(room);
      }
      return;
    }

    const effectiveStatus = getEffectiveRoomStatus(room, isFutureDate);
    const hasProjectedStay = Boolean(room.projectedStay || room.activeStay);
    const isReserved = effectiveStatus === "reserved";

    if (
      effectiveStatus === "overdue" ||
      (effectiveStatus === "occupied" && hasProjectedStay) ||
      isReserved
    ) {
      openRoomContextPanel(room, triggerEl);
      return;
    }

    if (isFutureDate) {
      const physicalStatus = getRoomStatus(room);
      const isPhysicallyBusy =
        physicalStatus === "occupied" ||
        physicalStatus === "overdue" ||
        Boolean(room.activeStay);
      if (isPhysicallyBusy) {
        openRoomContextPanel(room, triggerEl);
        return;
      }
      if (effectiveStatus === "available") {
        setAvailableRoomChoice(room);
      }
      return;
    }

    const roomStatus = getRoomStatus(room);
    if (roomStatus === "available") {
      setAvailableRoomChoice(room);
    } else if (roomStatus === "occupied") {
      setRoomQrPreview({
        room,
        guestUrl: getGuestQrUrl(room, window.location.origin),
      });
    } else if (roomStatus === "processing") {
      void handleProcessingRoomClick(room);
    } else if (roomStatus === "blocked") {
      if (canManageRooms) {
        void handleBlockedRoomClick(room);
      }
    } else if (roomStatus === "maintenance") {
      void handleMaintenanceRoomClick(room);
    }
  }

  async function submitWalkIn(fields: CheckInStayFields) {
    if (!selectedRoom) return;

    const plannedCheckOutAt = new Date(fields.plannedCheckOutAt).toISOString();
    if (isNaN(new Date(plannedCheckOutAt).getTime())) {
      setSubmitError("Thời gian trả phòng không hợp lệ.");
      return;
    }

    if (activeReservationCheckIn) {
      setSaving(true);
      setSubmitError(undefined);
      try {
        const result = await requestInternalApiEnvelope<HotelCheckInResult>(
          `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/${encodeURIComponent(activeReservationCheckIn.reservationId)}/check-in`,
          {
            method: "POST",
            body: {
              guestDisplayName: fields.guestDisplayName.trim(),
              ...(fields.guestPhone?.trim()
                ? { guestPhone: fields.guestPhone.trim() }
                : {}),
              ...(fields.guestIdentityNumber?.trim()
                ? { guestIdentityNumber: fields.guestIdentityNumber.trim() }
                : {}),
              ...(fields.guestDateOfBirth?.trim()
                ? { guestDateOfBirth: fields.guestDateOfBirth.trim() }
                : {}),
              ...(fields.guestGender?.trim()
                ? { guestGender: fields.guestGender.trim() }
                : {}),
              ...(fields.guestNationality?.trim()
                ? { guestNationality: fields.guestNationality.trim() }
                : {}),
              ...(fields.guestResidencePlace?.trim()
                ? { guestResidencePlace: fields.guestResidencePlace.trim() }
                : {}),
              ...(fields.occupants?.length
                ? { occupants: fields.occupants }
                : {}),
              plannedCheckOutAt,
              expectedRoomId: activeReservationCheckIn.roomId,
              ...(activeReservationCheckIn.updatedAt
                ? { expectedUpdatedAt: activeReservationCheckIn.updatedAt }
                : {}),
            },
          },
        );

        setIsCheckInOpen(false);
        setSelectedRoom(null);
        setActiveReservationCheckIn(null);
        setCustomCheckInInitialFields(null);
        await showSuccessAlert(
          "Nhận phòng thành công",
          `Mã GuestOS: ${result.data?.accessCode || ""}. Hồ sơ khách đang được tự động chuyển sang Khai báo tạm trú (BCA).`,
        );
        await invalidateHotelRealtimeQueries(queryClient, hotelId);
        void boundChannelResource.invalidate(queryClient);
        void refetch();
        if (isArrivalsOpen) {
          void loadArrivals(arrivalsRange);
        }
      } catch (error) {
        const rawMsg = error instanceof Error ? error.message : "";
        const isEarlyConfirmation =
          rawMsg.includes("EARLY_CHECK_IN_CONFIRMATION_REQUIRED") ||
          rawMsg.includes("EARLY_CHECK_IN_NOT_ALLOWED");
        const isLateConfirmation = rawMsg.includes(
          "LATE_CHECK_IN_CONFIRMATION_REQUIRED",
        );
        if (isEarlyConfirmation || isLateConfirmation) {
          const earlyConfirm = await showConfirmDialog({
            icon: "question",
            title: isEarlyConfirmation
              ? "Xác nhận nhận phòng sớm?"
              : "Xác nhận nhận phòng muộn?",
            html: formatEarlyCheckInConfirmHtml({
              guestName:
                activeReservationCheckIn?.guestDisplayName ||
                fields.guestDisplayName ||
                "Khách đặt trước",
              roomNumber: selectedRoom
                ? getRoomNumber(selectedRoom)
                : "Phòng đã chọn",
              scheduledDate: "Theo lịch hẹn",
              isEarly: isEarlyConfirmation,
            }),
            confirmText: isEarlyConfirmation
              ? "Đồng ý nhận phòng sớm"
              : "Đồng ý nhận phòng muộn",
            cancelText: "Hủy bỏ",
            reverseButtons: false,
          });
          if (earlyConfirm.isConfirmed) {
            setSaving(true);
            try {
              const retryResult = await requestInternalApiEnvelope<HotelCheckInResult>(
                `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/${encodeURIComponent(activeReservationCheckIn.reservationId)}/check-in`,
                {
                  method: "POST",
                  body: {
                    guestDisplayName: fields.guestDisplayName.trim(),
                    ...(fields.guestPhone?.trim()
                      ? { guestPhone: fields.guestPhone.trim() }
                      : {}),
                    ...(fields.guestIdentityNumber?.trim()
                      ? { guestIdentityNumber: fields.guestIdentityNumber.trim() }
                      : {}),
                    ...(fields.guestDateOfBirth?.trim()
                      ? { guestDateOfBirth: fields.guestDateOfBirth.trim() }
                      : {}),
                    ...(fields.guestGender?.trim()
                      ? { guestGender: fields.guestGender.trim() }
                      : {}),
                    ...(fields.guestNationality?.trim()
                      ? { guestNationality: fields.guestNationality.trim() }
                      : {}),
                    ...(fields.guestResidencePlace?.trim()
                      ? { guestResidencePlace: fields.guestResidencePlace.trim() }
                      : {}),
                    ...(fields.occupants?.length
                      ? { occupants: fields.occupants }
                      : {}),
                    plannedCheckOutAt,
                    ...(isEarlyConfirmation
                      ? { confirmEarlyCheckIn: true }
                      : { confirmLateCheckIn: true }),
                    expectedRoomId: activeReservationCheckIn.roomId,
                    ...(activeReservationCheckIn.updatedAt
                      ? { expectedUpdatedAt: activeReservationCheckIn.updatedAt }
                      : {}),
                  },
                },
              );

              setIsCheckInOpen(false);
              setSelectedRoom(null);
              setActiveReservationCheckIn(null);
              setCustomCheckInInitialFields(null);
              await showSuccessAlert(
                "Nhận phòng thành công",
                `Mã GuestOS: ${retryResult.data?.accessCode || ""}. Hồ sơ khách đang được tự động chuyển sang Khai báo tạm trú (BCA).`,
              );
              await invalidateHotelRealtimeQueries(queryClient, hotelId);
              void boundChannelResource.invalidate(queryClient);
              void refetch();
              if (isArrivalsOpen) {
                void loadArrivals(arrivalsRange);
              }
              return;
            } catch (retryError) {
              const friendlyRetry = formatFriendlyCheckInError(retryError);
              setSubmitError(friendlyRetry);
              await showErrorAlert("Không thể nhận phòng", friendlyRetry);
              return;
            } finally {
              setSaving(false);
            }
          }
        }
        const friendlyMsg = formatFriendlyCheckInError(error);
        setSubmitError(friendlyMsg);
        await showErrorAlert("Không thể nhận phòng", friendlyMsg);
      } finally {
        setSaving(false);
      }
      return;
    }

    setSaving(true);
    setSubmitError(undefined);
    try {
      const result = await requestInternalApiEnvelope<HotelCheckInResult>(
        `${apiBase}/stays`,
        {
          method: "POST",
          body: {
            roomId: selectedRoom.id,
            guestDisplayName: fields.guestDisplayName.trim(),
            ...(fields.guestPhone?.trim()
              ? { guestPhone: fields.guestPhone.trim() }
              : {}),
            ...(fields.guestIdentityNumber?.trim()
              ? { guestIdentityNumber: fields.guestIdentityNumber.trim() }
              : {}),
            ...(fields.guestDateOfBirth?.trim()
              ? { guestDateOfBirth: fields.guestDateOfBirth.trim() }
              : {}),
            ...(fields.guestGender?.trim()
              ? { guestGender: fields.guestGender.trim() }
              : {}),
            ...(fields.guestNationality?.trim()
              ? { guestNationality: fields.guestNationality.trim() }
              : {}),
            ...(fields.guestResidencePlace?.trim()
              ? { guestResidencePlace: fields.guestResidencePlace.trim() }
              : {}),
            ...(fields.occupants?.length
              ? { occupants: fields.occupants }
              : {}),
            plannedCheckInAt: new Date().toISOString(),
            plannedCheckOutAt,
          },
        },
      );

      setIsCheckInOpen(false);
      setSelectedRoom(null);
      await showSuccessAlert(
        "Đã mở phòng",
        `Mã GuestOS: ${result.data.accessCode}. Hồ sơ khách đang được tự động chuyển sang Khai báo tạm trú (BCA).`,
      );
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      void refetch();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Vui lòng thử lại.",
      );
      await showErrorAlert(
        "Không thể mở phòng",
        error instanceof Error ? error.message : "Vui lòng thử lại.",
      );
    } finally {
      setSaving(false);
    }
  }

  function renderRoomStatusHoverMenu(
    room: HotelRoomSummary,
    status: "processing" | "maintenance" | "blocked",
  ) {
    return (
      <div className="group relative w-full">
        {/* Animated hover popover menu */}
        <div className="absolute bottom-full left-0 right-0 mb-2 z-30 pointer-events-none opacity-0 translate-y-2 scale-95 transition-all duration-200 ease-out group-hover:pointer-events-auto group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus-within:scale-100 rounded-2xl border border-[var(--outline-variant)] bg-white/95 p-1.5 shadow-2xl backdrop-blur-md before:absolute before:inset-x-0 before:-bottom-2 before:h-2">
          <div className="flex flex-col gap-1">
            {/* Cleaning Action */}
            {status === "processing" ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void confirmRoomReady(room);
                }}
                className="flex w-full items-center gap-2 rounded-xl bg-amber-700 hover:bg-amber-800 py-2.5 px-3 text-xs font-extrabold text-white shadow-xs transition active:scale-[0.98] cursor-pointer text-left"
              >
                <VsIcon
                  name="cleaning_services"
                  className="text-base shrink-0"
                />
                <span>Đánh dấu phòng Trống</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void updateRoomStatus(room, "PROCESSING");
                }}
                className="flex w-full items-center gap-2 rounded-xl bg-amber-600/90 hover:bg-amber-700 py-2.5 px-3 text-xs font-extrabold text-white shadow-xs transition active:scale-[0.98] cursor-pointer text-left"
              >
                <VsIcon
                  name="cleaning_services"
                  className="text-base shrink-0"
                />
                <span>Chuyển CHỜ DỌN DẸP</span>
              </button>
            )}

            {/* Maintenance Action */}
            {status === "maintenance" ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void updateRoomStatus(room, "AVAILABLE");
                }}
                className="flex w-full items-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 py-2.5 px-3 text-xs font-extrabold text-white shadow-xs transition active:scale-[0.98] cursor-pointer text-left"
              >
                <VsIcon name="build" className="text-base shrink-0" />
                <span>Xong bảo trì → Chuyển TRỐNG</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void updateRoomStatus(room, "MAINTENANCE");
                }}
                className="flex w-full items-center gap-2 rounded-xl bg-slate-700 hover:bg-slate-800 py-2.5 px-3 text-xs font-extrabold text-white shadow-xs transition active:scale-[0.98] cursor-pointer text-left"
              >
                <VsIcon name="build" className="text-base shrink-0" />
                <span>Đánh dấu BẢO TRÌ</span>
              </button>
            )}

            {/* Lock / Unlock Action */}
            {canManageRooms ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void toggleRoomBlocked(room);
                }}
                className={`flex w-full items-center gap-2 rounded-xl py-2.5 px-3 text-xs font-extrabold shadow-xs transition active:scale-[0.98] cursor-pointer text-left ${
                  status === "blocked"
                    ? "bg-emerald-700 hover:bg-emerald-800 text-white"
                    : "bg-rose-700 hover:bg-rose-800 text-white"
                }`}
              >
                <VsIcon
                  name={status === "blocked" ? "lock_open" : "block"}
                  className="text-base shrink-0"
                />
                <span>
                  {status === "blocked"
                    ? "Mở khóa → Chuyển TRỐNG"
                    : "Khóa phòng"}
                </span>
              </button>
            ) : null}
          </div>
        </div>

        {/* Trigger Button */}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handleCardClick(room);
          }}
          className={`flex w-full min-h-[44px] items-center justify-between gap-1.5 rounded-xl py-2.5 px-3.5 text-xs sm:text-sm font-extrabold shadow-sm transition active:scale-[0.98] cursor-pointer text-white ${
            status === "processing"
              ? "bg-amber-700 hover:bg-amber-800"
              : status === "maintenance"
                ? "bg-rose-700 hover:bg-rose-800"
                : "bg-slate-600 hover:bg-slate-700"
          }`}
        >
          <span className="flex items-center gap-2">
            <VsIcon name="tune" className="text-base shrink-0" />
            <span>Cập nhật phòng</span>
          </span>
          <VsIcon
            name="keyboard_arrow_up"
            className="text-base shrink-0 transition-transform duration-200 group-hover:-translate-y-0.5"
          />
        </button>
      </div>
    );
  }

  function cleanGuestDisplayName(name?: string | null): string {
    if (!name) return "";
    return name
      .replace(
        /\s*\((?:Đang ở|Đến hôm nay|Quá hạn[^)]*|Giữ chỗ[^)]*|Check-in[^)]*|Check-out[^)]*|Khách[^)]*|Lưu trú[^)]*)\)/gi,
        "",
      )
      .trim();
  }

  function renderRoomCard(room: HotelRoomSummary) {
    const rawEffectiveStatus = getEffectiveRoomStatus(room, isFutureDate);
    const effectiveStatus: RoomStatusFilter = rawEffectiveStatus;
    const physicalStatus = getRoomStatus(room);
    const stay = isFutureDate
      ? room.projectedStay || room.activeStay
      : room.activeStay;
    const hasActiveStay = Boolean(stay && !stay.checkedOutAt);
    const isOverdue =
      !isFutureDate &&
      (isOverdueCheckOut(room) || rawEffectiveStatus === "overdue");
    const incomingOta = incomingOtaByRoomNumber.get(
      getRoomNumber(room).toUpperCase(),
    );
    const isVip = /suite|vip|premium|penthouse/i.test(room.type ?? "");
    const resDetails = getRoomReservationDetails(room);

    const targetYmd = businessDate || todayYmd;
    const stayCheckOutYmd = toVietnamDateString(stay?.plannedCheckOutAt);
    const isOutToday = hasActiveStay && stayCheckOutYmd === targetYmd;

    const todayArrival = todayArrivalByRoomId.get(room.id);
    const arrivalCheckInYmd =
      toVietnamDateString(todayArrival?.plannedCheckInAt) ||
      toVietnamDateString(resDetails?.plannedCheckInAt) ||
      toVietnamDateString(incomingOta?.checkInDate) ||
      toVietnamDateString(room.upcomingReservation?.plannedCheckInAt);

    const isInToday = Boolean(
      todayArrival ||
        incomingOta ||
        (resDetails && resDetails.isReservedToday) ||
        (arrivalCheckInYmd && arrivalCheckInYmd === targetYmd) ||
        effectiveStatus === "reserved",
    );

    const incomingGuestName =
      todayArrival?.guestDisplayName ||
      resDetails?.guestDisplayName ||
      incomingOta?.guestName ||
      (arrivalCheckInYmd === targetYmd
        ? room.upcomingReservation?.guestDisplayName
        : null);

    const incomingCheckInAt =
      todayArrival?.plannedCheckInAt ||
      resDetails?.plannedCheckInAt ||
      incomingOta?.checkInDate ||
      room.upcomingReservation?.plannedCheckInAt;

    const incomingPhone =
      todayArrival?.guestPhone ||
      resDetails?.guestPhone ||
      (arrivalCheckInYmd === targetYmd
        ? room.upcomingReservation?.guestPhone
        : null) ||
      room.upcomingReservation?.guestPhone ||
      null;

    const incomingCheckOutAt =
      todayArrival?.plannedCheckOutAt ||
      resDetails?.plannedCheckOutAt ||
      incomingOta?.checkOutDate ||
      room.upcomingReservation?.plannedCheckOutAt;

    const incomingSource = incomingOta
      ? `OTA · ${incomingOta.otaName}`
      : null;

    // Phân loại trạng thái lưu trú vận hành theo yêu cầu của lễ tân
    let stateCategory:
      | "turnaround"
      | "departing_today"
      | "arriving_today"
      | "occupied"
      | "overdue"
      | "available"
      | "processing"
      | "blocked"
      | "maintenance";

    if (isOverdue) {
      stateCategory = "overdue";
    } else if (hasActiveStay && isOutToday && isInToday) {
      stateCategory = "turnaround";
    } else if (hasActiveStay && isOutToday) {
      stateCategory = "departing_today";
    } else if (hasActiveStay) {
      stateCategory = "occupied";
    } else if (isInToday || effectiveStatus === "reserved") {
      stateCategory = "arriving_today";
    } else if (effectiveStatus === "processing") {
      stateCategory = "processing";
    } else if (effectiveStatus === "blocked") {
      stateCategory = "blocked";
    } else if (effectiveStatus === "maintenance") {
      stateCategory = "maintenance";
    } else {
      stateCategory = "available";
    }

    const matchedOccupant =
      !isFutureDate && inputQuery.trim()
        ? room.activeStay?.occupants?.find((occ) =>
            occ.fullName
              .toLowerCase()
              .includes(inputQuery.trim().toLowerCase()),
          )
        : null;

    let cardClass = "";
    if (stateCategory === "turnaround") {
      cardClass =
        "border-2 border-amber-400 hover:border-amber-500 bg-gradient-to-b from-amber-50/80 via-white to-purple-50/40 text-slate-950 shadow-xs hover:shadow-md hover:shadow-amber-500/10";
    } else if (stateCategory === "departing_today") {
      cardClass =
        "border-2 border-amber-300 hover:border-amber-400 bg-gradient-to-b from-amber-50/70 via-white to-amber-50/20 text-slate-950 shadow-xs hover:shadow-md hover:shadow-amber-500/10";
    } else if (stateCategory === "arriving_today") {
      cardClass =
        "border-2 border-purple-300 hover:border-purple-400 bg-gradient-to-b from-purple-50/70 via-white to-purple-50/20 text-slate-950 shadow-xs hover:shadow-md hover:shadow-purple-500/10";
    } else if (stateCategory === "occupied") {
      cardClass =
        "border-2 border-sky-300 hover:border-sky-400 bg-gradient-to-b from-sky-50/70 via-white to-blue-50/20 text-slate-950 shadow-xs hover:shadow-md hover:shadow-sky-500/10";
    } else if (stateCategory === "overdue") {
      cardClass =
        "border-2 border-rose-300 hover:border-rose-400 bg-gradient-to-b from-rose-50/70 via-white to-rose-50/20 text-slate-950 shadow-xs hover:shadow-md hover:shadow-rose-500/10";
    } else if (stateCategory === "processing") {
      cardClass =
        "border-2 border-amber-300 hover:border-amber-400 bg-gradient-to-b from-amber-50/60 via-white to-amber-50/20 text-slate-950 shadow-xs hover:shadow-md hover:shadow-amber-500/10";
    } else if (stateCategory === "blocked" || stateCategory === "maintenance") {
      cardClass =
        "border-2 border-slate-300 hover:border-slate-400 bg-gradient-to-b from-slate-100/80 via-white to-slate-50/40 text-slate-950 shadow-xs hover:shadow-md";
    } else {
      cardClass =
        "border-2 border-emerald-300 hover:border-emerald-400 bg-gradient-to-b from-emerald-50/70 via-white to-emerald-50/20 text-slate-950 shadow-xs hover:shadow-md hover:shadow-emerald-500/10";
    }

    return (
      <div
        key={room.id}
        ref={(el) => {
          if (el) cardTriggerRefMap.current.set(room.id, el);
          else cardTriggerRefMap.current.delete(room.id);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleCardClick(room, e.currentTarget);
          }
        }}
        onClick={(e) => handleCardClick(room, e.currentTarget)}
        className={`relative flex w-full flex-col justify-between min-h-[220px] sm:min-h-[226px] overflow-hidden rounded-2xl p-3.5 sm:p-4 text-left transition-all cursor-pointer select-none ${cardClass}`}
      >
        {renderRoomAmbientGlow(effectiveStatus)}

        {/* Header: Room Number, Room Type, VIP/Capacity Badge & Status Badge */}
        <div className="relative z-10 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="vs-display text-2xl font-black tracking-tight text-slate-950 leading-none">
                {getRoomNumber(room)}
              </h3>
              {isVip && (
                <span className="rounded-md bg-amber-100 text-amber-950 border border-amber-300 px-1.5 py-0.5 text-xs font-black tracking-wide whitespace-nowrap">
                  VIP
                </span>
              )}
            </div>
            <p className="text-xs font-semibold text-slate-600 mt-1 truncate">
              {room.type ?? "Tiêu chuẩn"}
              {room.maxOccupancy ? ` · ${room.maxOccupancy} khách` : ""}
            </p>
          </div>

          {/* Top-Right: Status Pill Badge */}
          <div className="shrink-0 pt-0.5">
            {stateCategory === "turnaround" ? (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-950 border border-amber-300 px-2.5 py-0.5 text-xs font-black shadow-2xs whitespace-nowrap">
                <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
                <span>Khách out & in</span>
              </div>
            ) : stateCategory === "departing_today" ? (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200 px-2.5 py-0.5 text-xs font-black whitespace-nowrap">
                <span className="size-2 rounded-full bg-amber-500" />
                <span>Khách out hôm nay</span>
              </div>
            ) : stateCategory === "arriving_today" ? (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 text-purple-900 border border-purple-200 px-2.5 py-0.5 text-xs font-black whitespace-nowrap">
                <span className="size-2 rounded-full bg-purple-600" />
                <span>Khách in hôm nay</span>
              </div>
            ) : stateCategory === "occupied" ? (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 text-blue-900 border border-blue-200 px-2.5 py-0.5 text-xs font-black whitespace-nowrap">
                <span className="size-2 rounded-full bg-blue-600" />
                <span>Có khách đang ở</span>
              </div>
            ) : stateCategory === "overdue" ? (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 text-rose-950 border border-rose-300 px-2.5 py-0.5 text-xs font-black whitespace-nowrap animate-pulse">
                <VsIcon name="warning" className="text-xs text-rose-600 shrink-0" />
                <span>Quá hạn trả phòng</span>
              </div>
            ) : stateCategory === "processing" ? (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200 px-2.5 py-0.5 text-xs font-black whitespace-nowrap">
                <VsIcon
                  name="cleaning_services"
                  className="text-xs text-amber-600 shrink-0"
                />
                <span>Chờ dọn buồng</span>
              </div>
            ) : stateCategory === "blocked" ? (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 text-slate-800 border border-slate-300 px-2.5 py-0.5 text-xs font-bold whitespace-nowrap">
                <VsIcon name="lock" className="text-xs text-slate-600 shrink-0" />
                <span>Đã khóa phòng</span>
              </div>
            ) : stateCategory === "maintenance" ? (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 text-slate-800 border border-slate-300 px-2.5 py-0.5 text-xs font-bold whitespace-nowrap">
                <VsIcon name="build" className="text-xs text-slate-600 shrink-0" />
                <span>Đang bảo trì</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-900 border border-emerald-200 px-2.5 py-0.5 text-xs font-black whitespace-nowrap">
                <span className="size-2 rounded-full bg-emerald-500" />
                <span>Sẵn sàng đón khách</span>
              </div>
            )}
          </div>
        </div>

        {/* Middle Body: Guest Info & Check-in / Check-out Dates */}
        <div className="relative z-10 my-auto flex flex-col justify-center py-1">
          {stateCategory === "turnaround" ? (
            <div className="flex flex-col gap-1.5">
              <div className="rounded-xl bg-amber-50/90 border border-amber-200/80 px-2.5 py-1.5">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 font-black text-amber-950 truncate min-w-0 flex-1">
                    <VsIcon
                      name="logout"
                      className="text-xs text-amber-600 shrink-0"
                    />
                    <span className="truncate text-xs sm:text-sm">
                      {cleanGuestDisplayName(stay?.guestDisplayName) || "Khách đang ở"}
                    </span>
                    {stay?.guestPhone && (
                      <span className="text-amber-900/80 font-bold shrink-0 whitespace-nowrap text-xs">
                        · {stay.guestPhone}
                      </span>
                    )}
                  </div>
                  <span className="text-amber-900 font-black whitespace-nowrap shrink-0 text-xs sm:text-sm bg-amber-100/90 px-1.5 py-0.5 rounded">
                    Out: {formatTimeOnly(stay?.plannedCheckOutAt) || "12:00"}
                  </span>
                </div>
              </div>
              <div className="rounded-xl bg-purple-50/90 border border-purple-200/80 px-2.5 py-1.5">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 font-black text-purple-950 truncate min-w-0 flex-1">
                    <VsIcon
                      name="login"
                      className="text-xs text-purple-600 shrink-0"
                    />
                    <span className="truncate text-xs sm:text-sm">
                      {cleanGuestDisplayName(incomingGuestName) || "Khách đặt trước"}
                    </span>
                    {incomingPhone && (
                      <span className="text-purple-900/80 font-bold shrink-0 whitespace-nowrap text-xs">
                        · {incomingPhone}
                      </span>
                    )}
                  </div>
                  <span className="text-purple-900 font-black whitespace-nowrap shrink-0 text-xs sm:text-sm bg-purple-100/90 px-1.5 py-0.5 rounded">
                    In: {formatTimeOnly(incomingCheckInAt) || "14:00"}
                  </span>
                </div>
              </div>
            </div>
          ) : stateCategory === "departing_today" ||
            stateCategory === "occupied" ||
            stateCategory === "overdue" ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-slate-900 min-w-0">
                <VsIcon
                  name="person"
                  className="text-base text-sky-600 shrink-0"
                />
                <span className="truncate text-sm font-black text-slate-950">
                  {cleanGuestDisplayName(stay?.guestDisplayName) || "Khách lưu trú"}
                </span>
                {stay?.guestPhone && (
                  <span className="text-xs font-bold text-slate-600 shrink-0 whitespace-nowrap">
                    · {stay.guestPhone}
                  </span>
                )}
              </div>
              {matchedOccupant && (
                <div className="text-xs font-bold text-sky-900 bg-sky-100/90 px-2 py-0.5 rounded-md w-fit truncate">
                  Đi cùng: {matchedOccupant.fullName}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50/90 border border-slate-200/90 p-2 sm:p-2.5">
                <div>
                  <span className="text-xs font-bold text-slate-500 block">
                    Check-in
                  </span>
                  <span className="text-sm font-black text-slate-900 whitespace-nowrap block mt-0.5">
                    {formatDateTime(stay?.checkedInAt || stay?.plannedCheckInAt)}
                  </span>
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-500 block">
                    Check-out
                  </span>
                  <span
                    className={`text-sm font-black whitespace-nowrap block mt-0.5 ${
                      stateCategory === "departing_today"
                        ? "text-amber-900 bg-amber-100/90 px-1.5 py-0.5 rounded-md inline-block"
                        : stateCategory === "overdue"
                          ? "text-rose-950 bg-rose-100/90 px-1.5 py-0.5 rounded-md inline-block animate-pulse"
                          : "text-slate-900"
                    }`}
                  >
                    {formatDateTime(stay?.plannedCheckOutAt)}
                  </span>
                </div>
              </div>
            </div>
          ) : stateCategory === "arriving_today" ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-1.5 min-w-0">
                <div className="flex items-center gap-1.5 text-purple-950 min-w-0 flex-1">
                  <VsIcon
                    name="person"
                    className="text-base text-purple-600 shrink-0"
                  />
                  <span className="truncate text-sm font-black text-slate-950">
                    {cleanGuestDisplayName(incomingGuestName) || "Khách đặt trước"}
                  </span>
                  {incomingPhone && (
                    <span className="text-xs font-bold text-slate-600 shrink-0 whitespace-nowrap">
                      · {incomingPhone}
                    </span>
                  )}
                </div>
                {incomingSource && (
                  <span className="text-xs font-bold text-purple-700 whitespace-nowrap bg-purple-100/90 border border-purple-200/80 px-1.5 py-0.5 rounded-md shrink-0">
                    {incomingSource}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-purple-50/80 border border-purple-200/80 p-2 sm:p-2.5">
                <div>
                  <span className="text-xs font-bold text-purple-800 block">
                    Dự kiến đến
                  </span>
                  <span className="text-sm font-black text-purple-950 whitespace-nowrap block mt-0.5">
                    {formatDateTime(incomingCheckInAt)}
                  </span>
                </div>
                <div>
                  <span className="text-xs font-bold text-purple-800 block">
                    Dự kiến trả
                  </span>
                  <span className="text-sm font-black text-purple-950 whitespace-nowrap block mt-0.5">
                    {formatDateTime(incomingCheckOutAt)}
                  </span>
                </div>
              </div>
            </div>
          ) : stateCategory === "available" ? (
            <div className="flex flex-col justify-center">
              {room.upcomingReservation ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 text-purple-900 font-extrabold truncate min-w-0">
                    <VsIcon
                      name="event"
                      className="text-sm text-purple-600 shrink-0"
                    />
                    <span className="truncate text-sm font-black text-slate-900">
                      Lịch: {cleanGuestDisplayName(room.upcomingReservation.guestDisplayName)}
                    </span>
                    {room.upcomingReservation.guestPhone && (
                      <span className="text-xs font-bold text-purple-800 shrink-0 whitespace-nowrap">
                        · {room.upcomingReservation.guestPhone}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-purple-50/80 border border-purple-200/80 p-2 sm:p-2.5">
                    <div>
                      <span className="text-xs font-bold text-purple-700 block">
                        Nhận phòng
                      </span>
                      <span className="text-sm font-black text-purple-950 whitespace-nowrap block mt-0.5">
                        {formatDateTime(
                          room.upcomingReservation.plannedCheckInAt,
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs font-bold text-purple-700 block">
                        Trả phòng
                      </span>
                      <span className="text-sm font-black text-purple-950 whitespace-nowrap block mt-0.5">
                        {formatDateTime(
                          room.upcomingReservation.plannedCheckOutAt,
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-xl bg-emerald-50/80 border border-emerald-200/80 p-2.5 sm:p-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                    <VsIcon
                      name="check_circle"
                      className="text-xl"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-sm text-emerald-950 truncate">
                      Phòng sạch & Sẵn sàng
                    </p>
                    <p className="text-xs font-medium text-emerald-800/80 truncate mt-0.5">
                      Chưa có lịch đặt hôm nay
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : stateCategory === "processing" ? (
            <div className="flex items-center gap-3 rounded-xl bg-amber-50/80 border border-amber-200/80 p-2.5 sm:p-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <VsIcon
                  name="cleaning_services"
                  className="text-xl"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-black text-sm text-amber-950 truncate">
                  Chờ buồng phòng dọn dẹp
                </p>
                <p className="text-xs font-medium text-amber-900/80 truncate mt-0.5">
                  {isInToday
                    ? "Có khách sắp nhận hôm nay!"
                    : "Chưa hoàn tất vệ sinh"}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl bg-slate-100/80 border border-slate-200/90 p-2.5 sm:p-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-200/80 text-slate-600">
                <VsIcon
                  name={stateCategory === "blocked" ? "lock" : "build"}
                  className="text-xl"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-black text-sm text-slate-900 truncate">
                  {stateCategory === "blocked"
                    ? "Đã khóa phòng"
                    : "Đang bảo trì"}
                </p>
                <p className="text-xs font-medium text-slate-500 truncate mt-0.5">
                  Tạm thời ngừng đón khách
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer: Direct Touch Action Buttons */}
        <div className="relative z-10 mt-auto border-t border-slate-200/80 pt-2 sm:pt-2.5">
          {isHousekeeping ? (
            effectiveStatus === "processing" ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void confirmRoomReady(room);
                }}
                className="flex w-full h-9 sm:h-[38px] items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs sm:text-sm shadow-xs transition active:scale-[0.98] cursor-pointer"
              >
                <VsIcon name="check_circle" className="text-base shrink-0" />
                <span>Xác nhận phòng đã dọn xong</span>
              </button>
            ) : (
              <div className="flex w-full h-9 sm:h-[38px] items-center justify-center rounded-xl bg-slate-100 text-slate-700 text-xs sm:text-sm font-bold border border-slate-200">
                <span>Trạng thái: {roomStatusLabel(effectiveStatus)}</span>
              </div>
            )
          ) : stateCategory === "available" ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openWalkIn(room);
                }}
                className="flex h-9 sm:h-[38px] items-center justify-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs sm:text-sm shadow-xs transition active:scale-[0.98] cursor-pointer"
              >
                <VsIcon name="login" className="text-base shrink-0" />
                <span>Nhận phòng</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openFutureReservationModal(room);
                }}
                className="flex h-9 sm:h-[38px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-900 font-bold text-xs sm:text-sm shadow-2xs transition active:scale-[0.98] cursor-pointer"
              >
                <VsIcon name="event" className="text-base shrink-0" />
                <span>Đặt trước</span>
              </button>
            </div>
          ) : stateCategory === "turnaround" ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openRoomContextPanel(room, e.currentTarget);
                }}
                className="flex h-9 sm:h-[38px] items-center justify-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs sm:text-sm shadow-xs transition active:scale-[0.98] cursor-pointer"
              >
                <VsIcon name="logout" className="text-base shrink-0" />
                <span>Trả phòng</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (resDetails?.arrival) {
                    handleCheckInArrival(resDetails.arrival);
                  } else {
                    openRoomContextPanel(room, e.currentTarget);
                  }
                }}
                className="flex h-9 sm:h-[38px] items-center justify-center gap-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-xs sm:text-sm shadow-xs transition active:scale-[0.98] cursor-pointer"
              >
                <VsIcon name="login" className="text-base shrink-0" />
                <span>Nhận phòng</span>
              </button>
            </div>
          ) : stateCategory === "departing_today" ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openRoomContextPanel(room, e.currentTarget);
              }}
              className="flex w-full h-9 sm:h-[38px] items-center justify-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs sm:text-sm shadow-xs transition active:scale-[0.98] cursor-pointer"
            >
              <VsIcon name="logout" className="text-base shrink-0" />
              <span>Chi tiết & Trả phòng</span>
            </button>
          ) : stateCategory === "arriving_today" ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (incomingOta && canManageStays) {
                  void handleOtaFastCheckIn(incomingOta, room);
                } else if (resDetails?.arrival) {
                  handleCheckInArrival(resDetails.arrival);
                } else if (resDetails) {
                  handleCheckInReservationGeneric(room, resDetails);
                } else {
                  openRoomContextPanel(room, e.currentTarget);
                }
              }}
              className="flex w-full h-9 sm:h-[38px] items-center justify-center gap-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-xs sm:text-sm shadow-xs transition active:scale-[0.98] cursor-pointer"
            >
              <VsIcon name="login" className="text-base shrink-0" />
              <span>Làm thủ tục nhận phòng</span>
            </button>
          ) : stateCategory === "occupied" ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openRoomContextPanel(room, e.currentTarget);
              }}
              className="flex w-full h-9 sm:h-[38px] items-center justify-center gap-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-xs sm:text-sm shadow-xs transition active:scale-[0.98] cursor-pointer"
            >
              <VsIcon name="info" className="text-base shrink-0" />
              <span>Chi tiết lưu trú & Hóa đơn</span>
            </button>
          ) : stateCategory === "overdue" ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openRoomContextPanel(room, e.currentTarget);
              }}
              className="flex w-full h-9 sm:h-[38px] items-center justify-center gap-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-extrabold text-xs sm:text-sm shadow-xs transition active:scale-[0.98] cursor-pointer"
            >
              <VsIcon name="warning" className="text-base shrink-0" />
              <span>Xử lý trả phòng quá hạn</span>
            </button>
          ) : stateCategory === "processing" ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void confirmRoomReady(room);
                }}
                className="flex h-9 sm:h-[38px] items-center justify-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs sm:text-sm shadow-xs transition active:scale-[0.98] cursor-pointer"
              >
                <VsIcon name="check" className="text-base shrink-0" />
                <span>Đã dọn xong</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openRoomContextPanel(room, e.currentTarget);
                }}
                className="flex h-9 sm:h-[38px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-900 font-bold text-xs sm:text-sm shadow-2xs transition active:scale-[0.98] cursor-pointer"
              >
                <VsIcon name="tune" className="text-base shrink-0" />
                <span>Chi tiết</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openRoomContextPanel(room, e.currentTarget);
              }}
              className="flex w-full h-9 sm:h-[38px] items-center justify-center gap-2 rounded-xl border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-900 font-bold text-xs sm:text-sm shadow-2xs transition active:scale-[0.98] cursor-pointer"
            >
              <VsIcon name="tune" className="text-base shrink-0" />
              <span>Cập nhật trạng thái</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const roomsByFloorMap = new Map<string, HotelRoomSummary[]>();
  for (const room of filteredRooms) {
    const flKey = room.floor?.trim() ? `Tầng ${room.floor}` : "Khu vực khác";
    const list = roomsByFloorMap.get(flKey) ?? [];
    list.push(room);
    roomsByFloorMap.set(flKey, list);
  }
  for (const [, list] of roomsByFloorMap) {
    list.sort((a, b) =>
      getRoomNumber(a).localeCompare(getRoomNumber(b), undefined, {
        numeric: true,
      }),
    );
  }
  const roomsByFloor = Array.from(roomsByFloorMap.entries()).sort(([a], [b]) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

  const activeFloorTab = useMemo(() => {
    if (selectedFloorTab === "all") return "all";
    const exists = roomsByFloor.some(([fl]) => fl === selectedFloorTab);
    return exists ? selectedFloorTab : "all";
  }, [roomsByFloor, selectedFloorTab]);

  const displayedRoomsByFloor = useMemo(() => {
    if (activeFloorTab === "all") return roomsByFloor;
    return roomsByFloor.filter(([floorTitle]) => floorTitle === activeFloorTab);
  }, [roomsByFloor, activeFloorTab]);

  function renderHousekeepingTaskCard(room: HotelRoomSummary) {
    const effectiveStatus = getEffectiveRoomStatus(room, false);
    const roomNum = getRoomNumber(room);
    const isVip = /suite|vip|premium|penthouse/i.test(room.type ?? "");
    const isProcessing = effectiveStatus === "processing";
    const isAvailable = effectiveStatus === "available";
    const isOccupied = effectiveStatus === "occupied";
    const isOverdue = effectiveStatus === "overdue";
    const isMaintenance = effectiveStatus === "maintenance";

    return (
      <article
        key={room.id}
        className={`group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border p-4 sm:p-5 transition-all duration-200 ${
          isProcessing
            ? "border-amber-300 bg-amber-50/50 hover:bg-amber-50/80 hover:border-amber-400 shadow-2xs"
            : isAvailable
              ? "border-emerald-200/90 bg-white hover:border-emerald-300 shadow-2xs"
              : isOverdue
                ? "border-rose-300 bg-rose-50/40 shadow-2xs"
                : "border-slate-200 bg-white shadow-2xs"
        }`}
      >
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <div
            onClick={(e) => {
              e.stopPropagation();
              handleCardClick(room, e.currentTarget);
            }}
            className="flex size-14 shrink-0 flex-col items-center justify-center rounded-xl bg-white border border-slate-200/90 shadow-2xs cursor-pointer hover:border-slate-400 transition"
            title="Xem chi tiết phòng"
          >
            <span className="vs-display text-xl sm:text-2xl font-black tracking-tight text-slate-900 leading-none">
              {roomNum}
            </span>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-0.5">
              {room.floor ? `Tầng ${room.floor}` : "Phòng"}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                {room.type ?? "Phòng tiêu chuẩn"}
              </p>
              {isVip ? (
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-black tracking-wider text-amber-900 border border-amber-300">
                  VIP
                </span>
              ) : null}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              {isProcessing ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100/90 text-amber-950 border border-amber-300/80 px-2.5 py-0.5 font-bold">
                  <span className="size-2 rounded-full bg-amber-600 animate-pulse" />
                  <span>Đang chờ dọn dẹp</span>
                </span>
              ) : isAvailable ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 px-2.5 py-0.5 font-bold">
                  <VsIcon
                    name="check_circle"
                    className="text-sm text-emerald-700"
                  />
                  <span>Đã dọn sạch · Sẵn sàng đón khách</span>
                </span>
              ) : isOccupied ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-100 text-sky-900 border border-sky-200 px-2.5 py-0.5 font-bold">
                  <VsIcon name="hotel" className="text-sm text-sky-700" />
                  <span>Đang có khách lưu trú</span>
                </span>
              ) : isOverdue ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-100 text-rose-900 border border-rose-300 px-2.5 py-0.5 font-bold">
                  <VsIcon name="warning" className="text-sm text-rose-600" />
                  <span>Quá hạn trả phòng</span>
                </span>
              ) : isMaintenance ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-100 text-red-900 border border-red-300 px-2.5 py-0.5 font-bold">
                  <VsIcon name="build" className="text-sm text-red-700" />
                  <span>Đang bảo trì kỹ thuật</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-0.5 font-bold">
                  <span>{roomStatusLabel(effectiveStatus)}</span>
                </span>
              )}

              {room.activeStay?.plannedCheckOutAt ? (
                <span className="text-slate-500 font-medium hidden sm:inline">
                  Hạn trả: {formatDateTime(room.activeStay.plannedCheckOutAt)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0">
          {isProcessing ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void confirmRoomReady(room);
              }}
              className="flex-1 sm:flex-initial inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-extrabold text-sm px-5 py-2.5 shadow-xs border border-emerald-800/30 transition-all active:scale-[0.98] cursor-pointer"
              title={`Xác nhận phòng ${roomNum} đã được dọn sạch`}
            >
              <VsIcon name="check_circle" className="text-lg shrink-0" />
              <span>Xác nhận đã dọn xong</span>
            </button>
          ) : isAvailable ? (
            <div className="flex-1 sm:flex-initial inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 px-4 text-xs font-bold">
              <VsIcon name="task_alt" className="text-base text-emerald-700" />
              <span>Phòng đã sẵn sàng</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleCardClick(room, e.currentTarget);
              }}
              className="flex-1 sm:flex-initial inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-3.5 text-xs font-bold shadow-2xs transition cursor-pointer"
            >
              <VsIcon name="info" className="text-sm text-slate-400" />
              <span>Chi tiết phòng</span>
            </button>
          )}
        </div>
      </article>
    );
  }

  return (
    <div className="space-y-6">
      {isHousekeeping ? (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50/90 p-4 text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white">
              <VsIcon name="cleaning_services" className="text-xl" />
            </span>
            <div>
              <p className="font-extrabold text-sm text-emerald-950">
                Vận hành buồng phòng &amp; Dọn dẹp
              </p>
              <p className="text-xs text-emerald-800 mt-0.5">
                Theo dõi các phòng cần dọn dẹp theo ca trực và xác nhận phòng
                sẵn sàng đón khách mới.
              </p>
            </div>
          </div>
          <div className="inline-flex h-10 items-center rounded-xl border border-emerald-300/80 bg-white/90 p-1 shadow-2xs self-start sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => setHousekeepingViewMode("tasklist")}
              className={`inline-flex h-full items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition cursor-pointer ${
                housekeepingViewMode === "tasklist"
                  ? "bg-emerald-700 text-white shadow-xs font-extrabold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
              title="Xem dạng danh sách công việc buồng phòng theo tầng"
            >
              <VsIcon name="format_list_bulleted" className="text-sm" />
              <span>Danh sách việc</span>
            </button>
            <button
              type="button"
              onClick={() => setHousekeepingViewMode("grid")}
              className={`inline-flex h-full items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition cursor-pointer ${
                housekeepingViewMode === "grid"
                  ? "bg-emerald-700 text-white shadow-xs font-extrabold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
              title="Xem dạng sơ đồ lưới buồng phòng"
            >
              <VsIcon name="grid_view" className="text-sm" />
              <span>Sơ đồ lưới</span>
            </button>
          </div>
        </div>
      ) : null}

      {isFutureDate ? (
        <div className="rounded-2xl border border-sky-300 bg-sky-50/90 p-4 text-sky-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-700 text-white">
              <VsIcon name="calendar_today" className="text-xl" />
            </span>
            <div>
              <p className="font-extrabold text-sm text-sky-950">
                Đang xem sơ đồ dự kiến ngày:{" "}
                {formatDateTime(businessDate).slice(0, 10)}
              </p>
              <p className="text-xs text-sky-800 mt-0.5">
                Trạng thái phòng hiển thị theo lịch đặt phòng tương lai
                (projectedStatus). Trạng thái vật lý hiện tại của phòng không bị
                thay đổi.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleBusinessDateChange(todayYmd)}
            className="self-start sm:self-auto shrink-0 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-sky-700 hover:bg-sky-800 px-4 text-xs font-bold text-white transition cursor-pointer shadow-2xs"
          >
            Quay lại Hôm nay
          </button>
        </div>
      ) : null}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            key: "available" as RoomStatusFilter,
            label: "Sẵn sàng",
            value: currentByStatus.available,
            tone: "text-emerald-700",
            dotColor: "bg-emerald-500",
            icon: "check_circle",
            iconStyle: "bg-emerald-50 text-emerald-600 border-emerald-100/80",
            iconActiveStyle:
              "bg-emerald-100 text-emerald-700 border-emerald-200",
            description: "Sẵn sàng đón khách",
            borderActive:
              "border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-500/20 shadow-xs",
          },
          {
            key: "occupied" as RoomStatusFilter,
            label: "Đang ở",
            value: currentByStatus.occupied,
            tone: "text-blue-700",
            dotColor: "bg-blue-500",
            icon: "hotel",
            iconStyle: "bg-blue-50 text-blue-600 border-blue-100/80",
            iconActiveStyle: "bg-blue-100 text-blue-700 border-blue-200",
            description: "Đang có khách lưu trú",
            borderActive:
              "border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20 shadow-xs",
          },
          {
            key: "processing" as RoomStatusFilter,
            label: "Chờ dọn",
            value: currentByStatus.processing,
            tone: "text-amber-700",
            dotColor: "bg-amber-500",
            icon: "cleaning_services",
            iconStyle: "bg-amber-50 text-amber-600 border-amber-100/80",
            iconActiveStyle: "bg-amber-100 text-amber-700 border-amber-200",
            description: "Chờ dọn dẹp buồng",
            borderActive:
              "border-amber-600 bg-amber-50/50 ring-2 ring-amber-500/20 shadow-xs",
          },
          {
            key: "maintenance" as RoomStatusFilter,
            label: "Bảo trì",
            value: currentByStatus.maintenance,
            tone: "text-red-700",
            dotColor: "bg-red-500",
            icon: "build",
            iconStyle: "bg-red-50 text-red-600 border-red-100/80",
            iconActiveStyle: "bg-red-100 text-red-700 border-red-200",
            description: "Tạm ngưng đón khách",
            borderActive:
              "border-red-600 bg-red-50/50 ring-2 ring-red-500/20 shadow-xs",
          },
        ].map((item) => {
          const isActive = status === item.key;
          const totalRooms =
            currentByStatus.available +
            currentByStatus.occupied +
            currentByStatus.processing +
            currentByStatus.maintenance;
          const percent =
            totalRooms > 0 ? Math.round((item.value / totalRooms) * 100) : 0;

          return (
            <article
              key={item.label}
              onClick={() => {
                setStatus((prev) => (prev === item.key ? "all" : item.key));
                setPage(1);
              }}
              className={`group cursor-pointer rounded-2xl border p-4 transition-all duration-200 select-none ${
                isActive
                  ? item.borderActive
                  : "border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-md shadow-2xs"
              }`}
              title={`Lọc phòng: ${item.label}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block size-2 rounded-full ${item.dotColor}`}
                  />
                  <p className="text-sm font-bold text-slate-700">
                    {item.label}
                  </p>
                </div>
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                    isActive ? item.iconActiveStyle : item.iconStyle
                  }`}
                >
                  <VsIcon name={item.icon} className="text-lg" />
                </span>
              </div>

              <div className="mt-2.5 flex items-baseline gap-1.5">
                <p
                  className={`text-3xl font-black tracking-tight ${item.tone}`}
                >
                  {item.value}
                </p>
                <span className="text-xs font-semibold text-slate-400">
                  phòng
                </span>
              </div>

              <div
                className={`mt-3 flex items-center justify-between border-t pt-2 text-xs transition-colors ${
                  isActive ? "border-slate-200/60" : "border-slate-100"
                }`}
              >
                <span className="font-medium text-slate-500">
                  {item.description}
                </span>
                {totalRooms > 0 ? (
                  <span className="font-semibold text-slate-400">
                    {percent}%
                  </span>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>

      <section className="sticky top-0 z-20 -mx-2 rounded-2xl border border-slate-200/90 bg-white/95 p-3.5 shadow-sm backdrop-blur-md md:top-2 space-y-3 transition-shadow hover:shadow-md">
        {!isHousekeeping ? (
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
            {/* Timeline & Business Date Selection */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              <div className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white p-1 shadow-2xs transition-all hover:border-slate-300">
                <div
                  className="flex items-center gap-1.5 px-2 text-slate-600 select-none"
                  title="Ngày vận hành khách sạn"
                >
                  <VsIcon
                    name="calendar"
                    className="text-base text-slate-500"
                  />
                  <span className="text-xs font-bold text-slate-600 hidden sm:inline whitespace-nowrap">
                    Ngày vận hành:
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => stepBusinessDate(-1)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition cursor-pointer"
                  title="Ngày trước"
                  aria-label="Ngày trước"
                >
                  <VsIcon name="chevron_left" className="text-base" />
                </button>

                <input
                  id="rooms-business-date"
                  name="businessDate"
                  aria-label="Chọn ngày vận hành khách sạn"
                  type="date"
                  value={businessDate}
                  onChange={(e) => handleBusinessDateChange(e.target.value)}
                  className="h-8 rounded-lg bg-slate-50 hover:bg-white px-2 text-xs sm:text-sm font-bold text-slate-800 border border-slate-200/90 outline-none cursor-pointer hover:border-slate-300 focus:border-sky-600 focus:bg-white focus:ring-2 focus:ring-sky-500/15 transition"
                  title="Chọn ngày vận hành khách sạn (Xem sơ đồ phòng & lịch lưu trú)"
                />

                <button
                  type="button"
                  onClick={() => stepBusinessDate(1)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition cursor-pointer"
                  title="Ngày sau"
                  aria-label="Ngày sau"
                >
                  <VsIcon name="chevron_right" className="text-base" />
                </button>

                <div className="ml-1 flex h-8 items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 border border-slate-200/70">
                  <button
                    type="button"
                    onClick={() => handleBusinessDateChange(todayYmd)}
                    className={`h-full rounded-md px-3 text-xs font-bold transition cursor-pointer ${
                      businessDate === todayYmd
                        ? "bg-sky-600 text-white shadow-xs font-black"
                        : "text-slate-600 hover:text-slate-950 hover:bg-white/80"
                    }`}
                  >
                    Hôm nay
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBusinessDateChange(tomorrowYmd)}
                    className={`h-full rounded-md px-3 text-xs font-bold transition cursor-pointer ${
                      businessDate === tomorrowYmd
                        ? "bg-sky-600 text-white shadow-xs font-black"
                        : "text-slate-600 hover:text-slate-950 hover:bg-white/80"
                    }`}
                  >
                    Ngày mai
                  </button>
                </div>
              </div>

              {isFutureDate ? (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50/90 px-3 py-2 text-xs font-bold text-amber-900 shadow-2xs">
                  <VsIcon
                    name="schedule"
                    className="text-sm text-amber-700 shrink-0"
                  />
                  <span>Sơ đồ phòng dự kiến tương lai</span>
                </span>
              ) : null}
            </div>

            {/* Reception Operational Actions */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Layout Switcher: Sơ đồ phòng vs Kế hoạch phòng (Tape Chart) */}
              <div className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-slate-100 p-1 shadow-2xs">
                <button
                  type="button"
                  onClick={() => handleOperationalViewModeChange("grid")}
                  className={`inline-flex h-full items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition cursor-pointer ${
                    operationalViewMode === "grid"
                      ? "bg-white text-sky-800 shadow-xs font-black border border-slate-200"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                  }`}
                  title="Xem dạng Sơ đồ lưới phòng khách sạn"
                >
                  <VsIcon name="grid_view" className="text-sm" />
                  <span className="whitespace-nowrap">Sơ đồ phòng</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOperationalViewModeChange("tape-chart")}
                  className={`inline-flex h-full items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition cursor-pointer ${
                    operationalViewMode === "tape-chart"
                      ? "bg-white text-purple-800 shadow-xs font-black border border-slate-200"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                  }`}
                  title="Xem dạng Kế hoạch phòng trực quan theo trục thời gian (Tape Chart)"
                >
                  <VsIcon name="calendar_view_week" className="text-sm" />
                  <span className="whitespace-nowrap">Kế hoạch phòng</span>
                </button>
              </div>

              <button
                type="button"
                onClick={openBulkReservationModal}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-purple-700 hover:bg-purple-800 active:bg-purple-900 px-3.5 text-sm font-bold text-white whitespace-nowrap shadow-xs border border-purple-800/40 transition cursor-pointer min-h-[40px]"
                title="Đặt trước nhanh theo số lượng loại phòng hoặc chọn phòng theo đoàn"
              >
                <VsIcon name="group_add" className="text-base" />
                <span>Đặt trước nhanh / Đoàn</span>
              </button>
              {/* Daily Arrivals & Departures Movements Button Group */}
              <div className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white p-1 shadow-2xs gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setDailyMovementsTab("arrivals");
                    setIsDailyMovementsOpen(true);
                  }}
                  className="inline-flex h-full items-center gap-1.5 rounded-lg px-2.5 sm:px-3 text-xs font-bold transition hover:bg-emerald-50 text-emerald-800 cursor-pointer min-h-[32px]"
                  title="Danh sách khách đến trong ngày (Nhận phòng IN, Gán/Tráo phòng, Sửa booking)"
                >
                  <VsIcon name="login" className="text-sm text-emerald-600" />
                  <span className="whitespace-nowrap">Khách đến</span>
                  <span className="rounded-full bg-emerald-100 text-emerald-800 px-1.5 py-0.2 text-xs font-black">
                    {todayArrivalsList.length}
                  </span>
                </button>
                <div className="h-4 w-px bg-slate-200" />
                <button
                  type="button"
                  onClick={() => {
                    setDailyMovementsTab("departures");
                    setIsDailyMovementsOpen(true);
                  }}
                  className="inline-flex h-full items-center gap-1.5 rounded-lg px-2.5 sm:px-3 text-xs font-bold transition hover:bg-amber-50 text-amber-800 cursor-pointer min-h-[32px]"
                  title="Danh sách khách đi trong ngày (Trả phòng OUT, Gia hạn, Đổi phòng)"
                >
                  <VsIcon name="logout" className="text-sm text-amber-600" />
                  <span className="whitespace-nowrap">Khách đi</span>
                  <span className="rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.2 text-xs font-black">
                    {todayDeparturesList.length}
                  </span>
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Search & Filter Toolbar */}
        <div
          className={`flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5 sm:gap-3 ${
            !isHousekeeping ? "border-t border-slate-200 pt-3" : ""
          }`}
        >
          {/* Left: Search Input + Filter Selects + Reset Button */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 flex-1 min-w-0">
            {/* Search Input */}
            <div className="relative w-full sm:w-64 md:w-80 lg:w-96 min-w-0">
              <VsIcon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-slate-500"
              />
              <input
                id="rooms-search-query"
                name="searchQuery"
                aria-label="Tìm số phòng, tên khách, SĐT"
                value={inputQuery}
                onChange={(event) => setInputQuery(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-300 hover:border-slate-400 bg-white pl-9.5 pr-8 text-sm font-semibold text-slate-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-500/20 shadow-2xs min-h-[40px] placeholder:text-slate-400 transition"
                placeholder="Tìm số phòng, tên khách, SĐT..."
              />
              {inputQuery ? (
                <button
                  type="button"
                  onClick={() => setInputQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 rounded-full hover:bg-slate-100 cursor-pointer transition"
                  title="Xóa tìm kiếm"
                >
                  <VsIcon name="close" className="text-sm" />
                </button>
              ) : null}
            </div>

            {/* Floor Select */}
            <select
              id="rooms-floor-filter"
              name="floorFilter"
              aria-label="Lọc theo tầng"
              value={floor}
              onChange={(event) => {
                setFloor(event.target.value);
                setPage(1);
              }}
              className="h-10 shrink-0 rounded-xl border border-slate-300 hover:border-slate-400 bg-white px-3 text-sm font-bold text-slate-800 focus:border-sky-600 focus:ring-2 focus:ring-sky-500/20 shadow-2xs min-w-[125px] cursor-pointer transition min-h-[40px]"
            >
              <option value="all">Tầng: Tất cả</option>
              {floors.map((value) => (
                <option key={value} value={value}>
                  Tầng {value}
                </option>
              ))}
            </select>

            {/* Room Type Select */}
            <select
              id="rooms-type-filter"
              name="typeFilter"
              aria-label="Lọc theo loại phòng"
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                setPage(1);
              }}
              className="h-10 shrink-0 rounded-xl border border-slate-300 hover:border-slate-400 bg-white px-3 text-sm font-bold text-slate-800 focus:border-sky-600 focus:ring-2 focus:ring-sky-500/20 shadow-2xs min-w-[155px] cursor-pointer transition min-h-[40px]"
            >
              <option value="all">Loại phòng: Tất cả</option>
              {types.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>

            {/* Zone Select */}
            <select
              id="rooms-zone-filter"
              name="zoneFilter"
              aria-label="Lọc theo phân khu"
              value={zone}
              onChange={(event) => {
                setZone(event.target.value);
                setPage(1);
              }}
              className="h-10 shrink-0 rounded-xl border border-slate-300 hover:border-slate-400 bg-white px-3 text-sm font-bold text-slate-800 focus:border-sky-600 focus:ring-2 focus:ring-sky-500/20 shadow-2xs min-w-[145px] cursor-pointer transition min-h-[40px]"
            >
              <option value="all">Phân khu: Tất cả</option>
              {zones.map((value) => (
                <option key={value} value={value}>
                  Khu {value}
                </option>
              ))}
            </select>

            {/* Status Select */}
            <select
              id="rooms-status-filter"
              name="statusFilter"
              aria-label="Lọc theo trạng thái phòng"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as RoomStatusFilter);
                setPage(1);
              }}
              className="h-10 shrink-0 rounded-xl border border-slate-300 hover:border-slate-400 bg-white px-3 text-sm font-bold text-slate-800 focus:border-sky-600 focus:ring-2 focus:ring-sky-500/20 shadow-2xs min-w-[160px] cursor-pointer transition min-h-[40px]"
            >
              {statusFilters.map((item) => (
                <option key={item.value} value={item.value}>
                  Trạng thái: {item.label}
                </option>
              ))}
            </select>

            {/* Reset Filters Button */}
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-rose-300 hover:border-rose-400 bg-rose-50 hover:bg-rose-100 px-3.5 text-xs font-bold text-rose-800 shadow-2xs transition cursor-pointer min-h-[40px]"
                title="Đặt lại toàn bộ bộ lọc"
              >
                <VsIcon name="restart_alt" className="text-sm shrink-0" />
                <span>Xóa lọc</span>
              </button>
            ) : null}
          </div>

          {/* Right: Room counter badge & Quick Refresh button */}
          <div className="flex items-center gap-2 shrink-0 self-end lg:self-auto">
            <div className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-2xs min-h-[40px]">
              <VsIcon
                name={hasActiveFilters ? "filter_alt" : "meeting_room"}
                className={`text-sm ${hasActiveFilters ? "text-sky-600" : "text-slate-400"}`}
              />
              <span>
                {hasActiveFilters ? (
                  <>
                    Kết quả:{" "}
                    <strong className="font-black text-sky-900">
                      {filteredRooms.length}
                    </strong>
                    /{totalItems} phòng
                  </>
                ) : (
                  <>
                    Tổng:{" "}
                    <strong className="font-black text-slate-950">
                      {totalItems}
                    </strong>{" "}
                    phòng
                  </>
                )}
              </span>
            </div>

            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 px-3.5 text-xs font-bold text-slate-700 hover:text-slate-950 shadow-2xs transition cursor-pointer min-h-[40px] disabled:opacity-50"
              title="Cập nhật trạng thái phòng tức thời"
            >
              <VsIcon
                name="refresh"
                className={`text-base ${isFetching ? "animate-spin text-sky-600" : "text-slate-500"}`}
              />
              <span className="hidden sm:inline">Làm mới</span>
            </button>
          </div>
        </div>
      </section>

      {/* Operational Body: Tape Chart View vs Room Grid/Tasklist View */}
      {operationalViewMode === "tape-chart" ? (
        <TapeChartView
          hotelId={hotelId}
          rooms={rooms}
          arrivalsList={arrivalsList}
          businessDate={businessDate}
          initialStartDate={initialStartDate}
          initialViewMode={initialViewMode}
          canCheckInStay={canCheckInStay}
          canManageRooms={canManageRooms}
          readOnly={false}
          roleScope="staff"
          onSelectRoom={(room) => {
            const fullRoom =
              rooms.find((r) => r.id === room.id) ??
              (room as unknown as HotelRoomSummary);
            setSelectedRoom(fullRoom);
          }}
          onToggleRoomBlocked={async (room) => {
            const fullRoom =
              rooms.find((r) => r.id === room.id) ??
              (room as unknown as HotelRoomSummary);
            await toggleRoomBlocked(fullRoom);
          }}
          onProcessingRoomClick={async (room) => {
            const fullRoom =
              rooms.find((r) => r.id === room.id) ??
              (room as unknown as HotelRoomSummary);
            await handleProcessingRoomClick(fullRoom);
          }}
          onOpenCheckIn={(room) => {
            setSelectedRoom(room);
            setActiveReservationCheckIn(null);
            setCustomCheckInInitialFields(null);
            setSubmitError(undefined);
            setIsCheckInOpen(true);
          }}
          onCheckInReservation={(block) => {
            const room = rooms.find((r) => r.id === block.roomId);
            if (!room) {
              void showWarningAlert(
                "Không tìm thấy phòng",
                "Phòng được gán không tồn tại trong danh sách phòng.",
              );
              return;
            }
            const matchingArrival = arrivalsList?.find(
              (a) => a.id === block.reservationId || a.reservationCode === block.reservationCode,
            );
            if (matchingArrival) {
              handleCheckInArrival(matchingArrival);
            } else {
              handleCheckInReservationGeneric(room, {
                guestDisplayName: block.guestName,
                guestPhone: block.phone,
                plannedCheckOutAt: `${block.endDate}T12:00:00+07:00`,
                reservationCode: block.reservationCode || undefined,
                arrival: null,
              });
            }
          }}
          onOpenQuickReservation={(room, initialDate, initialEndDate) => {
            if (room) {
              setReservationRoomId(room.id);
              setInitialReservationRoomId(room.id);
              const roomPrice =
                room && "price" in room && typeof (room as unknown as { price?: number }).price === "number" && ((room as unknown as { price?: number }).price ?? 0) > 0
                  ? String((room as unknown as { price?: number }).price)
                  : "";
              setReservationNightlyRate(roomPrice);
            }
            if (initialDate) {
              setReservationCheckIn(`${initialDate}T14:00`);
              if (initialEndDate) {
                setReservationCheckOut(`${initialEndDate}T12:00`);
              } else {
                const d = new Date(initialDate);
                d.setDate(d.getDate() + 1);
                const nextDay = d.toISOString().slice(0, 10);
                setReservationCheckOut(`${nextDay}T12:00`);
              }
            }
            setIsReservationOpen(true);
          }}
          onOpenBulkReservation={(selectedRooms, checkInDate, checkOutDate) => {
            setBulkMode("manual");
            setBulkSelectedRoomIds(new Set(selectedRooms.map((r) => r.id)));
            setBulkCheckInDate(checkInDate);
            setBulkCheckOutDate(checkOutDate);
            setBulkLeadName("");
            setBulkRoomCustomPrices({});
            setBulkUniformPrice("");
            setIsBulkModalOpen(true);
          }}
          onCheckOutStay={async (stayId, roomNum) => {
            try {
              // Tìm active folio của lượt lưu trú để điều hướng chính xác vào Folio thanh toán
              const activeFolioRes = await requestInternalApiEnvelope<{ id?: string; folioNumber?: string }>(
                `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/billing/stays/${encodeURIComponent(stayId)}/active-folio`,
                { method: "GET" },
              ).catch(() => null);

              const folioId = activeFolioRes?.data?.id;
              const params = new URLSearchParams();
              if (folioId) params.set("folioId", folioId);
              params.set("stayId", stayId);
              if (roomNum) params.set("roomNumber", roomNum);

              const routePrefix = baseRoutePrefix ?? "/hotels";
              if (typeof window !== "undefined") {
                window.open(`${routePrefix}/${encodeURIComponent(hotelId)}/billing?${params.toString()}`, "_blank");
              }
            } catch {
              const routePrefix = baseRoutePrefix ?? "/hotels";
              if (typeof window !== "undefined") {
                window.open(
                  `${routePrefix}/${encodeURIComponent(hotelId)}/billing?stayId=${encodeURIComponent(stayId)}&roomNumber=${encodeURIComponent(roomNum)}`,
                  "_blank",
                );
              }
            }
          }}
          onRefresh={() => {
            void refetch();
          }}
        />
      ) : (
        <section className="relative min-h-[400px] flex flex-col justify-between">
        <div className="relative flex-1">
          {isFetching && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 backdrop-blur-[1px] rounded-xl transition-all">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
            </div>
          )}

          {/* Floor Navigation & Horizontal Layout Toolbar */}
          {roomsByFloor.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white/90 p-2.5 sm:px-4 shadow-2xs backdrop-blur-xs">
              {/* Left: Quick Floor Jump Pills */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs font-black text-slate-700 mr-1 pl-1 whitespace-nowrap">
                  <VsIcon name="apartment" className="text-sm text-sky-600" />
                  <span>Xem nhanh tầng:</span>
                </span>

                <button
                  type="button"
                  onClick={() => {
                    if (floor !== "all") {
                      setFloor("all");
                    }
                    setSelectedFloorTab("all");
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    activeFloorTab === "all"
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900"
                  }`}
                  title="Hiển thị tất cả các tầng"
                >
                  <span>Tất cả</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-xs font-black ${
                      activeFloorTab === "all"
                        ? "bg-white/20 text-white"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {filteredRooms.length}
                  </span>
                </button>

                {roomsByFloor.map(([floorTitle, floorRooms]) => {
                  const isActive = activeFloorTab === floorTitle;
                  return (
                    <button
                      key={floorTitle}
                      type="button"
                      onClick={() => {
                        if (floor !== "all") {
                          setFloor("all");
                        }
                        setSelectedFloorTab(isActive ? "all" : floorTitle);
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition-all cursor-pointer whitespace-nowrap shadow-2xs ${
                        isActive
                          ? "bg-sky-700 text-white border border-sky-700 shadow-xs"
                          : "bg-sky-50 text-sky-800 hover:bg-sky-100 border border-sky-200/80"
                      }`}
                      title={
                        isActive
                          ? `Đang xem: ${floorTitle} (Nhấn để xem tất cả)`
                          : `Chỉ hiển thị ${floorTitle}`
                      }
                    >
                      <span>{floorTitle}</span>
                      <span
                        className={`rounded-full px-1.5 py-0.2 text-xs font-black ${
                          isActive
                            ? "bg-white/25 text-white"
                            : "bg-white text-sky-900 border border-sky-200"
                        }`}
                      >
                        {floorRooms.length}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Right: Layout indicator (1 hàng 1 tầng · Cuộn ngang) */}
              <div className="flex items-center gap-2 ml-auto">
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 border border-slate-200/80 px-3 py-1.5 text-xs font-bold text-slate-700 whitespace-nowrap">
                  <VsIcon name="swap_horiz" className="text-sm text-sky-600" />
                  <span>1 hàng 1 tầng · Cuộn ngang</span>
                </span>
              </div>
            </div>
          )}

          {isHousekeeping && housekeepingViewMode === "tasklist" ? (
            <div className="space-y-6">
              {displayedRoomsByFloor.map(([floorTitle, floorRooms]) => {
                const processingCount = floorRooms.filter(
                  (r) => getEffectiveRoomStatus(r, false) === "processing",
                ).length;
                const isExpanded = expandedFloors.has(floorTitle);
                const isCollapsed = !isExpanded;

                return (
                  <div
                    key={floorTitle}
                    id={`floor-group-${encodeURIComponent(floorTitle)}`}
                    className="space-y-3 scroll-mt-36"
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleFloorCollapse(floorTitle)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleFloorCollapse(floorTitle);
                        }
                      }}
                      className="group flex items-center justify-between border-b border-slate-200 pb-2 cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
                          <VsIcon
                            name={isCollapsed ? "expand_more" : "expand_less"}
                            className="text-base"
                          />
                        </span>
                        <h3 className="font-extrabold text-base text-slate-900 text-balance">
                          {floorTitle}
                        </h3>
                        <span className="text-xs text-slate-500 font-semibold whitespace-nowrap">
                          ({floorRooms.length} phòng)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {processingCount > 0 ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 px-3 py-0.5 text-xs font-black whitespace-nowrap">
                            <VsIcon
                              name="cleaning_services"
                              className="text-xs"
                            />
                            <span>{processingCount} phòng cần dọn</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-800 text-xs font-bold whitespace-nowrap">
                            <VsIcon name="check" className="text-sm" />
                            <span>Đã dọn xong</span>
                          </span>
                        )}
                        <span className="flex size-7 items-center justify-center rounded-lg bg-slate-100 group-hover:bg-slate-200 transition">
                          <VsIcon
                            name={isCollapsed ? "expand_more" : "expand_less"}
                            className="text-base text-slate-600"
                          />
                        </span>
                      </div>
                    </div>

                    {!isCollapsed ? (
                      <div className="space-y-2.5">
                        {floorRooms.map((room) =>
                          renderHousekeepingTaskCard(room),
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-5">
              {displayedRoomsByFloor.map(([floorTitle, floorRooms]) => {
                const availableCount = floorRooms.filter(
                  (r) => getEffectiveRoomStatus(r, isFutureDate) === "available",
                ).length;
                const occupiedCount = floorRooms.filter(
                  (r) => getEffectiveRoomStatus(r, isFutureDate) === "occupied",
                ).length;
                const reservedCount = floorRooms.filter(
                  (r) => getEffectiveRoomStatus(r, isFutureDate) === "reserved",
                ).length;
                const processingCount = floorRooms.filter(
                  (r) => getEffectiveRoomStatus(r, isFutureDate) === "processing",
                ).length;
                const overdueCount = floorRooms.filter(
                  (r) => getEffectiveRoomStatus(r, isFutureDate) === "overdue",
                ).length;
                const maintenanceCount = floorRooms.filter((r) => {
                  const s = getEffectiveRoomStatus(r, isFutureDate);
                  return s === "maintenance" || s === "blocked";
                }).length;

                return (
                  <div
                    key={floorTitle}
                    id={`floor-group-${encodeURIComponent(floorTitle)}`}
                    className="scroll-mt-36 rounded-2xl border border-slate-200/90 bg-white/80 p-3 sm:p-4 shadow-2xs backdrop-blur-xs"
                  >
                    {/* Floor Header Bar (1 Hàng 1 Tầng - Bỏ accordion/dropdown) */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                      {/* Left: Floor Badge & Title & Status Breakdown Pills */}
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <div className="flex items-center gap-2">
                          <span className="flex size-7 items-center justify-center rounded-lg bg-sky-100 text-sky-800 font-black text-xs">
                            <VsIcon name="apartment" className="text-sm" />
                          </span>
                          <h3 className="font-black text-sm sm:text-base text-slate-900 tracking-tight text-balance">
                            {floorTitle}
                          </h3>
                          <span className="text-xs text-slate-500 font-bold whitespace-nowrap">
                            ({floorRooms.length} phòng)
                          </span>
                        </div>

                        {/* Status Breakdown Pills */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {availableCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/80 px-2.5 py-0.5 text-xs font-bold whitespace-nowrap">
                              <span className="size-1.5 rounded-full bg-emerald-500" />
                              {availableCount} sẵn sàng
                            </span>
                          )}
                          {occupiedCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-800 border border-blue-200/80 px-2.5 py-0.5 text-xs font-bold whitespace-nowrap">
                              <span className="size-1.5 rounded-full bg-blue-500" />
                              {occupiedCount} đang ở
                            </span>
                          )}
                          {reservedCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 text-purple-800 border border-purple-200/80 px-2.5 py-0.5 text-xs font-bold whitespace-nowrap">
                              <span className="size-1.5 rounded-full bg-purple-500" />
                              {reservedCount} đặt trước
                            </span>
                          )}
                          {processingCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200/80 px-2.5 py-0.5 text-xs font-bold whitespace-nowrap">
                              <span className="size-1.5 rounded-full bg-amber-500" />
                              {processingCount} chờ dọn
                            </span>
                          )}
                          {overdueCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-900 border border-rose-200/80 px-2.5 py-0.5 text-xs font-bold whitespace-nowrap">
                              <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" />
                              {overdueCount} quá hạn
                            </span>
                          )}
                          {maintenanceCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-0.5 text-xs font-bold whitespace-nowrap">
                              <span className="size-1.5 rounded-full bg-slate-400" />
                              {maintenanceCount} khóa/bảo trì
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: Scroll Navigation Controls */}
                      <div className="flex items-center gap-1.5 ml-auto">
                        <button
                          type="button"
                          onClick={() => scrollFloorRow(floorTitle, -300)}
                          className="flex size-7 sm:size-8 items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 shadow-2xs transition active:scale-95 cursor-pointer"
                          title="Cuộn sang trái"
                        >
                          <VsIcon
                            name="chevron_left"
                            className="text-base sm:text-lg"
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => scrollFloorRow(floorTitle, 300)}
                          className="flex size-7 sm:size-8 items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 shadow-2xs transition active:scale-95 cursor-pointer"
                          title="Cuộn sang phải"
                        >
                          <VsIcon
                            name="chevron_right"
                            className="text-base sm:text-lg"
                          />
                        </button>
                      </div>
                    </div>

                    {/* Room Single Row (1 hàng 1 tầng - cuộn ngang) */}
                    <div
                      ref={(el) => {
                        if (el) floorScrollRefMap.current.set(floorTitle, el);
                        else floorScrollRefMap.current.delete(floorTitle);
                      }}
                      className="mt-3.5 flex gap-3.5 overflow-x-auto overflow-y-hidden pb-3 pt-1 scroll-smooth snap-x"
                    >
                      {floorRooms.map((room) => (
                        <div
                          key={room.id}
                          className="flex w-[270px] sm:w-[285px] shrink-0 snap-start"
                        >
                          {renderRoomCard(room)}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {filteredRooms.length === 0 && !isFetching ? (
            isUnassigned ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
                <VsIcon
                  name="warning"
                  className="text-3xl text-amber-600 mb-2 inline-block"
                />
                <h3 className="font-bold text-base text-amber-950">
                  Chưa gán phòng — tài khoản chưa thể thao tác vận hành
                </h3>
                <p className="mt-1 text-xs text-amber-800 max-w-md mx-auto">
                  Khách sạn này áp dụng mô hình phân quyền độc quyền phòng. Vui
                  lòng liên hệ Chủ khách sạn (Owner) để được gán phòng phụ
                  trách.
                </p>
              </div>
            ) : isHousekeeping &&
              status === "processing" &&
              !inputQuery &&
              floor === "all" &&
              type === "all" ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-8 text-center shadow-2xs mt-4">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-xs mb-3">
                  <VsIcon
                    name="task_alt"
                    className="text-3xl text-emerald-700"
                  />
                </div>
                <p className="font-extrabold text-lg text-emerald-950">
                  Toàn bộ buồng phòng đã được dọn sạch sẽ!
                </p>
                <p className="mt-1.5 text-xs sm:text-sm text-emerald-800 max-w-md mx-auto">
                  Hiện tại không có phòng nào đang chờ dọn dẹp trong ca trực.
                  Tất cả các phòng đã sẵn sàng hoặc đang có khách lưu trú.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStatus("all");
                      setPage(1);
                    }}
                    className="inline-flex h-9.5 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white px-4 text-xs font-bold shadow-xs transition cursor-pointer"
                  >
                    <VsIcon name="grid_view" className="text-sm" />
                    <span>Xem tất cả các phòng</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void refetch()}
                    className="inline-flex h-9.5 items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-800 px-4 text-xs font-bold shadow-2xs transition cursor-pointer"
                  >
                    <VsIcon name="refresh" className="text-sm" />
                    <span>Kiểm tra lại</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-2xs mt-4">
                <VsIcon
                  name="search_off"
                  className="text-3xl text-slate-400 mb-2 inline-block"
                />
                <p className="font-bold text-base text-slate-800">
                  Không tìm thấy phòng phù hợp
                </p>
                <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
                  Không có phòng nào khớp với từ khóa tìm kiếm hoặc các tiêu chí
                  bộ lọc đã chọn. Vui lòng thử đổi tên khách, số phòng hoặc đặt
                  lại bộ lọc.
                </p>
                {hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="mt-3.5 inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 px-3.5 text-xs font-bold text-slate-700 transition cursor-pointer"
                  >
                    <VsIcon name="restart_alt" className="text-sm" />
                    <span>Đặt lại bộ lọc</span>
                  </button>
                ) : null}
              </div>
            )
          ) : null}
        </div>

        {/* Pagination & Display Controls */}
        {totalPages > 1 && (
          <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-slate-300 bg-white p-3.5 sm:px-5 shadow-2xs">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
              <div className="flex items-center gap-1.5 font-bold">
                <span>Hiển thị</span>
                <strong className="text-slate-950 font-black">
                  {totalItems === 0
                    ? 0
                    : `${(page - 1) * pageSize + 1} - ${Math.min(page * pageSize, totalItems)}`}
                </strong>
                <span>trên</span>
                <strong className="text-slate-950 font-black">
                  {totalItems}
                </strong>
                <span>phòng</span>
              </div>

              <div className="flex items-center gap-1.5 pl-3 border-l border-slate-300">
                <label
                  htmlFor="room-page-size"
                  className="text-xs font-semibold text-slate-600"
                >
                  Mỗi trang:
                </label>
                <select
                  id="room-page-size"
                  value={pageSize}
                  onChange={(e) => {
                    const newSize = Number(e.target.value);
                    setPageSize(newSize);
                    setPage(1);
                  }}
                  className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-800 focus:border-blue-900 outline-none cursor-pointer"
                >
                  <option value={100}>100 phòng (Xem tất cả)</option>
                  <option value={50}>50 phòng</option>
                  <option value={30}>30 phòng</option>
                  <option value={25}>25 phòng</option>
                  <option value={15}>15 phòng</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-center sm:justify-end gap-2">
              {renderPaginationButtons(
                page,
                Math.max(1, totalPages),
                (newPage) => {
                  setPage(newPage);
                  window.scrollTo({ top: 380, behavior: "smooth" });
                },
              )}
            </div>
          </div>
        )}
      </section>
      )}

      {/* Guest QR Preview Portal */}
      {roomQrPreview
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/45 p-4 sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="staff-room-qr-title"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  setRoomQrPreview(null);
                }
              }}
            >
              <div className="my-auto w-full max-w-md rounded-2xl bg-white p-5 text-center shadow-2xl sm:p-6">
                <div className="flex items-start justify-between gap-4 text-left">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--secondary)]">
                      GuestOS đang hoạt động
                    </p>
                    <h2
                      id="staff-room-qr-title"
                      className="vs-display mt-1 text-2xl font-semibold text-[var(--primary)]"
                    >
                      QR phòng {getRoomNumber(roomQrPreview.room)}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
                      {isFutureDate
                        ? "Mã QR GuestOS của phòng"
                        : (roomQrPreview.room.activeStay?.guestDisplayName ??
                          "Khách đang lưu trú")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRoomQrPreview(null)}
                    aria-label="Đóng mã QR phòng"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--primary)] transition hover:bg-[var(--surface-container-low)] min-h-[44px]"
                  >
                    <VsIcon name="close" />
                  </button>
                </div>

                {roomQrPreview.guestUrl ? (
                  <>
                    <p className="mt-3 text-center text-sm font-black uppercase tracking-[0.16em] text-[var(--primary)]">
                      Phòng {getRoomNumber(roomQrPreview.room)}
                    </p>
                    <div className="mx-auto mt-0 flex aspect-square w-full max-w-72 items-center justify-center rounded-2xl border border-[var(--outline-variant)] bg-white p-4">
                      <BrandedRoomQr
                        value={roomQrPreview.guestUrl}
                        size={256}
                        className="h-full w-full"
                        title={`QR GuestOS phòng ${getRoomNumber(roomQrPreview.room)}`}
                      />
                    </div>
                    <p className="mt-4 break-all rounded-xl bg-[var(--surface-container-low)] px-4 py-3 text-xs font-semibold text-[var(--primary)]">
                      {roomQrPreview.guestUrl}
                    </p>
                    <p className="mt-3 text-sm text-[var(--on-surface-variant)]">
                      Khách quét mã này để mở GuestOS của phòng đang lưu trú.
                    </p>
                  </>
                ) : (
                  <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-950">
                    <p className="font-bold">Phòng chưa có QR GuestOS.</p>
                    <p className="mt-1">
                      Vui lòng nhờ quản lý kích hoạt QR trước khi đưa cho khách.
                    </p>
                  </div>
                )}

                {!isFutureDate && roomQrPreview.room.activeStay ? (
                  <StayOccupantsViewer stay={roomQrPreview.room.activeStay} />
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* Check-in Workspace (Walk-in & Reservation) */}
      {isCheckInOpen && selectedRoom ? (
        <CheckInWorkspace
          key={selectedRoom.id}
          open={isCheckInOpen}
          hotelId={hotelId}
          room={{
            id: selectedRoom.id,
            roomNumber: getRoomNumber(selectedRoom),
            type: selectedRoom.type ?? undefined,
            maxOccupancy: selectedRoom.maxOccupancy,
            status: "available",
          }}
          canManageStays={canManageStays}
          enabledFeatures={enabledFeatures}
          initialStayFields={
            customCheckInInitialFields ?? {
              plannedCheckOutAt: localDateTime(1, 12),
            }
          }
          submitState={saving ? "submitting" : "idle"}
          submitError={submitError}
          onSubmit={submitWalkIn}
          onClose={() => {
            if (saving) return;
            setIsCheckInOpen(false);
            setSelectedRoom(null);
            setActiveReservationCheckIn(null);
            setCustomCheckInInitialFields(null);
            setSubmitError(undefined);
          }}
        />
      ) : null}

      {/* Arrivals Modal Portal */}
      {isArrivalsOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/50 p-4 sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="arrivals-modal-title"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setIsArrivalsOpen(false);
              }}
            >
              <div className="my-auto w-full max-w-4xl lg:max-w-5xl rounded-3xl bg-white p-6 shadow-2xl sm:p-7 text-left">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 pb-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">
                      Lịch đón khách đặt trước
                    </p>
                    <h2
                      id="arrivals-modal-title"
                      className="vs-display mt-1 text-2xl font-bold text-slate-900"
                    >
                      Danh sách khách đặt trước
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsArrivalsOpen(false)}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                    aria-label="Đóng hộp thoại"
                  >
                    <VsIcon name="close" className="text-xl" />
                  </button>
                </div>

                {/* Date Range Tabs */}
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setArrivalsRange("today");
                      void loadArrivals("today");
                    }}
                    className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition min-h-[40px] cursor-pointer ${
                      arrivalsRange === "today"
                        ? "bg-sky-700 text-white shadow-2xs"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200/70"
                    }`}
                  >
                    Hôm nay
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setArrivalsRange("tomorrow");
                      void loadArrivals("tomorrow");
                    }}
                    className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition min-h-[40px] cursor-pointer ${
                      arrivalsRange === "tomorrow"
                        ? "bg-sky-700 text-white shadow-2xs"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200/70"
                    }`}
                  >
                    Ngày mai
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setArrivalsRange("week");
                      void loadArrivals("week");
                    }}
                    className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition min-h-[40px] cursor-pointer ${
                      arrivalsRange === "week"
                        ? "bg-sky-700 text-white shadow-2xs"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200/70"
                    }`}
                  >
                    7 ngày tới
                  </button>
                </div>

                {/* Table */}
                <div className="mt-5 max-h-[60vh] overflow-y-auto overflow-x-auto rounded-2xl border border-slate-200 shadow-2xs">
                  {arrivalsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-700 border-t-transparent" />
                    </div>
                  ) : arrivalsList.length === 0 ? (
                    <div className="p-10 text-center text-sm text-slate-500 bg-slate-50/50">
                      Không có khách đặt trước trong khoảng thời gian đã chọn.
                    </div>
                  ) : (
                    <table className="w-full min-w-[640px] border-collapse text-left">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                          <th scope="col" className="px-4 py-2.5">
                            Khách hàng
                          </th>
                          <th scope="col" className="px-4 py-2.5">
                            Phòng
                          </th>
                          <th
                            scope="col"
                            className="px-4 py-2.5 whitespace-nowrap"
                          >
                            Dự kiến nhận
                          </th>
                          <th
                            scope="col"
                            className="px-4 py-2.5 text-right whitespace-nowrap"
                          >
                            Thao tác
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {arrivalsList.map((arrival) => {
                          const isToday =
                            arrival.plannedCheckInAt?.slice(0, 10) === todayYmd;
                          return (
                            <tr
                              key={arrival.id}
                              tabIndex={0}
                              role="button"
                              aria-label={`Xem chi tiết đặt phòng của ${arrival.guestDisplayName}`}
                              onClick={() => {
                                void SwalVietSage.fire({
                                  title: `Chi tiết khách đặt trước`,
                                  html: `
                                <div style="font-size:14px;text-align:left;line-height:1.7;color:#334155">
                                  <p><strong>Khách hàng:</strong> ${arrival.guestDisplayName}</p>
                                  <p><strong>Điện thoại:</strong> ${arrival.guestPhone || "Chưa có"}</p>
                                  <p><strong>Mã đặt phòng:</strong> ${arrival.reservationCode || arrival.id}</p>
                                  ${arrival.groupCode ? `<p><strong>Mã đoàn:</strong> ${arrival.groupCode}</p>` : ""}
                                  <p><strong>Phòng:</strong> ${arrival.room?.roomNumber ? `Phòng ${arrival.room?.roomNumber}` : "Chưa gán phòng"}</p>
                                  <p><strong>Thời gian nhận phòng:</strong> ${formatDateTime(arrival.plannedCheckInAt)}</p>
                                  <p><strong>Thời gian trả phòng:</strong> ${formatDateTime(arrival.plannedCheckOutAt)}</p>
                                  <p><strong>Giá phòng:</strong> ${arrival.rate || arrival.nightlyRateSnapshot ? formatMoney({ price: Number(arrival.rate || arrival.nightlyRateSnapshot) || null, currency: "VND" }) : "Giá linh hoạt"}</p>
                                  <p><strong>Trạng thái:</strong> ${arrival.status || "CONFIRMED"}</p>
                                </div>
                              `,
                                  confirmButtonText: "Đóng",
                                });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.currentTarget.click();
                                }
                              }}
                              className="group cursor-pointer transition-colors hover:bg-blue-50/70 focus-visible:bg-blue-50/80 focus-visible:outline-none"
                            >
                              {/* Khách hàng */}
                              <td className="px-4 py-3 align-middle">
                                <div className="font-bold text-slate-900 text-sm leading-tight group-hover:text-blue-900 transition-colors">
                                  {arrival.guestDisplayName}
                                </div>
                                {arrival.guestPhone ? (
                                  <div className="mt-0.5 text-xs text-slate-500 font-medium">
                                    {arrival.guestPhone}
                                  </div>
                                ) : null}
                              </td>

                              {/* Phòng */}
                              <td className="px-4 py-3 align-middle whitespace-nowrap">
                                {arrival.room?.roomNumber ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-xs font-bold">
                                    <VsIcon
                                      name="meeting_room"
                                      className="h-3 w-3 text-emerald-600"
                                    />
                                    Phòng {arrival.room.roomNumber}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 text-xs font-bold">
                                    <VsIcon
                                      name="warning"
                                      className="h-3 w-3 text-amber-600"
                                    />
                                    Chưa gán phòng
                                  </span>
                                )}
                              </td>

                              {/* Dự kiến nhận */}
                              <td className="px-4 py-3 align-middle whitespace-nowrap text-xs font-medium text-slate-700">
                                {formatDateTime(arrival.plannedCheckInAt)}
                              </td>

                              {/* Thao tác */}
                              <td className="px-4 py-3 align-middle text-right whitespace-nowrap">
                                <div
                                  className="inline-flex items-center justify-end gap-2"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {canManageReservations ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleAssignRoom(arrival)
                                      }
                                      className={`inline-flex h-8 items-center justify-center rounded-lg px-2.5 text-xs font-bold transition shadow-2xs cursor-pointer ${
                                        arrival.roomId
                                          ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                                          : "bg-amber-600 hover:bg-amber-700 text-white"
                                      }`}
                                    >
                                      {arrival.roomId
                                        ? "Đổi phòng"
                                        : "Gán phòng"}
                                    </button>
                                  ) : null}

                                  {/* Strictly no early check-in for tomorrow or later: only today with assigned room gets Check-in button */}
                                  {isToday &&
                                  canCheckInStay &&
                                  arrival.roomId ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleCheckInArrival(arrival)
                                      }
                                      className="inline-flex h-8 items-center justify-center rounded-lg bg-emerald-700 hover:bg-emerald-800 px-3 text-xs font-bold text-white transition shadow-2xs cursor-pointer"
                                    >
                                      Nhận phòng
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* Future Reservation Modal Portal */}
      {isReservationOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/50 p-4 sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="future-reservation-title"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget && !reservationSubmitting) {
                  setIsReservationOpen(false);
                }
              }}
            >
              <div className="my-auto w-full max-w-4xl lg:max-w-5xl rounded-3xl bg-white p-6 sm:p-7 shadow-2xl text-left max-h-[92vh] flex flex-col">
                <div className="flex items-start justify-between gap-4 border-b border-[var(--outline-variant)] pb-4 shrink-0">
                  <div>
                    <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">
                      {selectedReservationRoom?.type
                        ? `Đặt phòng trước · Hạng ${selectedReservationRoom.type}`
                        : "Đặt phòng trước"}
                    </p>
                    <h2
                      id="future-reservation-title"
                      className="vs-display mt-1 text-2xl sm:text-3xl font-bold text-[var(--primary)] text-balance"
                    >
                      {selectedReservationRoom
                        ? `Tạo lịch đặt trước phòng ${getRoomNumber(selectedReservationRoom)}`
                        : "Tạo lịch đặt phòng mới"}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!reservationSubmitting) setIsReservationOpen(false);
                    }}
                    disabled={reservationSubmitting}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 min-h-[44px] transition cursor-pointer"
                  >
                    <VsIcon name="close" />
                  </button>
                </div>

                <form
                  onSubmit={submitFutureReservation}
                  className="mt-4 flex-1 overflow-y-auto space-y-4 pr-1 min-h-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-purple-50 p-3 border border-purple-200">
                    <span className="text-xs font-semibold text-purple-900 text-pretty">
                      Cần đặt nhiều phòng hoặc theo đoàn cùng lúc?
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsReservationOpen(false);
                        openBulkReservationModal();
                      }}
                      className="inline-flex items-center gap-1 text-xs font-bold text-purple-700 hover:text-purple-900 underline cursor-pointer whitespace-nowrap"
                    >
                      <span>Mở Đặt trước nhanh / Đoàn</span>
                      <VsIcon name="arrow_forward" className="text-xs" />
                    </button>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                      Họ và tên khách lưu trú{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={reservationGuestName}
                      onChange={(e) => setReservationGuestName(e.target.value)}
                      placeholder="Ví dụ: Nguyễn Văn An"
                      className="w-full h-12 rounded-xl border border-slate-300 bg-white px-4 text-base font-medium text-slate-900 placeholder:text-slate-400 focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 outline-none transition min-h-[48px]"
                    />
                  </div>

                  {selectedReservationRoom ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                          Số điện thoại
                        </label>
                        <input
                          type="tel"
                          value={reservationGuestPhone}
                          onChange={(e) =>
                            setReservationGuestPhone(e.target.value)
                          }
                          placeholder="Ví dụ: 0912 345 678"
                          className="w-full h-12 rounded-xl border border-slate-300 bg-white px-4 text-base font-medium text-slate-900 placeholder:text-slate-400 focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 outline-none transition min-h-[48px]"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-sm font-semibold text-slate-800">
                            Giá phòng mỗi đêm (₫)
                          </label>
                          <div className="flex items-center gap-3">
                            {initialReservationRoom &&
                            selectedReservationRoom.id !==
                              initialReservationRoom.id ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setReservationRoomId(
                                    initialReservationRoom.id,
                                  );
                                  if (initialReservationRoom.price) {
                                    setReservationNightlyRate(
                                      String(initialReservationRoom.price),
                                    );
                                  }
                                }}
                                className="text-xs font-semibold text-amber-700 hover:text-amber-800 hover:underline cursor-pointer flex items-center gap-1"
                                title={`Khôi phục lại phòng ${getRoomNumber(initialReservationRoom)}`}
                              >
                                <VsIcon name="undo" className="text-sm" />
                                <span>
                                  Về phòng{" "}
                                  {getRoomNumber(initialReservationRoom)}
                                </span>
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setReservationRoomId("")}
                              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                            >
                              Đổi phòng
                            </button>
                          </div>
                        </div>
                        <div className="relative">
                          <input
                            ref={reservationPriceInputRef}
                            type="text"
                            inputMode="numeric"
                            value={formatPriceInput(reservationNightlyRate)}
                            onChange={handleReservationNightlyRateChange}
                            onKeyDown={handleReservationPriceKeyDown}
                            placeholder="Ví dụ: 900.000"
                            className="w-full h-12 rounded-xl border border-slate-300 bg-white pl-4 pr-18 text-base font-medium text-slate-900 placeholder:text-slate-400 focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 outline-none transition min-h-[48px]"
                          />
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4">
                            <span className="text-sm font-medium text-slate-500">
                              ₫ / đêm
                            </span>
                          </div>
                        </div>
                        {selectedReservationRoom.price &&
                        Number(selectedReservationRoom.price) > 0 ? (
                          <div className="mt-1.5 flex items-center justify-between text-xs sm:text-sm">
                            <span className="text-slate-600">
                              Giá niêm yết:{" "}
                              <strong className="font-semibold text-slate-800">
                                {new Intl.NumberFormat("vi-VN").format(
                                  Number(selectedReservationRoom.price),
                                )}{" "}
                                ₫
                              </strong>
                            </span>
                            {reservationNightlyRate &&
                            String(selectedReservationRoom.price) !==
                              reservationNightlyRate.replace(/\D/g, "") ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setReservationNightlyRate(
                                    String(selectedReservationRoom.price),
                                  )
                                }
                                className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                              >
                                Dùng giá niêm yết
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                          Số điện thoại
                        </label>
                        <input
                          type="tel"
                          value={reservationGuestPhone}
                          onChange={(e) =>
                            setReservationGuestPhone(e.target.value)
                          }
                          placeholder="Ví dụ: 0912 345 678"
                          className="w-full h-12 rounded-xl border border-slate-300 bg-white px-4 text-base font-medium text-slate-900 placeholder:text-slate-400 focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 outline-none transition min-h-[48px]"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-sm font-semibold text-slate-800">
                              Chọn phòng (Tùy chọn)
                            </label>
                            {initialReservationRoom ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setReservationRoomId(
                                    initialReservationRoom.id,
                                  );
                                  if (initialReservationRoom.price) {
                                    setReservationNightlyRate(
                                      String(initialReservationRoom.price),
                                    );
                                  }
                                }}
                                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer flex items-center gap-1"
                                title={`Khôi phục lại phòng ${getRoomNumber(initialReservationRoom)}`}
                              >
                                <VsIcon name="undo" className="text-sm" />
                                <span>
                                  Quay lại phòng{" "}
                                  {getRoomNumber(initialReservationRoom)}
                                </span>
                              </button>
                            ) : null}
                          </div>
                          <select
                            value={reservationRoomId}
                            onChange={(e) => {
                              setReservationRoomId(e.target.value);
                              const selected = rooms.find(
                                (r) => r.id === e.target.value,
                              );
                              if (selected?.price) {
                                setReservationNightlyRate(
                                  String(selected.price),
                                );
                              }
                            }}
                            className="w-full h-12 rounded-xl border border-slate-300 bg-white px-4 text-base font-medium text-slate-900 focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 outline-none transition min-h-[48px] cursor-pointer"
                          >
                            <option value="">Chưa gán phòng (Xếp sau)</option>
                            {availableReservationRooms.length === 0 ? (
                              <option value="" disabled>
                                Không có phòng trống khả dụng để đặt trước
                              </option>
                            ) : (
                              availableReservationRooms.map((r) => {
                                const isConflicting = isRoomConflictingForDates(
                                  r,
                                  reservationCheckIn,
                                  reservationCheckOut,
                                );
                                const priceFormatted =
                                  r.price && Number(r.price) > 0
                                    ? ` - ${new Intl.NumberFormat("vi-VN").format(Number(r.price))} ₫`
                                    : "";
                                const isInitial =
                                  initialReservationRoom &&
                                  r.id === initialReservationRoom.id;
                                return (
                                  <option
                                    key={r.id}
                                    value={r.id}
                                    disabled={isConflicting}
                                    className={
                                      isConflicting
                                        ? "text-slate-400 bg-slate-50"
                                        : ""
                                    }
                                  >
                                    Phòng {getRoomNumber(r)} (
                                    {r.type || "Tiêu chuẩn"}){priceFormatted}
                                    {isInitial ? " (Phòng ban đầu)" : ""}
                                    {isConflicting
                                      ? " · ⚠️ Đã có lịch trùng"
                                      : ""}
                                  </option>
                                );
                              })
                            )}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                            Giá phòng mỗi đêm (₫)
                          </label>
                          <div className="relative">
                            <input
                              ref={reservationPriceInputRef}
                              type="text"
                              inputMode="numeric"
                              value={formatPriceInput(reservationNightlyRate)}
                              onChange={handleReservationNightlyRateChange}
                              onKeyDown={handleReservationPriceKeyDown}
                              placeholder="Ví dụ: 900.000"
                              className="w-full h-12 rounded-xl border border-slate-300 bg-white pl-4 pr-18 text-base font-medium text-slate-900 placeholder:text-slate-400 focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 outline-none transition min-h-[48px]"
                            />
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4">
                              <span className="text-sm font-medium text-slate-500">
                                ₫ / đêm
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                        Thời gian nhận phòng{" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="datetime-local"
                        required
                        value={reservationCheckIn}
                        onChange={(e) => setReservationCheckIn(e.target.value)}
                        className="w-full h-12 rounded-xl border border-slate-300 bg-white px-4 text-base font-medium text-slate-900 focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 outline-none transition min-h-[48px] cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                        Thời gian trả phòng{" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="datetime-local"
                        required
                        value={reservationCheckOut}
                        onChange={(e) => setReservationCheckOut(e.target.value)}
                        className="w-full h-12 rounded-xl border border-slate-300 bg-white px-4 text-base font-medium text-slate-900 focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 outline-none transition min-h-[48px] cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Booking Source (TA/OTA/CO/DIRECT) & Partner */}
                  <div className="py-2.5 px-3.5 bg-slate-50/90 border border-slate-200/90 rounded-2xl grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Nguồn đặt phòng (Kênh bán) <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={reservationSourceCategory}
                        onChange={(e) => {
                          const val = e.target.value as "DIRECT" | "OTA" | "TA" | "CORPORATE" | "OTHER";
                          setReservationSourceCategory(val);
                          setReservationSourcePartnerId("");
                          setReservationCustomPartnerName("");
                          setReservationIsAddingNewPartner(false);
                        }}
                        className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs sm:text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 outline-none cursor-pointer"
                      >
                        <option value="DIRECT">Trực tiếp / Vãng lai (Khách lẻ)</option>
                        <option value="TA">Đại lý du lịch / Lữ hành (TA)</option>
                        <option value="OTA">Kênh trực tuyến (OTA)</option>
                        <option value="CORPORATE">Doanh nghiệp / Công ty (CO)</option>
                        <option value="OTHER">Nguồn khác</option>
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-700">
                          {reservationSourceCategory === "TA"
                            ? "Công ty lữ hành / Đại lý (TA)"
                            : reservationSourceCategory === "OTA"
                              ? "Nền tảng OTA cụ thể"
                              : reservationSourceCategory === "CORPORATE"
                                ? "Công ty / Doanh nghiệp đối tác"
                                : "Đối tác / Ghi chú nguồn"}
                        </label>
                        {reservationSourceCategory !== "DIRECT" && !reservationIsAddingNewPartner ? (
                          <button
                            type="button"
                            onClick={() => {
                              setReservationIsAddingNewPartner(true);
                              setReservationSourcePartnerId("");
                            }}
                            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                          >
                            + Thêm đối tác mới
                          </button>
                        ) : null}
                      </div>

                      {reservationSourceCategory === "DIRECT" ? (
                        <input
                          type="text"
                          disabled
                          value="Khách đặt trực tiếp tại quầy / Hotline"
                          className="w-full h-10 rounded-xl border border-slate-200 bg-slate-100 px-3 text-xs text-slate-500 font-medium cursor-not-allowed"
                        />
                      ) : reservationIsAddingNewPartner ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={reservationCustomPartnerName}
                            onChange={(e) => setReservationCustomPartnerName(e.target.value)}
                            placeholder={
                              reservationSourceCategory === "TA"
                                ? "VD: Vietravel, Saigontourist..."
                                : reservationSourceCategory === "OTA"
                                  ? "VD: Agoda, Booking.com..."
                                  : "VD: FPT Telecom, Viettel..."
                            }
                            className="flex-1 h-10 rounded-xl border border-emerald-300 bg-white px-3 text-xs sm:text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setReservationIsAddingNewPartner(false);
                              setReservationCustomPartnerName("");
                            }}
                            className="h-10 px-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-100 whitespace-nowrap cursor-pointer"
                            title="Quay lại danh sách có sẵn"
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <select
                          value={reservationSourcePartnerId}
                          onChange={(e) => {
                            if (e.target.value === "NEW") {
                              setReservationIsAddingNewPartner(true);
                              setReservationSourcePartnerId("");
                            } else {
                              setReservationSourcePartnerId(e.target.value);
                            }
                          }}
                          className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs sm:text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 outline-none cursor-pointer"
                        >
                          <option value="">-- Chọn công ty / đối tác --</option>
                          {bookingPartnersList
                            .filter(
                              (p) =>
                                !p.category ||
                                p.category === reservationSourceCategory ||
                                (reservationSourceCategory === "TA" && p.category === "TRAVEL_AGENCY"),
                            )
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} {p.code ? `(${p.code})` : ""}
                              </option>
                            ))}
                          <option value="NEW">+ Nhập tên công ty / đối tác mới...</option>
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Nightly Rates for Different Nights */}
                  {renderReservationNightlyRatesSection()}

                  {/* Prebooked Services & Surcharges */}
                  {renderReservationPrebookedServicesSection()}

                  {/* Conflict Alert & Alternative Rooms Recommendation */}
                  {reservationConflict ? (
                    <div className="rounded-2xl border-2 border-rose-300 bg-rose-50/90 p-4 sm:p-5 text-left transition-all shadow-xs">
                      <div className="flex items-start gap-3.5">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white shadow-xs">
                          <VsIcon name="warning" className="text-xl" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm sm:text-base font-black text-rose-950">
                            Xung đột lịch đặt phòng: Phòng{" "}
                            {getRoomNumber(reservationConflict.room)} đã có lịch
                          </h4>
                          <p className="mt-1 text-xs sm:text-sm text-rose-800 leading-relaxed">
                            {reservationConflict.message}
                          </p>

                          {suggestedAlternativeRooms.length > 0 ? (
                            <div className="mt-3.5 border-t border-rose-200/80 pt-3">
                              <p className="text-xs font-bold text-rose-900 mb-2">
                                💡 Gợi ý phòng còn trống trong khoảng ngày này
                                (bấm để đổi ngay):
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {suggestedAlternativeRooms.map((alt) => (
                                  <button
                                    key={alt.id}
                                    type="button"
                                    onClick={() => {
                                      setReservationRoomId(alt.id);
                                      if (alt.price)
                                        setReservationNightlyRate(
                                          String(alt.price),
                                        );
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-rose-300 hover:border-emerald-600 hover:bg-emerald-50 hover:text-emerald-950 text-xs font-extrabold text-slate-800 transition shadow-2xs cursor-pointer"
                                  >
                                    <VsIcon
                                      name="meeting_room"
                                      className="text-sm text-emerald-600 shrink-0"
                                    />
                                    <span>
                                      Phòng {getRoomNumber(alt)} (
                                      {alt.type || "Tiêu chuẩn"})
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Summary & Footer Actions */}
                  <div className="mt-4 pt-3 border-t border-[var(--outline-variant)] flex flex-wrap items-center justify-between gap-3 shrink-0">
                    <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2">
                      <span>
                        Tiền phòng: <strong>{formatMoney({ price: reservationEstimatedRoomsTotal, currency: "VND" })}</strong>
                        {reservationEstimatedServicesTotal > 0 ? (
                          <> · Phụ thu: <strong>{formatMoney({ price: reservationEstimatedServicesTotal, currency: "VND" })}</strong></>
                        ) : null}
                      </span>
                      <span className="font-bold text-emerald-900 bg-emerald-100/90 px-2.5 py-1 rounded-lg border border-emerald-300">
                        Tổng tạm tính: {formatMoney({ price: reservationEstimatedTotalPrice, currency: "VND" })}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setIsReservationOpen(false)}
                        disabled={reservationSubmitting}
                        className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-100 transition min-h-[42px] cursor-pointer"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        disabled={
                          reservationSubmitting || Boolean(reservationConflict)
                        }
                        className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-sm font-bold text-white shadow-sm hover:shadow transition min-h-[42px] cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={
                          reservationConflict
                            ? "Vui lòng chọn ngày khác hoặc chọn phòng còn trống"
                            : undefined
                        }
                      >
                        {reservationSubmitting ? (
                          <>
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            <span>Đang xử lý...</span>
                          </>
                        ) : (
                          <span>Xác nhận đặt phòng</span>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* Bulk Reservation (Lane D) Modal Portal */}
      {isBulkModalOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/50 p-4 sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="bulk-reservation-title"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget && !isBulkSubmitting) {
                  setIsBulkModalOpen(false);
                }
              }}
            >
              <div className="my-auto w-[96vw] max-w-6xl 2xl:max-w-7xl rounded-2xl bg-white p-5 sm:p-7 shadow-2xl text-left h-[92vh] max-h-[94vh] flex flex-col">
                {/* Modal Header */}
                <div className="flex items-start justify-between gap-4 border-b border-[var(--outline-variant)] pb-4 shrink-0">
                  <div>
                    <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.16em] text-purple-700">
                      Đặt phòng nhanh · Theo đoàn
                    </p>
                    <h2
                      id="bulk-reservation-title"
                      className="vs-display mt-1 text-2xl sm:text-3xl font-bold text-[var(--primary)] text-balance"
                    >
                      Đặt trước nhanh / Theo đoàn
                    </h2>
                    <p className="mt-1 text-xs sm:text-sm text-slate-500 text-pretty">
                      Tự động gán phòng theo loại hoặc chọn từng phòng cụ thể và tùy chỉnh giá đặt cho đoàn khách (tối đa 50 phòng).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isBulkSubmitting) setIsBulkModalOpen(false);
                    }}
                    disabled={isBulkSubmitting}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 min-h-[44px] transition cursor-pointer"
                    aria-label="Đóng"
                  >
                    <VsIcon name="close" />
                  </button>
                </div>

                <form
                  onSubmit={submitBulkReservations}
                  className="mt-4 flex-1 flex flex-col min-h-0 overflow-hidden"
                >
                  {/* Top Controls: Lead Name + Dates */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-4 border-b border-slate-100 shrink-0">
                    <div className="sm:col-span-1">
                      <label
                        htmlFor="bulk-lead-name"
                        className="block text-sm font-semibold text-slate-800 mb-1.5"
                      >
                        Trưởng đoàn / Đại diện{" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="bulk-lead-name"
                        type="text"
                        required
                        value={bulkLeadName}
                        onChange={(e) => setBulkLeadName(e.target.value)}
                        placeholder="VD: Nguyễn Văn A (Đoàn lữ hành Saigontourist)"
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm sm:text-base text-slate-900 placeholder:text-slate-400 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 outline-none transition"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="bulk-checkin-date"
                        className="block text-sm font-semibold text-slate-800 mb-1.5"
                      >
                        Ngày nhận phòng <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="bulk-checkin-date"
                        name="bulkCheckInDate"
                        aria-label="Ngày nhận phòng"
                        type="date"
                        required
                        min={todayYmd}
                        value={bulkCheckInDate}
                        onChange={(e) =>
                          handleBulkCheckInChange(e.target.value)
                        }
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm sm:text-base text-slate-900 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 outline-none transition"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="bulk-checkout-date"
                        className="block text-sm font-semibold text-slate-800 mb-1.5"
                      >
                        Ngày trả phòng <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="bulk-checkout-date"
                        name="bulkCheckOutDate"
                        aria-label="Ngày trả phòng"
                        type="date"
                        required
                        min={bulkCheckInDate || todayYmd}
                        value={bulkCheckOutDate}
                        onChange={(e) => setBulkCheckOutDate(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm sm:text-base text-slate-900 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 outline-none transition"
                      />
                    </div>
                  </div>

                  {/* Booking Source (TA/OTA/CO/DIRECT) & Partner */}
                  <div className="my-2.5 py-2.5 px-3.5 bg-slate-50/90 border border-slate-200/90 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Nguồn đặt phòng (Kênh bán) <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={bulkSourceCategory}
                        onChange={(e) => {
                          const val = e.target.value as "DIRECT" | "OTA" | "TA" | "CORPORATE" | "OTHER";
                          setBulkSourceCategory(val);
                          setBulkSourcePartnerId("");
                          setBulkCustomPartnerName("");
                          setBulkIsAddingNewPartner(false);
                        }}
                        className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs sm:text-sm font-semibold text-slate-900 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 outline-none cursor-pointer"
                      >
                        <option value="DIRECT">Trực tiếp / Vãng lai (Khách lẻ)</option>
                        <option value="TA">Đại lý du lịch / Lữ hành (TA)</option>
                        <option value="OTA">Kênh trực tuyến (OTA)</option>
                        <option value="CORPORATE">Doanh nghiệp / Công ty (CO)</option>
                        <option value="OTHER">Nguồn khác</option>
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-700">
                          {bulkSourceCategory === "TA"
                            ? "Công ty lữ hành / Đại lý (TA)"
                            : bulkSourceCategory === "OTA"
                              ? "Nền tảng OTA cụ thể"
                              : bulkSourceCategory === "CORPORATE"
                                ? "Công ty / Doanh nghiệp đối tác"
                                : "Đối tác / Ghi chú nguồn"}
                        </label>
                        {bulkSourceCategory !== "DIRECT" && !bulkIsAddingNewPartner ? (
                          <button
                            type="button"
                            onClick={() => {
                              setBulkIsAddingNewPartner(true);
                              setBulkSourcePartnerId("");
                            }}
                            className="text-xs font-bold text-purple-700 hover:text-purple-800 hover:underline cursor-pointer"
                          >
                            + Thêm đối tác mới
                          </button>
                        ) : null}
                      </div>

                      {bulkSourceCategory === "DIRECT" ? (
                        <input
                          type="text"
                          disabled
                          value="Khách đặt trực tiếp tại quầy / Hotline"
                          className="w-full h-10 rounded-xl border border-slate-200 bg-slate-100 px-3 text-xs text-slate-500 font-medium cursor-not-allowed"
                        />
                      ) : bulkIsAddingNewPartner ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={bulkCustomPartnerName}
                            onChange={(e) => setBulkCustomPartnerName(e.target.value)}
                            placeholder={
                              bulkSourceCategory === "TA"
                                ? "VD: Vietravel, Saigontourist..."
                                : bulkSourceCategory === "OTA"
                                  ? "VD: Agoda, Booking.com..."
                                  : "VD: FPT Telecom, Viettel..."
                            }
                            className="flex-1 h-10 rounded-xl border border-purple-300 bg-white px-3 text-xs sm:text-sm font-semibold text-slate-900 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setBulkIsAddingNewPartner(false);
                              setBulkCustomPartnerName("");
                            }}
                            className="h-10 px-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-100 whitespace-nowrap cursor-pointer"
                            title="Quay lại danh sách có sẵn"
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <select
                          value={bulkSourcePartnerId}
                          onChange={(e) => {
                            if (e.target.value === "NEW") {
                              setBulkIsAddingNewPartner(true);
                              setBulkSourcePartnerId("");
                            } else {
                              setBulkSourcePartnerId(e.target.value);
                            }
                          }}
                          className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs sm:text-sm font-semibold text-slate-900 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 outline-none cursor-pointer"
                        >
                          <option value="">-- Chọn công ty / đối tác --</option>
                          {bookingPartnersList
                            .filter(
                              (p) =>
                                !p.category ||
                                p.category === bulkSourceCategory ||
                                (bulkSourceCategory === "TA" && p.category === "TRAVEL_AGENCY"),
                            )
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} {p.code ? `(${p.code})` : ""}
                              </option>
                            ))}
                          <option value="NEW">+ Nhập tên công ty / đối tác mới...</option>
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Mode Selector Tabs */}
                  <div className="flex items-center gap-2 border-b border-slate-200 py-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setBulkMode("auto")}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-bold rounded-xl transition whitespace-nowrap cursor-pointer ${
                        bulkMode === "auto"
                          ? "bg-purple-100 text-purple-900 border border-purple-300 shadow-2xs"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent"
                      }`}
                    >
                      <VsIcon name="auto_awesome" className="text-base text-purple-700" />
                      <span>Tự động gán phòng nhanh</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkMode("manual")}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-bold rounded-xl transition whitespace-nowrap cursor-pointer ${
                        bulkMode === "manual"
                          ? "bg-purple-100 text-purple-900 border border-purple-300 shadow-2xs"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent"
                      }`}
                    >
                      <VsIcon name="checklist" className="text-base text-slate-700" />
                      <span>Chọn từng phòng</span>
                    </button>
                  </div>

                  {bulkMode === "auto" ? (
                    <div className="flex-1 overflow-y-auto py-3 space-y-3 min-h-0 pr-1.5">
                      <div className="p-3 bg-purple-50/60 border border-purple-200/80 rounded-xl text-xs sm:text-sm text-purple-900 flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <VsIcon name="info" className="text-base text-purple-700 shrink-0 mt-0.5" />
                          <span className="text-pretty">
                            Chọn số lượng theo từng loại phòng và tùy chỉnh giá đặt cho đoàn. Hệ thống sẽ tự động gán các phòng còn trống phù hợp.
                          </span>
                        </div>
                        {isBulkPlanFetching ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 bg-purple-100/90 border border-purple-200 px-2.5 py-1 rounded-lg shrink-0 whitespace-nowrap">
                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-purple-700 border-t-transparent" />
                            Đang kiểm tra lịch trống...
                          </span>
                        ) : null}
                      </div>

                      {roomTypeSummaryList.length === 0 ? (
                        <div className="py-12 text-center text-slate-400 text-sm">
                          Không có thông tin loại phòng nào.
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                          {roomTypeSummaryList.map((rt) => {
                            const count = bulkRoomTypeCounts[rt.roomTypeId] || 0;
                            const customPrice = bulkRoomTypeCustomPrices[rt.roomTypeId] ?? rt.price ?? 0;
                            return (
                              <div
                                key={rt.roomTypeId}
                                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 transition"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-sm text-slate-900 truncate">
                                      {rt.name}
                                    </span>
                                    {rt.price ? (
                                      <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md whitespace-nowrap">
                                        Giá gốc: {formatMoney({ price: rt.price, currency: "VND" })} / đêm
                                      </span>
                                    ) : null}
                                  </div>
                                  <span className="text-xs text-slate-500 block mt-0.5">
                                    Hiện còn{" "}
                                    <strong
                                      className={`font-bold ${
                                        rt.availableCount > 0
                                          ? "text-emerald-700"
                                          : "text-rose-600"
                                      }`}
                                    >
                                      {rt.availableCount}
                                    </strong>{" "}
                                    phòng trống
                                  </span>
                                </div>

                                <div className="flex items-center gap-4 shrink-0">
                                  {count > 0 && (
                                    <div className="flex items-center gap-2">
                                      <label className="text-xs font-semibold text-purple-900 whitespace-nowrap">
                                        Giá đặt / đêm:
                                      </label>
                                      <div className="relative flex items-center w-36">
                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          value={formatPriceInput(customPrice)}
                                          onChange={(e) =>
                                            handleBulkRoomTypePriceChange(
                                              rt.roomTypeId,
                                              e.target.value,
                                            )
                                          }
                                          placeholder="0"
                                          className="w-full text-xs font-bold text-purple-950 bg-white border border-purple-300 rounded-lg pl-2 pr-11 py-1.5 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 outline-none"
                                        />
                                        <span className="absolute right-2 text-xs font-semibold text-slate-500 pointer-events-none">
                                          đ/đêm
                                        </span>
                                      </div>
                                    </div>
                                  )}

                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => decrementRoomTypeCount(rt.roomTypeId)}
                                      disabled={count <= 0}
                                      className="w-8 h-8 rounded-lg border border-slate-300 hover:bg-slate-100 flex items-center justify-center text-slate-700 font-black disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                                    >
                                      -
                                    </button>
                                    <span className="w-8 text-center text-sm font-black text-slate-900">
                                      {count}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => incrementRoomTypeCount(rt.roomTypeId, rt.availableCount)}
                                      disabled={count >= rt.availableCount || bulkTotalAutoCount >= 50}
                                      className="w-8 h-8 rounded-lg bg-purple-700 hover:bg-purple-800 text-white flex items-center justify-center font-black disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Nightly Rates & Prebooked Services */}
                      <div className="space-y-3 pt-1">
                        {renderBulkNightlyRatesSection()}
                        {renderBulkPrebookedServicesSection()}
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Bulk Uniform Price Toolbar */}
                      <div className="mt-2.5 py-2.5 px-3.5 bg-purple-50/70 border border-purple-200/80 rounded-xl flex flex-wrap items-center justify-between gap-3 shrink-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-xs font-bold text-purple-950 whitespace-nowrap">
                            Giá thỏa thuận đoàn:
                          </span>
                          <div className="relative flex items-center w-40">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={formatPriceInput(bulkUniformPrice)}
                              onChange={(e) => setBulkUniformPrice(e.target.value)}
                              placeholder="VD: 600.000"
                              className="w-full text-xs font-bold text-purple-950 bg-white border border-purple-300 rounded-lg pl-2.5 pr-11 py-1.5 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 outline-none"
                            />
                            <span className="absolute right-2 text-xs font-semibold text-slate-500 pointer-events-none">
                              đ/đêm
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={applyUniformPriceToAllSelected}
                            disabled={
                              bulkSelectedRoomIds.size === 0 ||
                              !bulkUniformPrice.replace(/\D/g, "")
                            }
                            className="px-3 py-1.5 text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition cursor-pointer whitespace-nowrap shadow-2xs"
                          >
                            Áp dụng cho {bulkSelectedRoomIds.size} phòng đã chọn
                          </button>
                        </div>
                        <span className="text-xs text-purple-900/80">
                          Có thể tùy chỉnh giá riêng cho từng phòng ngay trên thẻ phòng bên dưới.
                        </span>
                      </div>

                      {/* Room Selection Toolbar: Filters & Quick Actions */}
                      <div className="py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
                        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
                          <div className="relative flex-1 min-w-[140px] max-w-xs">
                            <input
                              type="text"
                              placeholder="Tìm số phòng, loại phòng..."
                              value={bulkSearchQuery}
                              onChange={(e) => setBulkSearchQuery(e.target.value)}
                              className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 outline-none"
                            />
                            <VsIcon
                              name="search"
                              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm"
                            />
                          </div>
                          <select
                            value={bulkFloorFilter}
                            onChange={(e) => setBulkFloorFilter(e.target.value)}
                            className="py-1.5 px-2.5 text-sm rounded-lg border border-slate-200 text-slate-700 bg-white"
                          >
                            <option value="all">Tất cả tầng</option>
                            {floors.map((f) => (
                              <option key={f} value={f}>
                                Tầng {f}
                              </option>
                            ))}
                          </select>
                          <select
                            value={bulkTypeFilter}
                            onChange={(e) => setBulkTypeFilter(e.target.value)}
                            className="py-1.5 px-2.5 text-sm rounded-lg border border-slate-200 text-slate-700 bg-white"
                          >
                            <option value="all">Tất cả loại phòng</option>
                            {types.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              selectAllAvailableBulkRooms(
                                filteredBulkRooms
                                  .filter((c) => c.isSelectable)
                                  .map((c) => c.room),
                              )
                            }
                            className="px-3 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition cursor-pointer"
                          >
                            Chọn tất cả phòng trống
                          </button>
                          <button
                            type="button"
                            onClick={clearAllBulkRooms}
                            className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                          >
                            Bỏ chọn tất cả
                          </button>
                        </div>
                      </div>

                      {/* Status & Count Banner */}
                      <div className="flex flex-wrap items-center justify-between px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl mb-3 shrink-0 text-xs gap-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-bold text-slate-700">
                            Đã chọn:{" "}
                            <span
                              className={`font-black ${
                                bulkSelectedRoomIds.size >= 2 &&
                                bulkSelectedRoomIds.size <= 50
                                  ? "text-purple-700"
                                  : "text-amber-600"
                              }`}
                            >
                              {bulkSelectedRoomIds.size} / 50 phòng
                            </span>
                          </span>
                          <span className="text-slate-500 font-semibold">
                            · {bulkNightsCount} đêm
                          </span>
                          {bulkSelectedRoomIds.size > 0 && (
                            <span className="text-purple-900 font-bold bg-purple-100 px-2 py-0.5 rounded-md whitespace-nowrap">
                              Tạm tính: {formatMoney({ price: bulkEstimatedTotalPrice, currency: "VND" })}
                            </span>
                          )}
                          {bulkSelectedRoomIds.size < 2 ? (
                            <span className="text-amber-600 font-medium whitespace-nowrap">
                              (Cần chọn tối thiểu 2 phòng)
                            </span>
                          ) : null}
                          {bulkConflictRoomIds.size > 0 ? (
                            <span className="text-rose-600 font-bold whitespace-nowrap">
                              ({bulkConflictRoomIds.size} phòng bị xung đột)
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-3 sm:gap-4 text-slate-500 whitespace-nowrap">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                            Sẵn sàng
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                            Trùng lịch / Đã đặt
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                            Xung đột
                          </span>
                        </div>
                      </div>

                      {/* Room Cards Grid (Scrollable) */}
                      <div className="flex-1 overflow-y-auto min-h-0 pr-1.5">
                        {filteredBulkRooms.length === 0 ? (
                          <div className="py-12 text-center text-slate-400 text-sm">
                            Không tìm thấy phòng nào phù hợp với bộ lọc hiện tại.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3.5 pb-2">
                            {filteredBulkRooms.map(
                              ({
                                room,
                                isConflicting,
                                isUnavailable,
                                isSelectable,
                              }) => {
                                const isSelected = bulkSelectedRoomIds.has(room.id);
                                const isConflictRoom = bulkConflictRoomIds.has(
                                  room.id,
                                );
                                const isPhysicallyOverdue =
                                  getRoomStatus(room) === "overdue" ||
                                  Boolean(room.statusConflictCode?.toUpperCase().includes("OVERDUE"));

                                const typeFallbackPrice =
                                  roomTypeSummaryList.find(
                                    (rt) =>
                                      rt.name === (room.type || "Tiêu chuẩn") ||
                                      rt.roomTypeId === room.roomTypeId,
                                  )?.price ?? null;

                                const defaultRoomPrice =
                                  typeof room.price === "number" && room.price > 0
                                    ? room.price
                                    : typeof typeFallbackPrice === "number" && typeFallbackPrice > 0
                                      ? typeFallbackPrice
                                      : 0;

                                const customPrice = bulkRoomCustomPrices[room.id];
                                const currentPrice =
                                  customPrice !== undefined && customPrice !== null
                                    ? customPrice
                                    : defaultRoomPrice;
                                const isPriceCustomized =
                                  customPrice !== undefined &&
                                  customPrice !== null &&
                                  customPrice !== defaultRoomPrice;

                                return (
                                  <div
                                    key={room.id}
                                    onClick={() => {
                                      if (isSelectable) toggleBulkRoom(room.id);
                                    }}
                                    className={`relative rounded-xl border p-3 flex flex-col justify-between transition text-left ${
                                      isConflictRoom
                                        ? "border-rose-400 bg-rose-50/70"
                                        : isSelected
                                          ? "border-purple-600 bg-purple-50/50 ring-2 ring-purple-600 shadow-xs"
                                          : isSelectable
                                            ? "border-slate-200 hover:border-purple-300 hover:bg-slate-50/80 cursor-pointer"
                                            : "border-slate-200 bg-slate-100 opacity-60 cursor-not-allowed"
                                    }`}
                                  >
                                    <div>
                                      <div className="flex items-start justify-between gap-1.5">
                                        <div>
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-base font-black text-slate-900">
                                              P.{getRoomNumber(room)}
                                            </span>
                                            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded whitespace-nowrap">
                                              Tầng {room.floor || 1}
                                            </span>
                                          </div>
                                          <span
                                            className="text-xs text-slate-600 block truncate mt-0.5"
                                            title={room.type || "Tiêu chuẩn"}
                                          >
                                            {room.type || "Tiêu chuẩn"}
                                          </span>
                                        </div>
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          disabled={!isSelectable && !isSelected}
                                          onChange={() => toggleBulkRoom(room.id)}
                                          className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer shrink-0 mt-0.5"
                                        />
                                      </div>

                                      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                                        <span className="text-slate-500 whitespace-nowrap">
                                          Trạng thái:
                                        </span>
                                        {isConflictRoom ? (
                                          <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200 whitespace-nowrap">
                                            Xung đột
                                          </span>
                                        ) : isPhysicallyOverdue ? (
                                          <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200 whitespace-nowrap">
                                            Quá hạn trả
                                          </span>
                                        ) : isConflicting ? (
                                          <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">
                                            Đã có lịch
                                          </span>
                                        ) : isUnavailable ? (
                                          <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-slate-200 text-slate-600 whitespace-nowrap">
                                            Bảo trì/Khóa
                                          </span>
                                        ) : (
                                          <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                                            Sẵn sàng
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    <div className="mt-2.5 pt-2 border-t border-slate-200/70 text-xs">
                                      {isSelected ? (
                                        <div
                                          onClick={(e) => e.stopPropagation()}
                                          className="space-y-1"
                                        >
                                          <div className="flex items-center justify-between text-purple-900 font-bold">
                                            <span className="whitespace-nowrap">
                                              Giá đặt / đêm:
                                            </span>
                                            {isPriceCustomized && (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  resetBulkRoomPrice(room.id)
                                                }
                                                className="text-xs text-purple-600 hover:text-purple-800 underline cursor-pointer whitespace-nowrap"
                                                title="Khôi phục giá mặc định"
                                              >
                                                Giá gốc
                                              </button>
                                            )}
                                          </div>
                                          <div className="relative flex items-center">
                                            <input
                                              type="text"
                                              inputMode="numeric"
                                              value={formatPriceInput(currentPrice)}
                                              onChange={(e) =>
                                                handleBulkRoomPriceChange(
                                                  room.id,
                                                  e.target.value,
                                                )
                                              }
                                              className="w-full text-xs font-bold text-purple-950 bg-white border border-purple-300 rounded-lg pl-2 pr-11 py-1.5 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 outline-none"
                                              placeholder="0"
                                            />
                                            <span className="absolute right-2 text-xs font-semibold text-slate-500 pointer-events-none">
                                              đ/đêm
                                            </span>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex items-center justify-between text-slate-500">
                                          <span className="whitespace-nowrap">
                                            Giá gốc:
                                          </span>
                                          <span className="font-semibold text-slate-700 whitespace-nowrap">
                                            {defaultRoomPrice > 0
                                              ? `${formatMoney({ price: defaultRoomPrice, currency: "VND" })}/đêm`
                                              : "Chưa có giá"}
                                          </span>
                                        </div>
                                      )}

                                      {isPhysicallyOverdue ? (
                                        <div className="mt-1 text-xs text-amber-700 font-semibold flex items-center gap-1">
                                          <VsIcon
                                            name="warning"
                                            className="text-xs"
                                          />
                                          <span>Đang quá hạn trả hôm nay</span>
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              },
                            )}
                          </div>
                        )}

                        {/* Nightly Rates & Prebooked Services */}
                        <div className="mt-3.5 space-y-3 pb-1">
                          {renderBulkNightlyRatesSection()}
                          {renderBulkPrebookedServicesSection()}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Modal Footer */}
                  <div className="mt-4 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
                    <div className="text-xs text-slate-600">
                      {bulkMode === "auto" ? (
                        (() => {
                          const total = Object.values(bulkRoomTypeCounts).reduce(
                            (a, b) => a + b,
                            0,
                          );
                          return total > 0 ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <span>
                                Đã chọn <strong>{total}</strong> phòng ·{" "}
                                <strong>{bulkNightsCount}</strong> đêm
                                (Tiền phòng: <strong>{formatMoney({ price: bulkEstimatedRoomsTotal, currency: "VND" })}</strong>
                                {bulkEstimatedServicesTotal > 0 ? (
                                  <> · Phụ thu: <strong>{formatMoney({ price: bulkEstimatedServicesTotal, currency: "VND" })}</strong></>
                                ) : null})
                              </span>
                              <span className="font-bold text-purple-900 bg-purple-100/90 px-2.5 py-1 rounded-lg border border-purple-300">
                                Tổng tạm tính:{" "}
                                {formatMoney({
                                  price: bulkEstimatedTotalPrice,
                                  currency: "VND",
                                })}
                              </span>
                            </div>
                          ) : (
                            <span>Vui lòng chọn số lượng phòng để tiếp tục.</span>
                          );
                        })()
                      ) : bulkSelectedRoomIds.size > 0 ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span>
                            Đã chọn <strong>{bulkSelectedRoomIds.size}</strong>{" "}
                            phòng · <strong>{bulkNightsCount}</strong> đêm
                            (Tiền phòng: <strong>{formatMoney({ price: bulkEstimatedRoomsTotal, currency: "VND" })}</strong>
                            {bulkEstimatedServicesTotal > 0 ? (
                              <> · Phụ thu: <strong>{formatMoney({ price: bulkEstimatedServicesTotal, currency: "VND" })}</strong></>
                            ) : null})
                          </span>
                          <span className="font-bold text-purple-900 bg-purple-100/90 px-2.5 py-1 rounded-lg border border-purple-300">
                            Tổng tạm tính:{" "}
                            {formatMoney({
                              price: bulkEstimatedTotalPrice,
                              currency: "VND",
                            })}
                          </span>
                        </div>
                      ) : (
                        <span>Vui lòng chọn tối thiểu 1 phòng để tiếp tục.</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setIsBulkModalOpen(false)}
                        disabled={isBulkSubmitting}
                        className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-100 transition min-h-[42px] cursor-pointer"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        disabled={
                          isBulkSubmitting ||
                          !bulkLeadName.trim() ||
                          !bulkCheckInDate ||
                          !bulkCheckOutDate ||
                          bulkCheckInDate >= bulkCheckOutDate ||
                          (bulkMode === "auto"
                            ? bulkTotalAutoCount < 1 ||
                              bulkTotalAutoCount > 50 ||
                              hasOverallocatedRoomType
                            : bulkSelectedRoomIds.size < 1 ||
                              bulkSelectedRoomIds.size > 50)
                        }
                        className="px-5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-sm font-bold text-white shadow-sm hover:shadow transition min-h-[42px] cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isBulkSubmitting ? (
                          <>
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            <span>Đang xử lý...</span>
                          </>
                        ) : bulkMode === "auto" ? (
                          <span>
                            Tự động gán & Đặt (
                            {bulkTotalAutoCount}{" "}
                            phòng)
                          </span>
                        ) : (
                          <span>
                            Xác nhận đặt ({bulkSelectedRoomIds.size} phòng)
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* Available Room Action Choice Modal */}
      {availableRoomChoice && typeof document !== "undefined"
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="available-room-modal-title"
              className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-4 sm:p-6"
              onClick={() => setAvailableRoomChoice(null)}
            >
              <div
                className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 sm:p-7 shadow-2xl transition-all animate-in fade-in zoom-in-95 my-auto"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Decorative ambient header background */}
                {(() => {
                  const modalResDetails =
                    getRoomReservationDetails(availableRoomChoice);
                  return (
                    <>
                      <div
                        className={`pointer-events-none absolute inset-x-0 top-0 h-28 overflow-hidden rounded-t-3xl ${
                          modalResDetails
                            ? "bg-gradient-to-b from-purple-50/80 to-transparent"
                            : "bg-gradient-to-b from-emerald-50/80 to-transparent"
                        }`}
                      />

                      {/* Header */}
                      <div className="relative flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-2xs ${
                              modalResDetails
                                ? "bg-purple-100 text-purple-800 border border-purple-200"
                                : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            }`}
                          >
                            <VsIcon
                              name={
                                modalResDetails
                                  ? "event_available"
                                  : "meeting_room"
                              }
                              className="text-2xl"
                            />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h2
                                id="available-room-modal-title"
                                className="vs-display text-2xl font-black text-slate-950"
                              >
                                Phòng {getRoomNumber(availableRoomChoice)}
                              </h2>
                              <span
                                className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                                  modalResDetails
                                    ? "bg-purple-100 text-purple-900 border-purple-300"
                                    : "bg-emerald-100 text-emerald-900 border-emerald-300"
                                }`}
                              >
                                {modalResDetails
                                  ? "Đã đặt trước"
                                  : "Sẵn sàng đón khách"}
                              </span>
                            </div>
                            <p className="text-sm font-semibold text-slate-600 mt-0.5">
                              {availableRoomChoice.type || "Tiêu chuẩn"} ·{" "}
                              {availableRoomChoice.floor
                                ? `Tầng ${availableRoomChoice.floor}`
                                : "Không gian nghỉ"}
                              {availableRoomChoice.price &&
                              Number(availableRoomChoice.price) > 0 ? (
                                <span className="ml-2 font-bold text-slate-900">
                                  ·{" "}
                                  {formatMoney({
                                    price: availableRoomChoice.price,
                                    currency: "VND",
                                  })}{" "}
                                  / đêm
                                </span>
                              ) : null}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setAvailableRoomChoice(null)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                          title="Đóng"
                        >
                          <VsIcon name="close" className="text-xl" />
                        </button>
                      </div>
                    </>
                  );
                })()}

                {/* Action Choices */}
                <div className="relative mt-5 space-y-3">
                  {(() => {
                    const resDetails =
                      getRoomReservationDetails(availableRoomChoice);
                    if (!resDetails) return null;
                    return (
                      <div className="rounded-2xl border-2 border-purple-300 bg-purple-50/90 p-4 text-left transition-all shadow-xs mb-3">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-700 text-white shadow-xs">
                            <VsIcon
                              name="event_available"
                              className="text-xl"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-black text-purple-950">
                              Phòng này đã có khách đặt trước:{" "}
                              {resDetails.guestDisplayName}
                            </h4>
                            <p className="mt-0.5 text-xs text-purple-800">
                              Thời gian nhận phòng dự kiến:{" "}
                              {formatDateTime(resDetails.plannedCheckInAt)}
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                const target = availableRoomChoice;
                                setAvailableRoomChoice(null);
                                if (resDetails.arrival) {
                                  handleCheckInArrival(resDetails.arrival);
                                } else {
                                  handleCheckInReservationGeneric(
                                    target,
                                    resDetails,
                                  );
                                }
                              }}
                              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white px-4 py-2 text-xs font-black shadow-xs transition active:scale-[0.98] cursor-pointer"
                            >
                              <VsIcon name="login" className="text-base" />
                              <span>
                                Nhận phòng cho khách đặt trước này ngay
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Chọn thao tác cho phòng này
                  </p>

                  {/* Choice 1: Check-in (Walk-in) */}
                  {canManageStays ? (
                    <button
                      type="button"
                      onClick={() => {
                        const target = availableRoomChoice;
                        setAvailableRoomChoice(null);
                        openWalkIn(target);
                      }}
                      className="group flex w-full items-start gap-3.5 rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 p-4 text-left transition-all hover:border-emerald-500 hover:bg-emerald-50/90 hover:shadow-md cursor-pointer"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white shadow-xs transition-transform group-hover:scale-105">
                        <VsIcon name="login" className="text-xl" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-base font-black text-emerald-950 group-hover:text-emerald-900">
                            Nhận phòng ngay (Check-in)
                          </span>
                          <span className="rounded-lg bg-emerald-700 text-white px-2.5 py-0.5 text-xs font-bold">
                            Check-in
                          </span>
                        </div>
                        <p className="mt-1 text-xs sm:text-sm text-slate-600 leading-relaxed">
                          Khách vãng lai đến nhận phòng trực tiếp. Mở giao diện
                          lưu trú và kích hoạt QR GuestOS ngay.
                        </p>
                      </div>
                    </button>
                  ) : null}

                  {/* Choice 2: Đặt trước (Reservation) */}
                  {canManageReservations ? (
                    <button
                      type="button"
                      onClick={() => {
                        const target = availableRoomChoice;
                        setAvailableRoomChoice(null);
                        openFutureReservationModal(target);
                      }}
                      className="group flex w-full items-start gap-3.5 rounded-2xl border-2 border-blue-200 bg-blue-50/40 p-4 text-left transition-all hover:border-blue-500 hover:bg-blue-50/90 hover:shadow-md cursor-pointer"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white shadow-xs transition-transform group-hover:scale-105">
                        <VsIcon name="event" className="text-xl" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-base font-black text-blue-950 group-hover:text-blue-900">
                            Đặt phòng trước (Reservation)
                          </span>
                          <span className="rounded-lg bg-blue-700 text-white px-2.5 py-0.5 text-xs font-bold">
                            Đặt trước
                          </span>
                        </div>
                        <p className="mt-1 text-xs sm:text-sm text-slate-600 leading-relaxed">
                          Tạo lịch đặt phòng tương lai, thiết lập thời gian
                          check-in/out và thông tin khách đặt phòng.
                        </p>
                      </div>
                    </button>
                  ) : null}

                  {/* Choice 3: OTA Incoming (if any) */}
                  {(() => {
                    const ota = incomingOtaByRoomNumber.get(
                      getRoomNumber(availableRoomChoice).toUpperCase(),
                    );
                    if (!ota || !canManageStays) return null;
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          const target = availableRoomChoice;
                          setAvailableRoomChoice(null);
                          void handleOtaFastCheckIn(ota, target);
                        }}
                        className="group flex w-full items-start gap-3.5 rounded-2xl border-2 border-sky-300 bg-sky-50/50 p-4 text-left transition-all hover:border-sky-500 hover:bg-sky-50/90 hover:shadow-md cursor-pointer"
                      >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-700 text-white shadow-xs transition-transform group-hover:scale-105">
                          <VsIcon name="book_online" className="text-xl" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-base font-black text-sky-950">
                              Nhận phòng cho khách OTA ({ota.otaName})
                            </span>
                            <span className="rounded-lg bg-sky-700 text-white px-2.5 py-0.5 text-xs font-bold">
                              Kênh OTA
                            </span>
                          </div>
                          <p className="mt-1 text-xs sm:text-sm text-slate-600 leading-relaxed">
                            Khách{" "}
                            <strong className="text-slate-900">
                              {ota.guestName}
                            </strong>{" "}
                            đã đặt trước từ {ota.otaName}.
                          </p>
                        </div>
                      </button>
                    );
                  })()}
                </div>

                <div className="mt-6 flex items-center justify-end border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => setAvailableRoomChoice(null)}
                    className="px-5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-100 transition min-h-[44px] cursor-pointer"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      <FrontDeskRoomDetailPanel
        isOpen={Boolean(selectedContextRoom)}
        onClose={() => setSelectedContextRoom(null)}
        hotelId={hotelId}
        room={
          selectedContextRoom && isFutureDate
            ? {
                ...selectedContextRoom,
                activeStay: null,
              }
            : selectedContextRoom
        }
        arrival={
          selectedContextRoom
            ? todayArrivalByRoomId.get(selectedContextRoom.id) ||
              upcomingArrivalByRoomId.get(selectedContextRoom.id) ||
              null
            : null
        }
        businessDate={businessDate}
        isHousekeeping={isHousekeeping}
        canViewBilling={canViewBilling}
        canCheckoutBilling={canCheckoutBilling}
        canManageStays={canManageStays}
        canCheckOutStay={canCheckOutStay}
        canCheckInStay={canCheckInStay}
        onOpenQrPreview={(r) => {
          setRoomQrPreview({
            room: r,
            guestUrl: getGuestQrUrl(r, window.location.origin),
          });
        }}
        onExtendStay={(r) => {
          void handleExtendStayModal(r);
        }}
        onCheckInReservation={async (reservationId, arrival) => {
          const arr = arrival as HotelArrival | undefined;
          const targetRoom =
            selectedContextRoom ?? rooms.find((r) => r.id === arr?.roomId);
          if (!targetRoom) {
            void showWarningAlert(
              "Chưa gán phòng",
              "Vui lòng gán phòng cho khách trước khi làm thủ tục nhận phòng.",
            );
            return;
          }
          setSelectedContextRoom(null);
          setSelectedRoom(targetRoom);
          setActiveReservationCheckIn({
            reservationId,
            guestDisplayName: arr?.guestDisplayName,
            roomId: arr?.roomId ?? targetRoom.id,
            updatedAt: arr?.updatedAt,
          });
          setCustomCheckInInitialFields({
            guestDisplayName: arr?.guestDisplayName,
            guestPhone: arr?.guestPhone || "",
            plannedCheckOutAt: arr?.plannedCheckOutAt,
            reservationCode: arr?.reservationCode,
            plannedCheckInAt: arr?.plannedCheckInAt,
            notes: arr?.notes ?? undefined,
          });
          setSubmitError(undefined);
          setIsCheckInOpen(true);
        }}
        triggerElementRef={activeTriggerRef}
      />

      <BookingConfirmationModal
        isOpen={confirmationModalState.isOpen}
        onClose={() => setConfirmationModalState((prev) => ({ ...prev, isOpen: false }))}
        hotelId={hotelId}
        mode={confirmationModalState.mode}
        reservationId={confirmationModalState.reservationId}
        groupCode={confirmationModalState.groupCode}
        autoPrint={confirmationModalState.autoPrint}
      />

      <DailyMovementsModal
        isOpen={isDailyMovementsOpen}
        onClose={() => setIsDailyMovementsOpen(false)}
        hotelId={hotelId}
        businessDate={businessDate}
        todayYmd={todayYmd}
        initialTab={dailyMovementsTab}
        rooms={rooms}
        arrivalsList={arrivalsList}
        onRefreshData={async () => {
          await Promise.all([refetch(), loadArrivals(arrivalsRange)]);
        }}
        onCheckInArrival={(arr) => {
          setIsDailyMovementsOpen(false);
          handleCheckInArrival(arr);
        }}
        onExtendStay={(r) => {
          setIsDailyMovementsOpen(false);
          void handleExtendStayModal(r);
        }}
        onOpenRoomDetail={(r) => {
          setIsDailyMovementsOpen(false);
          setSelectedContextRoom(r);
        }}
        onOpenArrivalDetail={(arr) => {
          setIsDailyMovementsOpen(false);
          setSelectedArrivalForDetail(arr);
        }}
        onPrintActiveStays={printActiveStayList}
        canCheckInStay={canCheckInStay}
        canCheckOutStay={canCheckOutStay}
        canManageReservations={canManageReservations}
        canViewBilling={canViewBilling}
        canCheckoutBilling={canCheckoutBilling}
      />

      <FrontDeskArrivalDetailPanel
        isOpen={Boolean(selectedArrivalForDetail)}
        onClose={() => setSelectedArrivalForDetail(null)}
        hotelId={hotelId}
        arrival={selectedArrivalForDetail}
        todayYmd={todayYmd}
        canCheckInStay={canCheckInStay}
        canManageReservations={canManageReservations}
        canOperateArrivals={Boolean(canManageReservations || canCheckInStay)}
      />
    </div>
  );
}
