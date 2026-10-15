"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SwalVietSage,
  showConfirmDialog,
  showErrorAlert,
  showSuccessAlert,
  showWarningAlert,
} from "@/libs/swal";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import { CheckInWorkspace } from "@/features/local-biometric/components/check-in-workspace";
import type { CheckInStayFields } from "@/features/local-biometric/types/check-in-workspace";
import { BrandedRoomQr } from "@/features/hotel-ops/components/branded-room-qr";
import { FrontDeskRoomDetailPanel } from "@/features/hotel-ops/components/front-desk-room-detail-panel";
import { staffRoomsResource } from "@/features/hotel-ops/resources/staff-rooms-resource";
import { invalidateHotelRealtimeQueries } from "@/features/hotel-ops/utils/invalidate-hotel-realtime-queries";
import { filterExtraOccupants, formatMoney } from "@/features/hotel-ops/utils/hotel-ops-display";
import { getArrivalDateRange } from "@/features/hotel-ops/utils/arrival-date-range";
import type {
  HotelArrival,
  HotelCheckInResult,
  HotelOpsPage,
  HotelRoomSummary,
} from "@/features/hotel-ops/types/hotel-ops-contract";
import { channelManagerResource } from "@/features/channel-manager/api/channel-manager.resource";
import type { SimulatedBookingItem } from "@/features/channel-manager/types/channel-manager.types";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";

type Props = {
  hotelId: string;
  initialRoomsPage: HotelOpsPage<HotelRoomSummary>;
  initialByStatus?: {
    available: number;
    occupied: number;
    processing: number;
    maintenance: number;
  };
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
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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
  const qrStatus = (room.qr?.status ?? room.qrStatus ?? "INACTIVE").trim().toUpperCase();
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
  if (stayStatus !== "ACTIVE" && stayStatus !== "CHECKED_IN" && stayStatus !== "CHECKOUT_PENDING") {
    return false;
  }
  return new Date(stay.plannedCheckOutAt).getTime() < Date.now();
}

function getRoomStatus(room: HotelRoomSummary): RoomStatusFilter {
  if (isOverdueCheckOut(room)) return "overdue";
  const status = room.status?.toUpperCase();
  if (room.activeStay || status === "OCCUPIED")
    return "occupied";
  if (status === "RESERVED" || (!room.activeStay && Boolean(room.projectedReservation)))
    return "reserved";
  if (status === "PROCESSING") return "processing";
  if (status === "BLOCKED") return "blocked";
  if (status === "MAINTENANCE" || status === "OUT_OF_SERVICE")
    return "maintenance";
  return "available";
}

function getProjectedRoomStatus(room: HotelRoomSummary): RoomStatusFilter {
  const projected = (room.projectedStatus || room.status || "").toUpperCase();
  if (projected === "OCCUPIED") return "occupied";
  if (projected === "RESERVED" || (!room.activeStay && Boolean(room.projectedReservation))) return "reserved";
  if (projected === "PROCESSING") return "processing";
  if (projected === "BLOCKED") return "blocked";
  if (projected === "MAINTENANCE" || projected === "OUT_OF_SERVICE") return "maintenance";
  return "available";
}

function getEffectiveRoomStatus(room: HotelRoomSummary, isFuture: boolean): RoomStatusFilter {
  if (isFuture && room.projectedStatus) {
    return getProjectedRoomStatus(room);
  }
  return getRoomStatus(room);
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
  const base = "shrink-0 whitespace-nowrap px-2.5 py-0.5 text-xs font-black rounded-lg border shadow-2xs tracking-wide";
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
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden="true">
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-rose-400/20 blur-2xl" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-rose-300/15 blur-2xl" />
      </div>
    );
  }
  if (status === "reserved") {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden="true">
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-purple-400/20 blur-2xl" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-indigo-300/15 blur-2xl" />
      </div>
    );
  }
  if (status === "occupied") {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden="true">
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-sky-400/20 blur-2xl" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-blue-300/15 blur-2xl" />
      </div>
    );
  }
  if (status === "processing") {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden="true">
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-amber-400/25 blur-2xl" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-amber-300/15 blur-2xl" />
      </div>
    );
  }
  if (status === "maintenance") {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden="true">
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-rose-400/15 blur-2xl" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-slate-300/20 blur-2xl" />
      </div>
    );
  }
  if (status === "blocked") {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden="true">
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-slate-400/15 blur-2xl" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-slate-300/15 blur-2xl" />
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden="true">
      <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-emerald-400/20 blur-2xl" />
      <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-emerald-300/15 blur-2xl" />
    </div>
  );
}

function isAvailable(room: HotelRoomSummary): boolean {
  return getRoomStatus(room) === "available";
}




function StayOccupantsViewer({ stay }: { stay: NonNullable<HotelRoomSummary["activeStay"]> }) {
  const [selectedGuestIndex, setSelectedGuestIndex] = useState(0);

  const extraOccupants = useMemo(() => {
    return filterExtraOccupants(stay.occupants, stay);
  }, [stay]);

  const totalGuests = 1 + extraOccupants.length;
  const currentOccupant = selectedGuestIndex > 0 ? extraOccupants[selectedGuestIndex - 1] : null;

  return (
    <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-left shadow-2xs">
      <div className="flex flex-col gap-2.5 border-b border-blue-200/80 pb-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">
            Khách đang lưu trú ({totalGuests} người)
          </p>
        </div>

        <nav className="flex items-center gap-1.5 overflow-x-auto py-0.5">
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
            <p><span className="font-bold text-blue-950">SĐT:</span> {stay.guestPhone || "chưa có"}</p>
            <p><span className="font-bold text-blue-950">Mã đặt phòng:</span> {stay.reservationCode || "chưa có"}</p>
            <p><span className="font-bold text-blue-950">Số CCCD:</span> {stay.guestIdentityNumber || "chưa có"}</p>
            <p><span className="font-bold text-blue-950">Ngày sinh:</span> {stay.guestDateOfBirth || "chưa có"}</p>
            <p><span className="font-bold text-blue-950">Giới tính:</span> {stay.guestGender || "chưa có"}</p>
            <p><span className="font-bold text-blue-950">Quốc tịch:</span> {stay.guestNationality || "chưa có"}</p>
            <p className="sm:col-span-2"><span className="font-bold text-blue-950">Địa chỉ thường trú:</span> {stay.guestResidencePlace || "chưa có"}</p>
            <p><span className="font-bold text-blue-950">Nhận phòng:</span> {formatDateTime(stay.checkedInAt ?? stay.plannedCheckInAt)}</p>
            <p><span className="font-bold text-blue-950">Trả phòng:</span> {formatDateTime(stay.plannedCheckOutAt)}</p>
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
            <p><span className="font-bold text-blue-950">SĐT:</span> {currentOccupant.phone || "chưa có"}</p>
            <p><span className="font-bold text-blue-950">Số CCCD:</span> {currentOccupant.identityNumber || "chưa có"}</p>
            <p><span className="font-bold text-blue-950">Ngày sinh:</span> {currentOccupant.dateOfBirth || "chưa có"}</p>
            <p><span className="font-bold text-blue-950">Giới tính:</span> {currentOccupant.gender || "chưa có"}</p>
            <p><span className="font-bold text-blue-950">Quốc tịch:</span> {currentOccupant.nationality || "chưa có"}</p>
            <p className="sm:col-span-2"><span className="font-bold text-blue-950">Địa chỉ thường trú:</span> {currentOccupant.residencePlace || "chưa có"}</p>
            <p><span className="font-bold text-blue-950">Chủ phòng đại diện:</span> {stay.guestDisplayName}</p>
            <p><span className="font-bold text-blue-950">Mã đặt phòng:</span> {stay.reservationCode || "chưa có"}</p>
            <p><span className="font-bold text-blue-950">Nhận phòng:</span> {formatDateTime(stay.checkedInAt ?? stay.plannedCheckInAt)}</p>
            <p><span className="font-bold text-blue-950">Trả phòng:</span> {formatDateTime(stay.plannedCheckOutAt)}</p>
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
  initialByStatus,
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
}: Props) {
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

  const [businessDate, setBusinessDate] = useState<string>(
    () => (isHousekeeping ? todayYmd : initialBusinessDate || todayYmd),
  );
  const isFutureDate = !isHousekeeping && Boolean(businessDate && businessDate > todayYmd);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [inputQuery, setInputQuery] = useState(initialQuery ?? "");
  const [query, setQuery] = useState(initialQuery ?? "");
  const [floor, setFloor] = useState("all");
  const [type, setType] = useState("all");
  const [housekeepingViewMode, setHousekeepingViewMode] = useState<"tasklist" | "grid">("tasklist");
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
    inputQuery.trim() || floor !== "all" || type !== "all" || status !== defaultStatus
  );

  const resetFilters = () => {
    setInputQuery("");
    setFloor("all");
    setType("all");
    setStatus(defaultStatus);
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
  const [selectedContextRoom, setSelectedContextRoom] = useState<HotelRoomSummary | null>(null);
  const cardTriggerRefMap = useRef<Map<string, HTMLElement>>(new Map());
  const activeTriggerRef = useRef<HTMLElement | null>(null);

  function openRoomContextPanel(room: HotelRoomSummary, triggerEl?: HTMLElement | null) {
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
  } | null>(null);
  const [customCheckInInitialFields, setCustomCheckInInitialFields] = useState<Partial<CheckInStayFields> | null>(null);

  // Available Room Action Choice Modal
  const [availableRoomChoice, setAvailableRoomChoice] = useState<HotelRoomSummary | null>(null);

  // Future Reservation State
  const [isReservationOpen, setIsReservationOpen] = useState(
    initialFlow === "reservation" && !isHousekeeping,
  );
  const [reservationRoomId, setReservationRoomId] = useState<string>("");
  const [initialReservationRoomId, setInitialReservationRoomId] = useState<string>("");
  const [reservationGuestName, setReservationGuestName] = useState<string>("");
  const [reservationGuestPhone, setReservationGuestPhone] = useState<string>("");
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
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
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
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });
  const [reservationNightlyRate, setReservationNightlyRate] = useState<string>("");
  const [reservationSubmitting, setReservationSubmitting] = useState<boolean>(false);
  const reservationPriceInputRef = useRef<HTMLInputElement>(null);

  // Arrivals State
  const initialRange =
    initialArrivalRange === "today" || initialArrivalRange === "week"
      ? initialArrivalRange
      : "tomorrow";
  const [isArrivalsOpen, setIsArrivalsOpen] = useState(initialFlow === "arrivals");
  const [arrivalsRange, setArrivalsRange] = useState<"today" | "tomorrow" | "week">(
    initialRange,
  );
  const [arrivalsList, setArrivalsList] = useState<HotelArrival[]>([]);
  const [arrivalsLoading, setArrivalsLoading] = useState(false);

  function handleBusinessDateChange(newDate: string) {
    setBusinessDate(newDate);
    const params = new URLSearchParams(window.location.search);
    if (newDate && newDate !== todayYmd) {
      params.set("businessDate", newDate);
    } else {
      params.delete("businessDate");
    }
    const queryStr = params.toString();
    router.push(`/hotels/${encodeURIComponent(hotelId)}/rooms${queryStr ? `?${queryStr}` : ""}`);
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
      setReservationCheckIn(new Date(checkInD.getTime() - checkInD.getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
      const checkOutD = new Date(businessDate);
      checkOutD.setDate(checkOutD.getDate() + 1);
      checkOutD.setHours(12, 0, 0, 0);
      setReservationCheckOut(new Date(checkOutD.getTime() - checkOutD.getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
    }
    setIsReservationOpen(true);
  }

  async function submitFutureReservation(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!reservationGuestName.trim()) {
      await showWarningAlert("Thiếu thông tin", "Vui lòng nhập họ và tên khách lưu trú.");
      return;
    }
    if (!reservationCheckIn || !reservationCheckOut) {
      await showWarningAlert("Thiếu thông tin", "Vui lòng chọn thời gian nhận và trả phòng.");
      return;
    }

    setReservationSubmitting(true);
    try {
      const checkInIso = new Date(reservationCheckIn).toISOString();
      const checkOutIso = new Date(reservationCheckOut).toISOString();

      const payload: Record<string, unknown> = {
        guestDisplayName: reservationGuestName.trim(),
        plannedCheckInAt: checkInIso,
        plannedCheckOutAt: checkOutIso,
      };
      if (reservationGuestPhone.trim()) {
        payload.guestPhone = reservationGuestPhone.trim();
      }
      if (reservationRoomId.trim()) {
        payload.roomId = reservationRoomId.trim();
      }
      if (reservationNightlyRate.trim()) {
        const num = Number(reservationNightlyRate.replace(/[^0-9.-]+/g, ""));
        payload.nightlyRateSnapshot = !isNaN(num) && num > 0 ? num : reservationNightlyRate.trim();
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

      await showSuccessAlert(
        "Đặt phòng thành công",
        `Đã tạo đặt phòng thành công cho khách ${res.data?.guestDisplayName || reservationGuestName}.`,
      );
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      void refetch();
    } catch (err: unknown) {
      const errorObj = err as {
        status?: number;
        data?: { actionable?: boolean; detail?: string; code?: string };
        message?: string;
      };

      if (errorObj?.status === 409 || errorObj?.data?.code === "INTERVAL_CONFLICT") {
        const conflictDetail =
          errorObj.data?.detail ||
          errorObj.message ||
          "Phòng đã có khách lưu trú hoặc xung đột với lịch đặt phòng khác trong khoảng thời gian này. Vui lòng chọn phòng khác hoặc thay đổi thời gian lưu trú.";

        await SwalVietSage.fire({
          icon: "warning",
          title: "Xung đột lịch đặt phòng (409)",
          html: `
            <div style="font-size:14px;color:#475569;text-align:left;line-height:1.6">
              ${conflictDetail}
            </div>
            <div style="margin-top:16px;padding:12px;background:#fef2f2;border-radius:10px;border:1px solid #fecaca;font-size:13px;color:#991b1b;text-align:left">
              💡 <strong>Gợi ý:</strong> Bạn có thể đổi sang phòng trống khác hoặc điều chỉnh ngày nhận/trả phòng trên biểu mẫu đặt phòng.
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

  function openArrivalsModal() {
    setIsArrivalsOpen(true);
    void loadArrivals(arrivalsRange);
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
    });
    setCustomCheckInInitialFields({
      guestDisplayName: arrival.guestDisplayName,
      guestPhone: arrival.guestPhone || "",
      plannedCheckOutAt: arrival.plannedCheckOutAt,
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
      type,
      vipOnly: false,
      businessDate: isFutureDate ? businessDate : undefined,
    }),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
    initialData:
      page === 1 &&
      pageSize === 25 &&
      !query &&
      status === defaultStatus &&
      floor === "all" &&
      type === "all" &&
      businessDate === (isHousekeeping ? todayYmd : initialBusinessDate || todayYmd)
        ? {
            ...initialRoomsPage,
            items: initialRoomsPage.items.slice(0, 25),
            total: initialRoomsPage.total ?? initialRoomsPage.items.length,
            totalPages: Math.max(1, Math.ceil((initialRoomsPage.total ?? initialRoomsPage.items.length) / 25)),
            limit: 25,
          }
        : undefined,
  });

  const isUnassigned =
    isError &&
    (Boolean(error?.message?.includes("chưa được gán phòng")) ||
      Boolean(error?.message?.includes("Chưa gán phòng")) ||
      (error as { status?: number })?.status === 403);

  const rooms = roomsPage?.items ?? [];
  const floors = useMemo(() => {
    const rawFloors = roomsPage?.floors ?? initialRoomsPage.floors ?? [];
    return [...new Set(rawFloors)].sort((a, b) => a.localeCompare(b));
  }, [roomsPage?.floors, initialRoomsPage.floors]);

  const types = useMemo(() => {
    const rawTypes = roomsPage?.types ?? initialRoomsPage.types ?? [];
    return [...new Set(rawTypes)].sort((a, b) => a.localeCompare(b));
  }, [roomsPage?.types, initialRoomsPage.types]);

  const selectedReservationRoom = rooms.find((r) => r.id === reservationRoomId);
  const initialReservationRoom = rooms.find((r) => r.id === initialReservationRoomId);

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

  function isRoomConflictingForDates(
    r: HotelRoomSummary,
    checkInStr: string,
    checkOutStr: string,
  ): boolean {
    if (!checkInStr || !checkOutStr) return false;
    const checkInTime = new Date(checkInStr).getTime();
    const checkOutTime = new Date(checkOutStr).getTime();
    if (isNaN(checkInTime) || isNaN(checkOutTime) || checkOutTime <= checkInTime) return false;

    if (r.activeStay && !r.activeStay.checkedOutAt && r.activeStay.plannedCheckOutAt) {
      const sEnd = new Date(r.activeStay.plannedCheckOutAt).getTime();
      const sStart = r.activeStay.checkedInAt
        ? new Date(r.activeStay.checkedInAt).getTime()
        : r.activeStay.plannedCheckInAt
          ? new Date(r.activeStay.plannedCheckInAt).getTime()
          : 0;
      if (sStart < checkOutTime && sEnd > checkInTime) return true;
    }
    if (r.projectedReservation?.plannedCheckInAt && r.projectedReservation?.plannedCheckOutAt) {
      const resStart = new Date(r.projectedReservation.plannedCheckInAt).getTime();
      const resEnd = new Date(r.projectedReservation.plannedCheckOutAt).getTime();
      if (resStart < checkOutTime && resEnd > checkInTime) return true;
    }
    if (r.upcomingReservation?.plannedCheckInAt && r.upcomingReservation?.plannedCheckOutAt) {
      const resStart = new Date(r.upcomingReservation.plannedCheckInAt).getTime();
      const resEnd = new Date(r.upcomingReservation.plannedCheckOutAt).getTime();
      if (resStart < checkOutTime && resEnd > checkInTime) return true;
    }
    return arrivalsList.some((arr) => {
      if (arr.roomId !== r.id || arr.status === "CHECKED_IN") return false;
      const aStart = new Date(arr.plannedCheckInAt).getTime();
      const aEnd = new Date(arr.plannedCheckOutAt).getTime();
      return aStart < checkOutTime && aEnd > checkInTime;
    });
  }

  function handleReservationNightlyRateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const rawValue = input.value;
    const selectionStart = input.selectionStart ?? rawValue.length;

    const digitsBeforeCursor = rawValue.slice(0, selectionStart).replace(/\D/g, "").length;
    const rawDigits = rawValue.replace(/\D/g, "");
    setReservationNightlyRate(rawDigits);

    const formatted = rawDigits ? new Intl.NumberFormat("vi-VN").format(Number(rawDigits)) : "";

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
        reservationPriceInputRef.current.setSelectionRange(newCursor, newCursor);
      }
    });
  }

  function handleReservationPriceKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
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
          const formatted = rawDigits ? new Intl.NumberFormat("vi-VN").format(Number(rawDigits)) : "";
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
              reservationPriceInputRef.current.setSelectionRange(newCursor, newCursor);
            }
          });
        }
      }
    }
  }

  const filteredRooms =
    isFutureDate && status !== "all"
      ? rooms.filter((r) => getEffectiveRoomStatus(r, true) === status)
      : rooms;

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

  const boundChannelResource = useMemo(
    () => channelManagerResource.bind({ hotelId, roleScope: "owner" }),
    [hotelId],
  );

  const { data: otaBookings = [] } = useQuery({
    ...boundChannelResource.queries.simulatedBookings.options(undefined as never),
    enabled: !isHousekeeping,
    refetchInterval: isHousekeeping ? false : 30_000,
    staleTime: 10_000,
  });



  const { incomingOtaByRoomNumber, todayOtaArrivalCount, unassignedOtaCount } =
    useMemo(() => {
      const map = new Map<string, SimulatedBookingItem>();
      let todayArrivals = 0;
      let unassigned = 0;

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

        if (isTodayArrival && notCheckedIn) {
          todayArrivals++;
        }

        if (!b.roomId && !b.roomNumber && notCheckedIn) {
          unassigned++;
        }

        if (b.status === "CONFIRMED" && notCheckedIn && isTodayArrival) {
          if (b.roomNumber) {
            map.set(b.roomNumber.trim().toUpperCase(), b);
          }
        }
      }

      return {
        incomingOtaByRoomNumber: map,
        todayOtaArrivalCount: todayArrivals,
        unassignedOtaCount: unassigned,
      };
    }, [otaBookings, todayYmd]);

  let reservationConflict: { room: HotelRoomSummary; message: string } | null = null;
  if (isReservationOpen && reservationRoomId && reservationCheckIn && reservationCheckOut) {
    const checkInTime = new Date(reservationCheckIn).getTime();
    const checkOutTime = new Date(reservationCheckOut).getTime();
    if (!isNaN(checkInTime) && !isNaN(checkOutTime) && checkOutTime > checkInTime) {
      const room = rooms.find((r) => r.id === reservationRoomId);
      if (room) {
        if (room.activeStay && !room.activeStay.checkedOutAt && room.activeStay.plannedCheckOutAt) {
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

        if (!reservationConflict && room.projectedReservation?.plannedCheckInAt && room.projectedReservation?.plannedCheckOutAt) {
          const resStart = new Date(room.projectedReservation.plannedCheckInAt).getTime();
          const resEnd = new Date(room.projectedReservation.plannedCheckOutAt).getTime();
          if (resStart < checkOutTime && resEnd > checkInTime) {
            reservationConflict = {
              room,
              message: `Phòng ${getRoomNumber(room)} đã có khách đặt trước (${room.projectedReservation.guestDisplayName}) từ ${formatDateTime(room.projectedReservation.plannedCheckInAt)} đến ${formatDateTime(room.projectedReservation.plannedCheckOutAt)}.`,
            };
          }
        }

        if (!reservationConflict && room.upcomingReservation?.plannedCheckInAt && room.upcomingReservation?.plannedCheckOutAt) {
          const resStart = new Date(room.upcomingReservation.plannedCheckInAt).getTime();
          const resEnd = new Date(room.upcomingReservation.plannedCheckOutAt).getTime();
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
              const otaStart = new Date(`${ota.checkInDate}T14:00:00`).getTime();
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
    reservationConflict && isReservationOpen && reservationCheckIn && reservationCheckOut
      ? rooms
          .filter((r) => {
            if (r.id === reservationRoomId) return false;
            if (r.status === "MAINTENANCE" || r.status === "BLOCKED") return false;
            return !isRoomConflictingForDates(r, reservationCheckIn, reservationCheckOut);
          })
          .sort((a, b) => {
            const targetType = reservationConflict?.room.type;
            const aSame = a.type === targetType ? 1 : 0;
            const bSame = b.type === targetType ? 1 : 0;
            if (aSame !== bSame) return bSame - aSame;
            return getRoomNumber(a).localeCompare(getRoomNumber(b), undefined, { numeric: true });
          })
          .slice(0, 5)
      : [];

  const totalItems = roomsPage?.total ?? roomsPage?.totalItems ?? initialRoomsPage.total ?? rooms.length;
  const totalPages = roomsPage?.totalPages ?? Math.max(1, Math.ceil(totalItems / pageSize));

  const currentByStatus = useMemo(() => {
    return {
      available:
        roomsPage?.byStatus?.available ??
        initialRoomsPage.byStatus?.available ??
        initialByStatus?.available ??
        0,
      occupied:
        roomsPage?.byStatus?.occupied ??
        initialRoomsPage.byStatus?.occupied ??
        initialByStatus?.occupied ??
        0,
      processing:
        roomsPage?.byStatus?.processing ??
        initialRoomsPage.byStatus?.processing ??
        initialByStatus?.processing ??
        0,
      maintenance:
        roomsPage?.byStatus?.maintenance ??
        initialRoomsPage.byStatus?.maintenance ??
        initialByStatus?.maintenance ??
        0,
    };
  }, [roomsPage?.byStatus, initialRoomsPage.byStatus, initialByStatus]);

  function printActiveStayList() {
    const printedAt = new Date();
    const midnight = new Date(printedAt);
    midnight.setHours(0, 0, 0, 0);
    const activeStays = rooms
      .map((room) => ({ room, stay: room.activeStay }))
      .filter(({ stay }) => {
        if (!stay || stay.checkedOutAt) return false;
        const checkedInAt = new Date(stay.checkedInAt ?? stay.plannedCheckInAt ?? stay.createdAt ?? 0);
        return checkedInAt >= midnight && checkedInAt <= printedAt;
      });
    const popup = window.open("", "vietsage-stay-list");
    if (!popup) return;
    const rows = activeStays.flatMap(({ room, stay }) => {
      const cccd = stay?.guestIdentityNumber || "chưa có";
      const dob = stay?.guestDateOfBirth || "chưa có";
      const gender = stay?.guestGender || "chưa có";
      const nationality = stay?.guestNationality || "chưa có";
      const address = stay?.guestResidencePlace || "chưa có";
      const phone = stay?.guestPhone || "chưa có";
      const checkIn = formatDateTime(stay?.checkedInAt ?? stay?.plannedCheckInAt);

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
    }).join("");
    popup.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Danh sách lưu trú</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#17201b}h1{margin:0 0 8px}p{color:#5d6a61}table{border-collapse:collapse;width:100%;margin-top:24px}th,td{border:1px solid #cbd5ce;padding:9px;text-align:left;font-size:13px}th{background:#eef3ee}</style></head><body><h1>Danh sách khách đang lưu trú</h1><p>Khách sạn ${hotelId} · In lúc ${formatDateTime(printedAt.toISOString())}</p><table><thead><tr><th>Phòng</th><th>Họ tên</th><th>Số CCCD</th><th>Ngày sinh</th><th>Giới tính</th><th>Quốc tịch</th><th>Địa chỉ</th><th>Số điện thoại</th><th>Nhận phòng</th></tr></thead><tbody>${rows || '<tr><td colspan="9">Không có khách lưu trú từ 0h hôm nay đến thời điểm in.</td></tr>'}</tbody></table><script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}</script></body></html>`);
    popup.document.close();
  }


  function openWalkIn(room: HotelRoomSummary) {
    if (!isAvailable(room) || !canManageStays) return;
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
        isBlocked ? "Phòng đã trở lại trạng thái khả dụng." : "Phòng đã được khóa an toàn.",
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
        <div style="font-size:14px;color:#475569;margin-bottom:16px">Phòng <strong>${roomNum}</strong> hiện đang ở trạng thái <span style="color:#d97706;font-weight:700">CHỜ DỌN</span>. Chọn thao tác bên dưới:</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button id="swal-btn-available" style="padding:12px 16px;border-radius:12px;background:#059669;color:#fff;font-weight:700;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;transition:all 0.15s ease">
            ✅ Đã dọn xong → Chuyển sang TRỐNG
          </button>
          <button id="swal-btn-maintenance" style="padding:12px 16px;border-radius:12px;background:#475569;color:#fff;font-weight:700;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;transition:all 0.15s ease">
            🛠️ Chuyển sang BẢO TRÌ
          </button>
          ${canManageRooms ? `
          <button id="swal-btn-blocked" style="padding:12px 16px;border-radius:12px;background:#be123c;color:#fff;font-weight:700;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;transition:all 0.15s ease">
            🔒 KHÓA PHÒNG
          </button>
          ` : ""}
        </div>
      `,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: "Đóng",
      didOpen: () => {
        const btnAvailable = document.getElementById("swal-btn-available");
        const btnMaintenance = document.getElementById("swal-btn-maintenance");
        const btnBlocked = document.getElementById("swal-btn-blocked");

        btnAvailable?.addEventListener("click", () => {
          SwalVietSage.close();
          void confirmRoomReady(room);
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
        <div style="font-size:14px;color:#475569;margin-bottom:16px">Phòng <strong>${roomNum}</strong> hiện đang ở trạng thái <span style="color:#ba1a1a;font-weight:700">ĐÃ KHÓA</span>. Chọn thao tác bên dưới:</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button id="swal-btn-available" style="padding:12px 16px;border-radius:12px;background:#059669;color:#fff;font-weight:700;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;transition:all 0.15s ease">
            🔓 Mở khóa phòng → Chuyển sang TRỐNG
          </button>
          <button id="swal-btn-maintenance" style="padding:12px 16px;border-radius:12px;background:#475569;color:#fff;font-weight:700;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;transition:all 0.15s ease">
            🛠️ Chuyển sang BẢO TRÌ
          </button>
          <button id="swal-btn-processing" style="padding:12px 16px;border-radius:12px;background:#d97706;color:#fff;font-weight:700;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;transition:all 0.15s ease">
            🧹 Chuyển sang CHỜ DỌN
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
        <div style="font-size:14px;color:#475569;margin-bottom:16px">Phòng <strong>${roomNum}</strong> hiện đang ở trạng thái <span style="color:#d97706;font-weight:700">BẢO TRÌ</span>. Chọn thao tác bên dưới:</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button id="swal-btn-available" style="padding:12px 16px;border-radius:12px;background:#059669;color:#fff;font-weight:700;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;transition:all 0.15s ease">
            ✅ Hoàn thành bảo trì → Chuyển sang TRỐNG
          </button>
          ${canManageRooms ? `
          <button id="swal-btn-blocked" style="padding:12px 16px;border-radius:12px;background:#be123c;color:#fff;font-weight:700;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;transition:all 0.15s ease">
            🔒 KHÓA PHÒNG
          </button>
          ` : ""}
          <button id="swal-btn-processing" style="padding:12px 16px;border-radius:12px;background:#d97706;color:#fff;font-weight:700;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;transition:all 0.15s ease">
            🧹 Chuyển sang CHỜ DỌN
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
        const input = document.getElementById("swal-input-checkout") as HTMLInputElement | null;
        if (!input || !input.value) {
          SwalVietSage.showValidationMessage("Vui lòng chọn thời gian check-out mới");
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

  function handleOtaFastCheckIn(booking: SimulatedBookingItem, room: HotelRoomSummary) {
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
      ? rooms.find((r) => getRoomNumber(r).toUpperCase() === roomNumber.trim().toUpperCase())
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
    window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));

    return () => clearTimeout(timer);
  }, [rooms, otaBookings, incomingOtaByRoomNumber, canManageStays]);

  function handleCardClick(room: HotelRoomSummary, triggerEl?: HTMLElement | null) {
    if (isHousekeeping) {
      if (getRoomStatus(room) === "processing") {
        void confirmRoomReady(room);
      }
      return;
    }

    const effectiveStatus = getEffectiveRoomStatus(room, isFutureDate);
    const hasProjectedStay = Boolean(room.projectedStay || room.activeStay);
    const hasProjectedReservation = Boolean(room.projectedReservation);
    const isReserved =
      (effectiveStatus === "occupied" && !hasProjectedStay && hasProjectedReservation) ||
      (room.projectedStatus === "RESERVED" && hasProjectedReservation);

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
      const isPhysicallyBusy = physicalStatus === "occupied" || physicalStatus === "overdue" || Boolean(room.activeStay);
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
      const confirmation = await showConfirmDialog({
        icon: "question",
        title: "Xác nhận nhận phòng?",
        text: `Nhận phòng ${getRoomNumber(selectedRoom)} cho khách "${fields.guestDisplayName.trim()}". Hệ thống sẽ kích hoạt QR và mã GuestOS ngay.`,
        confirmText: "Nhận phòng",
        cancelText: "Hủy",
      });

      if (!confirmation.isConfirmed) return;

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
              ...(fields.occupants?.length ? { occupants: fields.occupants } : {}),
              plannedCheckOutAt,
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
        setSubmitError(
          error instanceof Error ? error.message : "Đã có lỗi xảy ra khi nhận phòng.",
        );
        await showErrorAlert(
          "Không thể nhận phòng",
          error instanceof Error ? error.message : "Đã có lỗi xảy ra khi nhận phòng.",
        );
      } finally {
        setSaving(false);
      }
      return;
    }

    const confirmation = await showConfirmDialog({
      icon: "question",
      title: "Xác nhận mở phòng và nhận phòng?",
      text: `Mở phòng ${getRoomNumber(selectedRoom)} cho khách "${fields.guestDisplayName.trim()}". Hệ thống sẽ kích hoạt QR và mã GuestOS ngay.`,
      confirmText: "Xác nhận mở phòng",
      cancelText: "Hủy",
    });

    if (!confirmation.isConfirmed) return;

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
            ...(fields.occupants?.length ? { occupants: fields.occupants } : {}),
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
      setSubmitError(error instanceof Error ? error.message : "Vui lòng thử lại.");
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
                <VsIcon name="cleaning_services" className="text-base shrink-0" />
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
                <VsIcon name="cleaning_services" className="text-base shrink-0" />
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

  function renderRoomCard(room: HotelRoomSummary) {
    const effectiveStatus = getEffectiveRoomStatus(room, isFutureDate);
    const physicalStatus = getRoomStatus(room);
    const isPhysicallyBusy = physicalStatus === "occupied" || physicalStatus === "overdue" || Boolean(room.activeStay);
    const incomingOta = incomingOtaByRoomNumber.get(getRoomNumber(room).toUpperCase());
    const isVip = /suite|vip|premium|penthouse/i.test(room.type ?? "");
    const isReserved =
      (effectiveStatus === "occupied" && !room.activeStay && !room.projectedStay && Boolean(room.projectedReservation)) ||
      (room.projectedStatus === "RESERVED" && Boolean(room.projectedReservation));
    const matchedOccupant = inputQuery.trim()
      ? room.activeStay?.occupants?.find((occ) =>
          occ.fullName.toLowerCase().includes(inputQuery.trim().toLowerCase())
        )
      : null;

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
        className={`relative flex flex-col justify-between h-full min-h-[240px] rounded-2xl border p-5 text-left transition-all cursor-pointer ${roomCardClass(effectiveStatus)}`}
      >
        {renderRoomAmbientGlow(effectiveStatus)}
        {/* Header */}
        <div className="relative z-10 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="vs-display text-3xl font-bold tracking-tight text-slate-950">
                        {getRoomNumber(room)}
                      </h3>
                      <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 mt-0.5">
                        {room.type ?? "Tiêu chuẩn"}
                      </p>
                    </div>
                    <span
                      className={
                        isVip
                          ? "rounded-full bg-amber-100 text-amber-950 border border-amber-300 px-3 py-1 text-xs font-black tracking-wider shrink-0 whitespace-nowrap"
                          : "rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 px-3 py-1 text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0 whitespace-nowrap"
                      }
                    >
                      {isVip
                        ? "VIP"
                        : room.floor
                          ? `Tầng ${room.floor}`
                          : roomStatusLabel(effectiveStatus)}
                    </span>
                  </div>

                  {/* Middle Body */}
                  <div className="relative z-10 my-3 flex-1 flex flex-col justify-center">
                    {effectiveStatus === "overdue" ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-rose-600">
                          <VsIcon name="warning" className="text-sm text-rose-600 shrink-0" />
                          <span>Cảnh báo quá hạn</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-sm font-black text-slate-950">
                          <VsIcon name="error" className="text-sm text-rose-600 shrink-0" />
                          <span className="truncate">{room.activeStay?.guestDisplayName ?? "Khách chưa trả phòng"}</span>
                        </div>
                        {matchedOccupant ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-950 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-md w-fit">
                            <VsIcon name="group" className="text-xs text-rose-700 shrink-0" />
                            <span>Khách ở cùng: <strong>{matchedOccupant.fullName}</strong></span>
                          </span>
                        ) : null}
                        {room.activeStay?.plannedCheckOutAt ? (
                          <span className="text-xs font-bold text-rose-700">
                            Hạn trả: {formatDateTime(room.activeStay.plannedCheckOutAt)}
                          </span>
                        ) : null}
                      </div>
                    ) : effectiveStatus === "reserved" || isReserved ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-purple-700">
                          <VsIcon name="event" className="text-sm text-purple-600 shrink-0" />
                          <span>Đã đặt trước</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-slate-950 font-black text-sm">
                          <VsIcon name="person" className="text-base text-purple-600 shrink-0" />
                          <span className="truncate">{room.projectedReservation?.guestDisplayName || "Khách đặt trước"}</span>
                        </div>
                        {room.projectedReservation?.plannedCheckInAt ? (
                          <span className="text-xs font-semibold text-purple-900 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded-md w-fit">
                            Nhận: {formatDateTime(room.projectedReservation.plannedCheckInAt)}
                          </span>
                        ) : null}
                      </div>
                    ) : effectiveStatus === "occupied" ? (
                      <div className="flex flex-col gap-1">
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                          Trạng thái vận hành
                        </p>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 text-slate-950 font-black text-sm">
                            <VsIcon name="person" className="text-base text-sky-600 shrink-0" />
                            <span className="truncate">
                              {isFutureDate ? "Đã có lịch lưu trú tương lai" : (room.activeStay?.guestDisplayName ?? "Khách lưu trú (Đã nhận phòng)")}
                            </span>
                          </div>
                          {matchedOccupant ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-950 bg-sky-100 border border-sky-300 px-2 py-0.5 rounded-md w-fit">
                              <VsIcon name="group" className="text-xs text-sky-700 shrink-0" />
                              <span>Khách ở cùng: <strong>{matchedOccupant.fullName}</strong></span>
                            </span>
                          ) : null}
                          {!isFutureDate && room.activeStay?.plannedCheckOutAt ? (
                            <span className="text-xs font-semibold text-slate-600">
                              Trả phòng: {formatDateTime(room.activeStay.plannedCheckOutAt)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                          Trạng thái vận hành
                        </p>
                        <div className="mt-1 font-bold text-slate-950 dark:text-slate-100 text-sm flex items-center gap-1.5">
                          {isFutureDate && isPhysicallyBusy ? (
                            physicalStatus === "overdue" ? (
                              <div className="flex items-center gap-1.5 text-rose-700">
                                <VsIcon name="warning" className="text-base text-rose-600 shrink-0" />
                                <span>Quá hạn trả phòng · Chưa check-out</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-sky-800">
                                <VsIcon name="person" className="text-base text-sky-600 shrink-0" />
                                <span>Đang có khách lưu trú</span>
                              </div>
                            )
                          ) : isFutureDate && physicalStatus === "processing" ? (
                            <div className="flex items-center gap-1.5 text-amber-700">
                              <VsIcon name="cleaning_services" className="text-base text-amber-600 shrink-0" />
                              <span>Đang chờ dọn dẹp</span>
                            </div>
                          ) : effectiveStatus === "processing" ? (
                            <>
                              <VsIcon name="cleaning_services" className="text-base text-amber-600 shrink-0" />
                              <span>Chờ dọn dẹp buồng phòng</span>
                            </>
                          ) : effectiveStatus === "available" ? (
                            !isFutureDate && incomingOta ? (
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5 text-slate-950 font-black text-sm">
                                  <VsIcon name="book_online" className="text-base text-sky-600 shrink-0" />
                                  <span className="truncate">{incomingOta.guestName}</span>
                                </div>
                                <span className="text-[11px] font-bold text-sky-700">
                                  🛎️ {incomingOta.otaName} · Đến hôm nay
                                </span>
                              </div>
                            ) : room.upcomingReservation ? (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-sm">
                                  <VsIcon name="check_circle" className="text-base text-emerald-600 shrink-0" />
                                  <span>Sẵn sàng đón khách</span>
                                </div>
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-900 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded-md w-fit" title={`Đã có lịch đặt trước: ${room.upcomingReservation.guestDisplayName}`}>
                                  <VsIcon name="event" className="text-xs text-purple-700 shrink-0" />
                                  <span>Có lịch từ {formatDateTime(room.upcomingReservation.plannedCheckInAt)}</span>
                                </span>
                              </div>
                            ) : (
                              <>
                                <VsIcon name="check_circle" className="text-base text-emerald-600 shrink-0" />
                                <span>Sẵn sàng đón khách</span>
                              </>
                            )
                          ) : effectiveStatus === "blocked" ? (
                            <>
                              <VsIcon name="lock" className="text-base text-slate-700 shrink-0" />
                              <span>Đã khóa phòng</span>
                            </>
                          ) : (
                            <>
                              <VsIcon name="build" className="text-base text-rose-600 shrink-0" />
                              <span>Đang bảo trì / Tạm ngưng</span>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="relative z-10 mt-auto border-t border-slate-200/80 pt-2.5">
                    {/* Price - Separate Centered Row without Box */}
                    {!isHousekeeping ? (
                      <div className="flex items-center justify-center py-1 text-center">
                        <span
                          className={
                            room.price && Number(room.price) > 0
                              ? "text-base sm:text-lg font-black text-slate-950 dark:text-slate-100 tracking-tight tabular-nums"
                              : "text-xs font-bold text-slate-500 uppercase tracking-wider"
                          }
                          title={
                            room.price && Number(room.price) > 0
                              ? `Giá phòng: ${formatMoney({ price: room.price ?? null, currency: "VND" })}`
                              : room.type ? `Loại: ${room.type}` : `Phòng ${getRoomNumber(room)}`
                          }
                        >
                          {room.price && Number(room.price) > 0
                            ? formatMoney({ price: room.price ?? null, currency: "VND" })
                            : room.type ? room.type : "Giá linh hoạt"}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center py-1 text-center">
                        <span className="text-sm font-bold text-slate-700">
                          {room.type ?? "Tiêu chuẩn"}
                        </span>
                      </div>
                    )}

                    {isFutureDate && room.projectedStatus ? (
                      <div className="mt-1 flex flex-col items-center justify-center gap-0.5 text-center">
                        <span className={`${roomStatusBadgeClass(effectiveStatus)} shrink-0 whitespace-nowrap`}>
                          Dự kiến: {roomStatusLabel(effectiveStatus)}
                        </span>
                        <p className="text-[11px] text-slate-500 font-medium">
                          Thực tế hiện tại: <span className="font-bold text-slate-700">{roomStatusLabel(physicalStatus)}</span>
                        </p>
                      </div>
                    ) : null}

                    {/* Direct Touch Action Buttons - min-h-[44px] */}
                    <div className="mt-3 flex flex-col gap-2">
                      {isHousekeeping ? (
                        effectiveStatus === "processing" ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void confirmRoomReady(room);
                            }}
                            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-sm shadow-sm transition active:scale-[0.98] cursor-pointer"
                          >
                            <VsIcon name="check_circle" className="text-base shrink-0" />
                            <span>Xác nhận phòng đã dọn xong</span>
                          </button>
                        ) : (
                          <div className="flex w-full min-h-[44px] items-center justify-center rounded-xl bg-slate-100 text-slate-700 text-sm font-bold border border-slate-200">
                            <span>Trạng thái: {roomStatusLabel(effectiveStatus)}</span>
                          </div>
                        )
                      ) : isFutureDate ? (
                        effectiveStatus === "available" && !isPhysicallyBusy && physicalStatus === "available" ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openFutureReservationModal(room);
                            }}
                            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-sm shadow-sm transition active:scale-[0.98] cursor-pointer"
                          >
                            <VsIcon name="event" className="text-base shrink-0" />
                            <span>Đặt trước phòng này</span>
                          </button>
                        ) : isReserved ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openRoomContextPanel(room, e.currentTarget);
                            }}
                            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-sm shadow-sm transition active:scale-[0.98] cursor-pointer"
                          >
                            <VsIcon name="event_available" className="text-base shrink-0" />
                            <span>Chi tiết đặt phòng</span>
                          </button>
                        ) : isPhysicallyBusy ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openRoomContextPanel(room, e.currentTarget);
                            }}
                            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-sm shadow-sm transition active:scale-[0.98] cursor-pointer"
                          >
                            <VsIcon name="info" className="text-base shrink-0" />
                            <span>Chưa check-out · Xem chi tiết</span>
                          </button>
                        ) : physicalStatus === "processing" ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openRoomContextPanel(room, e.currentTarget);
                            }}
                            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-extrabold text-sm shadow-sm transition active:scale-[0.98] cursor-pointer"
                          >
                            <VsIcon name="cleaning_services" className="text-base shrink-0" />
                            <span>Chờ dọn dẹp · Xem chi tiết</span>
                          </button>
                        ) : (
                          <div className="flex w-full min-h-[44px] items-center justify-center rounded-xl bg-slate-200/80 text-slate-700 text-sm font-bold border border-slate-300">
                            <span>Đã có lịch đặt / Đang bận</span>
                          </div>
                        )
                      ) : (
                        // Realtime / Today actions
                        effectiveStatus === "available" ? (
                          incomingOta && canManageStays ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleOtaFastCheckIn(incomingOta, room);
                              }}
                              className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white font-extrabold text-sm shadow-sm transition active:scale-[0.98] cursor-pointer"
                            >
                              <VsIcon name="book_online" className="text-base shrink-0" />
                              <span>Nhận phòng {incomingOta.otaName}</span>
                            </button>
                          ) : (
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openWalkIn(room);
                                }}
                                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-sm shadow-sm transition active:scale-[0.98] cursor-pointer"
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
                                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-900 font-bold text-sm shadow-2xs transition active:scale-[0.98] cursor-pointer"
                              >
                                <VsIcon name="event" className="text-base shrink-0" />
                                <span>Đặt trước</span>
                              </button>
                            </div>
                          )
                        ) : effectiveStatus === "processing" ? (
                          renderRoomStatusHoverMenu(room, "processing")
                        ) : effectiveStatus === "reserved" || isReserved ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openRoomContextPanel(room, e.currentTarget);
                            }}
                            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-sm shadow-sm transition active:scale-[0.98] cursor-pointer"
                          >
                            <VsIcon name="event_available" className="text-base shrink-0" />
                            <span>Chi tiết đặt phòng</span>
                          </button>
                        ) : effectiveStatus === "occupied" ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openRoomContextPanel(room, e.currentTarget);
                            }}
                            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-sm shadow-sm transition active:scale-[0.98] cursor-pointer"
                          >
                            <VsIcon name="info" className="text-base shrink-0" />
                            <span>Chi tiết & hóa đơn</span>
                          </button>
                        ) : effectiveStatus === "overdue" ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openRoomContextPanel(room, e.currentTarget);
                            }}
                            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-rose-300 hover:border-rose-400 bg-rose-50/50 hover:bg-rose-100/70 text-rose-950 font-bold text-sm shadow-2xs transition active:scale-[0.98] cursor-pointer"
                          >
                            <VsIcon name="error_outline" className="text-base shrink-0 text-rose-600" />
                            <span>Xử lý trả phòng quá hạn</span>
                          </button>
                        ) : effectiveStatus === "blocked" ? (
                          renderRoomStatusHoverMenu(room, "blocked")
                        ) : effectiveStatus === "maintenance" ? (
                          renderRoomStatusHoverMenu(room, "maintenance")
                        ) : null
                      )}
                    </div>
                  </div>
                </div>
              );
  }

  const roomsByFloor = useMemo(() => {
    const map = new Map<string, HotelRoomSummary[]>();
    for (const room of filteredRooms) {
      const flKey = room.floor?.trim() ? `Tầng ${room.floor}` : "Khu vực khác";
      const list = map.get(flKey) ?? [];
      list.push(room);
      map.set(flKey, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [filteredRooms]);

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
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
              {room.floor ? `Tầng ${room.floor}` : "Phòng"}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                {room.type ?? "Phòng tiêu chuẩn"}
              </p>
              {isVip ? (
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-black tracking-wider text-amber-900 border border-amber-300">
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
                  <VsIcon name="check_circle" className="text-sm text-emerald-700" />
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
              <p className="font-extrabold text-sm text-emerald-950">Vận hành buồng phòng &amp; Dọn dẹp</p>
              <p className="text-xs text-emerald-800 mt-0.5">
                Theo dõi các phòng cần dọn dẹp theo ca trực và xác nhận phòng sẵn sàng đón khách mới.
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
                Đang xem sơ đồ dự kiến ngày: {formatDateTime(businessDate).slice(0, 10)}
              </p>
              <p className="text-xs text-sky-800 mt-0.5">
                Trạng thái phòng hiển thị theo lịch đặt phòng tương lai (projectedStatus). Trạng thái vật lý hiện tại của phòng không bị thay đổi.
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
            iconActiveStyle: "bg-emerald-100 text-emerald-700 border-emerald-200",
            description: "Sẵn sàng đón khách",
            borderActive: "border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-500/20 shadow-xs",
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
            borderActive: "border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20 shadow-xs",
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
            borderActive: "border-amber-600 bg-amber-50/50 ring-2 ring-amber-500/20 shadow-xs",
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
            borderActive: "border-red-600 bg-red-50/50 ring-2 ring-red-500/20 shadow-xs",
          },
        ].map((item) => {
          const isActive = status === item.key;
          const totalRooms =
            currentByStatus.available +
            currentByStatus.occupied +
            currentByStatus.processing +
            currentByStatus.maintenance;
          const percent = totalRooms > 0 ? Math.round((item.value / totalRooms) * 100) : 0;

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
                  <span className={`inline-block size-2 rounded-full ${item.dotColor}`} />
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
                <p className={`text-3xl font-black tracking-tight ${item.tone}`}>{item.value}</p>
                <span className="text-xs font-semibold text-slate-400">phòng</span>
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
                <div className="flex items-center gap-1.5 px-2 text-slate-600 select-none" title="Ngày vận hành khách sạn">
                  <VsIcon name="calendar" className="text-base text-slate-500" />
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
                  <VsIcon name="schedule" className="text-sm text-amber-700 shrink-0" />
                  <span>Sơ đồ phòng dự kiến tương lai</span>
                </span>
              ) : null}
            </div>

            {/* Reception Operational Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openArrivalsModal}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-700 hover:bg-sky-800 active:bg-sky-900 px-3.5 text-sm font-bold text-white whitespace-nowrap shadow-xs border border-sky-800/40 transition cursor-pointer min-h-[40px]"
                title="Xem danh sách khách đặt trước trong ngày"
              >
                <VsIcon name="flight_land" className="text-base" />
                <span>Khách đặt trước</span>
              </button>
              <button
                type="button"
                onClick={() => router.push(`/hotels/${encodeURIComponent(hotelId)}/channel-manager?tab=BOOKINGS`)}
                className="relative inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 px-3.5 text-sm font-bold text-slate-800 hover:text-slate-950 whitespace-nowrap shadow-2xs transition cursor-pointer min-h-[40px]"
                title="Xem danh sách đơn đặt phòng từ Booking.com, Trip.com, Agoda"
              >
                <VsIcon name="book_online" className="text-base text-slate-500" />
                <span>Đơn đặt phòng OTA</span>
                {todayOtaArrivalCount > 0 ? (
                  <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-black bg-sky-100 text-sky-800 border border-sky-200/80 rounded-md shadow-2xs">
                    {todayOtaArrivalCount} đến
                  </span>
                ) : null}
                {unassignedOtaCount > 0 ? (
                  <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-black bg-amber-500 text-white rounded-md shadow-2xs">
                    {unassignedOtaCount} chưa xếp
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={printActiveStayList}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 px-3.5 text-sm font-bold text-slate-800 hover:text-slate-950 whitespace-nowrap shadow-2xs transition cursor-pointer min-h-[40px]"
                title="In danh sách khách đang lưu trú tại khách sạn"
              >
                <VsIcon name="print" className="text-base text-slate-500" />
                <span>In danh sách lưu trú</span>
              </button>
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

            {/* Status Select */}
            <select
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
                    Kết quả: <strong className="font-black text-sky-900">{filteredRooms.length}</strong>/{totalItems} phòng
                  </>
                ) : (
                  <>
                    Tổng: <strong className="font-black text-slate-950">{totalItems}</strong> phòng
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
              <VsIcon name="refresh" className={`text-base ${isFetching ? "animate-spin text-sky-600" : "text-slate-500"}`} />
              <span className="hidden sm:inline">Làm mới</span>
            </button>
          </div>
        </div>
      </section>

      <section className="relative min-h-[400px] flex flex-col justify-between">
        <div className="relative flex-1">
          {isFetching && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 backdrop-blur-[1px] rounded-xl transition-all">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
            </div>
          )}
          {isHousekeeping && housekeepingViewMode === "tasklist" ? (
            <div className="space-y-6">
              {roomsByFloor.map(([floorTitle, floorRooms]) => {
                const processingCount = floorRooms.filter(
                  (r) => getEffectiveRoomStatus(r, false) === "processing",
                ).length;

                return (
                  <div key={floorTitle} className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
                          <VsIcon name="layers" className="text-base" />
                        </span>
                        <h3 className="font-extrabold text-base text-slate-900">
                          {floorTitle}
                        </h3>
                        <span className="text-xs text-slate-500 font-semibold">
                          ({floorRooms.length} phòng)
                        </span>
                      </div>
                      {processingCount > 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 px-3 py-0.5 text-xs font-black">
                          <VsIcon name="cleaning_services" className="text-xs" />
                          <span>{processingCount} phòng cần dọn</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-800 text-xs font-bold">
                          <VsIcon name="check" className="text-sm" />
                          <span>Đã dọn xong</span>
                        </span>
                      )}
                    </div>

                    <div className="space-y-2.5">
                      {floorRooms.map((room) => renderHousekeepingTaskCard(room))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-5">
              {filteredRooms.map((room) => renderRoomCard(room))}
            </div>
          )}

          {filteredRooms.length === 0 && !isFetching ? (
            isUnassigned ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
                <VsIcon name="warning" className="text-3xl text-amber-600 mb-2 inline-block" />
                <h3 className="font-bold text-base text-amber-950">Chưa gán phòng — tài khoản chưa thể thao tác vận hành</h3>
                <p className="mt-1 text-xs text-amber-800 max-w-md mx-auto">
                  Khách sạn này áp dụng mô hình phân quyền độc quyền phòng. Vui lòng liên hệ Chủ khách sạn (Owner) để được gán phòng phụ trách.
                </p>
              </div>
            ) : isHousekeeping && status === "processing" && !inputQuery && floor === "all" && type === "all" ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-8 text-center shadow-2xs mt-4">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-xs mb-3">
                  <VsIcon name="task_alt" className="text-3xl text-emerald-700" />
                </div>
                <p className="font-extrabold text-lg text-emerald-950">Toàn bộ buồng phòng đã được dọn sạch sẽ!</p>
                <p className="mt-1.5 text-xs sm:text-sm text-emerald-800 max-w-md mx-auto">
                  Hiện tại không có phòng nào đang chờ dọn dẹp trong ca trực. Tất cả các phòng đã sẵn sàng hoặc đang có khách lưu trú.
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
                <VsIcon name="search_off" className="text-3xl text-slate-400 mb-2 inline-block" />
                <p className="font-bold text-base text-slate-800">Không tìm thấy phòng phù hợp</p>
                <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
                  Không có phòng nào khớp với từ khóa tìm kiếm hoặc các tiêu chí bộ lọc đã chọn. Vui lòng thử đổi tên khách, số phòng hoặc đặt lại bộ lọc.
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
              <strong className="text-slate-950 font-black">{totalItems}</strong>
              <span>phòng</span>
            </div>

            <div className="flex items-center gap-1.5 pl-3 border-l border-slate-300">
              <label htmlFor="room-page-size" className="text-xs font-semibold text-slate-600">
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
                <option value={15}>15 phòng</option>
                <option value={20}>20 phòng</option>
                <option value={25}>25 phòng</option>
                <option value={30}>30 phòng</option>
                <option value={50}>50 phòng</option>
                <option value={100}>100 phòng</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-center sm:justify-end gap-2">
            {renderPaginationButtons(page, Math.max(1, totalPages), (newPage) => {
              setPage(newPage);
              window.scrollTo({ top: 380, behavior: "smooth" });
            })}
          </div>
        </div>
      </section>

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
                      {roomQrPreview.room.activeStay?.guestDisplayName ??
                        "Khách đang lưu trú"}
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
                    <p className="mt-3 text-center text-sm font-black uppercase tracking-[0.16em] text-[var(--primary)]">Phòng {getRoomNumber(roomQrPreview.room)}</p>
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

                {roomQrPreview.room.activeStay ? (
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
          room={{ id: selectedRoom.id, roomNumber: getRoomNumber(selectedRoom), type: selectedRoom.type ?? undefined, status: "available" }}
          canManageStays={canManageStays}
          enabledFeatures={enabledFeatures}
          initialStayFields={customCheckInInitialFields ?? { plannedCheckOutAt: localDateTime(1, 12) }}
          submitState={saving ? 'submitting' : 'idle'}
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
      {isArrivalsOpen ? createPortal(
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
                <h2 id="arrivals-modal-title" className="vs-display mt-1 text-2xl font-bold text-slate-900">
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
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th scope="col" className="px-4 py-2.5">Khách hàng</th>
                      <th scope="col" className="px-4 py-2.5">Phòng</th>
                      <th scope="col" className="px-4 py-2.5 whitespace-nowrap">Dự kiến nhận</th>
                      <th scope="col" className="px-4 py-2.5 text-right whitespace-nowrap">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {arrivalsList.map((arrival) => {
                      const isToday = arrival.plannedCheckInAt?.slice(0, 10) === todayYmd;
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
                                <VsIcon name="meeting_room" className="h-3 w-3 text-emerald-600" />
                                Phòng {arrival.room.roomNumber}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 text-xs font-bold">
                                <VsIcon name="warning" className="h-3 w-3 text-amber-600" />
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
                                  onClick={() => void handleAssignRoom(arrival)}
                                  className={`inline-flex h-8 items-center justify-center rounded-lg px-2.5 text-xs font-bold transition shadow-2xs cursor-pointer ${
                                    arrival.roomId
                                      ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                                      : "bg-amber-600 hover:bg-amber-700 text-white"
                                  }`}
                                >
                                  {arrival.roomId ? "Đổi phòng" : "Gán phòng"}
                                </button>
                              ) : null}

                              {/* Strictly no early check-in for tomorrow or later: only today with assigned room gets Check-in button */}
                              {isToday && canCheckInStay && arrival.roomId ? (
                                <button
                                  type="button"
                                  onClick={() => void handleCheckInArrival(arrival)}
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
      ) : null}

      {/* Future Reservation Modal Portal */}
      {isReservationOpen ? createPortal(
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
          <div className="my-auto w-full max-w-2xl rounded-2xl bg-white p-6 sm:p-8 shadow-2xl text-left">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--outline-variant)] pb-4">
              <div>
                <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">
                  {selectedReservationRoom?.type
                    ? `Đặt phòng trước · Hạng ${selectedReservationRoom.type}`
                    : "Đặt phòng trước"}
                </p>
                <h2 id="future-reservation-title" className="vs-display mt-1 text-2xl sm:text-3xl font-bold text-[var(--primary)]">
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

            <form onSubmit={submitFutureReservation} className="mt-6 space-y-4 sm:space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                  Họ và tên khách lưu trú <span className="text-red-500">*</span>
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
                      onChange={(e) => setReservationGuestPhone(e.target.value)}
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
                        {initialReservationRoom && selectedReservationRoom.id !== initialReservationRoom.id ? (
                          <button
                            type="button"
                            onClick={() => {
                              setReservationRoomId(initialReservationRoom.id);
                              if (initialReservationRoom.price) {
                                setReservationNightlyRate(String(initialReservationRoom.price));
                              }
                            }}
                            className="text-xs font-semibold text-amber-700 hover:text-amber-800 hover:underline cursor-pointer flex items-center gap-1"
                            title={`Khôi phục lại phòng ${getRoomNumber(initialReservationRoom)}`}
                          >
                            <VsIcon name="undo" className="text-sm" />
                            <span>Về phòng {getRoomNumber(initialReservationRoom)}</span>
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
                        <span className="text-sm font-medium text-slate-500">₫ / đêm</span>
                      </div>
                    </div>
                    {selectedReservationRoom.price && Number(selectedReservationRoom.price) > 0 ? (
                      <div className="mt-1.5 flex items-center justify-between text-xs sm:text-sm">
                        <span className="text-slate-600">
                          Giá niêm yết:{" "}
                          <strong className="font-semibold text-slate-800">
                            {new Intl.NumberFormat("vi-VN").format(Number(selectedReservationRoom.price))} ₫
                          </strong>
                        </span>
                        {reservationNightlyRate &&
                        String(selectedReservationRoom.price) !== reservationNightlyRate.replace(/\D/g, "") ? (
                          <button
                            type="button"
                            onClick={() => setReservationNightlyRate(String(selectedReservationRoom.price))}
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
                      onChange={(e) => setReservationGuestPhone(e.target.value)}
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
                              setReservationRoomId(initialReservationRoom.id);
                              if (initialReservationRoom.price) {
                                setReservationNightlyRate(String(initialReservationRoom.price));
                              }
                            }}
                            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer flex items-center gap-1"
                            title={`Khôi phục lại phòng ${getRoomNumber(initialReservationRoom)}`}
                          >
                            <VsIcon name="undo" className="text-sm" />
                            <span>Quay lại phòng {getRoomNumber(initialReservationRoom)}</span>
                          </button>
                        ) : null}
                      </div>
                      <select
                        value={reservationRoomId}
                        onChange={(e) => {
                          setReservationRoomId(e.target.value);
                          const selected = rooms.find((r) => r.id === e.target.value);
                          if (selected?.price) {
                            setReservationNightlyRate(String(selected.price));
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
                            const isInitial = initialReservationRoom && r.id === initialReservationRoom.id;
                            return (
                              <option
                                key={r.id}
                                value={r.id}
                                disabled={isConflicting}
                                className={isConflicting ? "text-slate-400 bg-slate-50" : ""}
                              >
                                Phòng {getRoomNumber(r)} ({r.type || "Tiêu chuẩn"}){priceFormatted}{isInitial ? " (Phòng ban đầu)" : ""}{isConflicting ? " · ⚠️ Đã có lịch trùng" : ""}
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
                          <span className="text-sm font-medium text-slate-500">₫ / đêm</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                    Thời gian nhận phòng <span className="text-red-500">*</span>
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
                    Thời gian trả phòng <span className="text-red-500">*</span>
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

              {/* Conflict Alert & Alternative Rooms Recommendation */}
              {reservationConflict ? (
                <div className="rounded-2xl border-2 border-rose-300 bg-rose-50/90 p-4 sm:p-5 text-left transition-all shadow-xs">
                  <div className="flex items-start gap-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white shadow-xs">
                      <VsIcon name="warning" className="text-xl" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm sm:text-base font-black text-rose-950">
                        Xung đột lịch đặt phòng: Phòng {getRoomNumber(reservationConflict.room)} đã có lịch
                      </h4>
                      <p className="mt-1 text-xs sm:text-sm text-rose-800 leading-relaxed">
                        {reservationConflict.message}
                      </p>

                      {suggestedAlternativeRooms.length > 0 ? (
                        <div className="mt-3.5 border-t border-rose-200/80 pt-3">
                          <p className="text-xs font-bold text-rose-900 mb-2">
                            💡 Gợi ý phòng còn trống trong khoảng ngày này (bấm để đổi ngay):
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {suggestedAlternativeRooms.map((alt) => (
                              <button
                                key={alt.id}
                                type="button"
                                onClick={() => {
                                  setReservationRoomId(alt.id);
                                  if (alt.price) setReservationNightlyRate(String(alt.price));
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-rose-300 hover:border-emerald-600 hover:bg-emerald-50 hover:text-emerald-950 text-xs font-extrabold text-slate-800 transition shadow-2xs cursor-pointer"
                              >
                                <VsIcon name="meeting_room" className="text-sm text-emerald-600 shrink-0" />
                                <span>Phòng {getRoomNumber(alt)} ({alt.type || "Tiêu chuẩn"})</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-6 flex items-center justify-end gap-3 border-t border-[var(--outline-variant)] pt-4">
                <button
                  type="button"
                  onClick={() => setIsReservationOpen(false)}
                  disabled={reservationSubmitting}
                  className="px-5 py-2.5 rounded-xl border border-slate-300 text-sm sm:text-base font-bold text-slate-700 hover:bg-slate-100 transition min-h-[48px] cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={reservationSubmitting || Boolean(reservationConflict)}
                  className="px-6 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-sm sm:text-base font-bold text-white shadow-sm hover:shadow transition min-h-[48px] cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={reservationConflict ? "Vui lòng chọn ngày khác hoặc chọn phòng còn trống" : undefined}
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
            </form>
          </div>
        </div>,
        document.body,
      ) : null}

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
                <div className="pointer-events-none absolute inset-x-0 top-0 h-28 overflow-hidden rounded-t-3xl bg-gradient-to-b from-emerald-50/80 to-transparent" />

                {/* Header */}
                <div className="relative flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs">
                      <VsIcon name="meeting_room" className="text-2xl" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 id="available-room-modal-title" className="vs-display text-2xl font-black text-slate-950">
                          Phòng {getRoomNumber(availableRoomChoice)}
                        </h2>
                        <span className="rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 px-2.5 py-0.5 text-xs font-bold">
                          Sẵn sàng đón khách
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-600 mt-0.5">
                        {availableRoomChoice.type || "Tiêu chuẩn"} · {availableRoomChoice.floor ? `Tầng ${availableRoomChoice.floor}` : "Không gian nghỉ"}
                        {availableRoomChoice.price && Number(availableRoomChoice.price) > 0 ? (
                          <span className="ml-2 font-bold text-slate-900">
                            · {formatMoney({ price: availableRoomChoice.price, currency: "VND" })} / đêm
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

                {/* Action Choices */}
                <div className="relative mt-5 space-y-3">
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
                          Khách vãng lai đến nhận phòng trực tiếp. Mở giao diện lưu trú và kích hoạt QR GuestOS ngay.
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
                          Tạo lịch đặt phòng tương lai, thiết lập thời gian check-in/out và thông tin khách đặt phòng.
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
                            Khách <strong className="text-slate-900">{ota.guestName}</strong> đã đặt trước từ {ota.otaName}.
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
        room={selectedContextRoom}
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
          const targetRoom = selectedContextRoom ?? rooms.find((r) => r.id === arr?.roomId);
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
          });
          setCustomCheckInInitialFields({
            guestDisplayName: arr?.guestDisplayName,
            guestPhone: arr?.guestPhone || "",
            plannedCheckOutAt: arr?.plannedCheckOutAt,
          });
          setSubmitError(undefined);
          setIsCheckInOpen(true);
        }}
        triggerElementRef={activeTriggerRef}
      />
    </div>
  );
}
