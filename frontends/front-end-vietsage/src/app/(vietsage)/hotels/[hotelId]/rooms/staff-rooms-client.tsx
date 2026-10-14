"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
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
  canManageRooms: boolean;
  canManageStays: boolean;
  initialFlow?: string;
  initialBusinessDate?: string;
  isHousekeeping?: boolean;
  enabledFeatures?: readonly string[];
};

type RoomStatusFilter =
  | "all"
  | "available"
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
  { value: "occupied", label: "Đang ở" },
  { value: "overdue", label: "⚠️ Quá hạn trả" },
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
  if (room.activeStay || status === "OCCUPIED" || status === "RESERVED")
    return "occupied";
  if (status === "PROCESSING") return "processing";
  if (status === "BLOCKED") return "blocked";
  if (status === "MAINTENANCE" || status === "OUT_OF_SERVICE")
    return "maintenance";
  return "available";
}

function getProjectedRoomStatus(room: HotelRoomSummary): RoomStatusFilter {
  const projected = (room.projectedStatus || room.status || "").toUpperCase();
  if (projected === "OCCUPIED" || projected === "RESERVED") return "occupied";
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
  if (status === "overdue") return "QUÁ HẠN CHECK-OUT";
  if (status === "available") return "TRỐNG";
  if (status === "occupied") return "ĐANG Ở";
  if (status === "processing") return "CHỜ DỌN";
  if (status === "maintenance") return "BẢO TRÌ";
  if (status === "blocked") return "ĐÃ KHÓA";
  return "TẤT CẢ";
}

function roomStatusBadgeClass(status: RoomStatusFilter): string {
  const base = "shrink-0 whitespace-nowrap px-2.5 py-0.5 text-xs font-black rounded-lg border shadow-2xs tracking-wide";
  if (status === "overdue")
    return `${base} bg-red-600 text-white border-red-700 font-black animate-pulse shadow-md shadow-red-600/30`;
  if (status === "occupied")
    return `${base} bg-amber-400 text-slate-950 border-amber-300`;
  if (status === "processing")
    return `${base} bg-amber-600 text-white border-amber-700`;
  if (status === "maintenance")
    return `${base} bg-rose-700 text-white border-rose-800`;
  if (status === "blocked")
    return `${base} bg-slate-900 text-amber-300 border-slate-700`;
  return `${base} bg-emerald-700 text-white border-emerald-800`;
}

function roomCardClass(status: RoomStatusFilter): string {
  if (status === "overdue")
    return "border-2 border-red-500 bg-gradient-to-br from-red-950 via-slate-900 to-red-900 text-white shadow-xl shadow-red-900/40 cursor-pointer animate-pulse-subtle";
  if (status === "occupied")
    return "border-2 border-[var(--primary)] bg-gradient-to-br from-[var(--primary)] via-[#1c2922] to-[var(--primary)] text-white shadow-md";
  if (status === "processing")
    return "border-2 border-amber-300 bg-gradient-to-br from-amber-50/70 via-white to-amber-50/40 text-amber-950 hover:border-amber-400 hover:shadow-md transition-all";
  if (status === "maintenance")
    return "border-2 border-rose-300 bg-gradient-to-br from-rose-50/90 via-amber-50/40 to-rose-50/80 text-rose-950 shadow-xs hover:border-rose-400 hover:shadow-md transition-all";
  if (status === "blocked")
    return "border-2 border-slate-400 bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200/90 text-slate-950 shadow-xs hover:border-slate-500 hover:shadow-md transition-all";
  return "border-2 border-emerald-300/90 bg-gradient-to-br from-emerald-50/50 via-white to-emerald-50/30 text-[var(--primary)] hover:border-emerald-500 hover:shadow-md transition-all";
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
            <p><span className="font-bold text-blue-950">Check-in:</span> {formatDateTime(stay.checkedInAt ?? stay.plannedCheckInAt)}</p>
            <p><span className="font-bold text-blue-950">Check-out:</span> {formatDateTime(stay.plannedCheckOutAt)}</p>
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
            <p><span className="font-bold text-blue-950">Check-in:</span> {formatDateTime(stay.checkedInAt ?? stay.plannedCheckInAt)}</p>
            <p><span className="font-bold text-blue-950">Check-out:</span> {formatDateTime(stay.plannedCheckOutAt)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function activeStayProgress(room: HotelRoomSummary): number {
  const stay = room.activeStay;
  if (!stay?.plannedCheckInAt || !stay.plannedCheckOutAt) return 0;
  const start = new Date(stay.plannedCheckInAt).getTime();
  const end = new Date(stay.plannedCheckOutAt).getTime();
  const now = Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return 0;
  return Math.max(
    0,
    Math.min(100, Math.round(((now - start) / (end - start)) * 100)),
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
      disabled={currentPage === 1}
      className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[var(--outline-variant)] px-3 text-sm font-bold text-[var(--primary)] transition hover:bg-[var(--surface-container-low)] disabled:opacity-40 disabled:cursor-not-allowed"
    >
      &lt; Prev
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
          className="px-2 text-sm text-[var(--on-surface-variant)] select-none"
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
          className={`h-9 w-9 rounded-lg text-sm font-semibold transition ${
            pageNum === currentPage
              ? "bg-[var(--primary)] text-white"
              : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)]"
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
      disabled={currentPage === totalPages}
      className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[var(--outline-variant)] px-3 text-sm font-bold text-[var(--primary)] transition hover:bg-[var(--surface-container-low)] disabled:opacity-40 disabled:cursor-not-allowed"
    >
      Next &gt;
    </button>,
  );

  return <div className="flex items-center gap-1.5">{buttons}</div>;
}

export function StaffRoomsClient({
  hotelId,
  initialRoomsPage,
  canManageRooms,
  canManageStays,
  initialFlow,
  initialBusinessDate,
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
  const [pageSize] = useState(100);
  const [inputQuery, setInputQuery] = useState("");
  const [query, setQuery] = useState("");
  const [floor, setFloor] = useState("all");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState<RoomStatusFilter>("all");
  const [selectedRoom, setSelectedRoom] = useState<HotelRoomSummary | null>(
    () =>
      initialFlow === "check-in" && canManageStays && !isHousekeeping
        ? (initialRoomsPage.items.find(isAvailable) ?? null)
        : null,
  );
  const [roomQrPreview, setRoomQrPreview] = useState<RoomQrPreview | null>(
    null,
  );
  const [isCheckInOpen, setIsCheckInOpen] = useState(
    initialFlow === "check-in" &&
      canManageStays &&
      !isHousekeeping &&
      initialRoomsPage.items.some(isAvailable),
  );
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  // Future Reservation State
  const [isReservationOpen, setIsReservationOpen] = useState(
    initialFlow === "reservation" && !isHousekeeping,
  );
  const [reservationRoomId, setReservationRoomId] = useState<string>("");
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

  // Arrivals State
  const [isArrivalsOpen, setIsArrivalsOpen] = useState(false);
  const [arrivalsRange, setArrivalsRange] = useState<"today" | "tomorrow" | "week">("today");
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

  function openFutureReservationModal(room?: HotelRoomSummary) {
    if (room?.id) {
      setReservationRoomId(room.id);
      if (room.price) {
        setReservationNightlyRate(String(room.price));
      }
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
        "Không thể tải danh sách khách đến",
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

  async function handleAssignRoom(arrival: HotelArrival) {
    const availableRooms = rooms.filter(
      (r) => getRoomStatus(r) === "available" || r.id === arrival.roomId,
    );

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

  async function handleCheckInArrival(arrival: HotelArrival) {
    if (!arrival.roomId) {
      await showWarningAlert(
        "Chưa gán phòng",
        "Vui lòng gán phòng cho khách trước khi làm thủ tục check-in.",
      );
      return;
    }

    const confirm = await showConfirmDialog({
      icon: "question",
      title: "Xác nhận nhận phòng (Check-in)?",
      text: `Khách hàng: ${arrival.guestDisplayName}\nPhòng: ${arrival.room?.roomNumber || arrival.roomId}`,
      confirmText: "Nhận phòng",
      cancelText: "Hủy",
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await requestInternalApiEnvelope<{
        accessCode: string;
        stayId: string;
      }>(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/${encodeURIComponent(arrival.id)}/check-in`,
        { method: "POST" },
      );

      await showSuccessAlert(
        "Nhận phòng thành công",
        `Đã nhận phòng cho khách ${arrival.guestDisplayName}.${res.data?.accessCode ? ` Mã GuestOS: ${res.data.accessCode}` : ""}`,
      );
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      void refetch();
      if (isArrivalsOpen) {
        void loadArrivals(arrivalsRange);
      }
    } catch (err) {
      await showErrorAlert(
        "Không thể nhận phòng",
        err instanceof Error ? err.message : "Đã có lỗi xảy ra.",
      );
    }
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
      !query &&
      status === "all" &&
      floor === "all" &&
      type === "all" &&
      businessDate === (isHousekeeping ? todayYmd : initialBusinessDate || todayYmd)
        ? initialRoomsPage
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

  const filteredRooms =
    isFutureDate && status !== "all"
      ? rooms.filter((r) => getEffectiveRoomStatus(r, true) === status)
      : rooms;

  const futureAvailableCount = rooms.filter(
    (r) => getEffectiveRoomStatus(r, isFutureDate) === "available",
  ).length;

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

  const totalPages = roomsPage?.totalPages ?? 1;
  const totalItems = roomsPage?.totalItems ?? 0;
  const totalAvailable =
    roomsPage?.totalAvailable ?? initialRoomsPage.totalAvailable ?? 0;

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
    setSelectedRoom(room);
    setSubmitError(undefined);
    setIsCheckInOpen(true);
  }


  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("flow=")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("flow");
      window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
    }
  }, []);



  async function toggleRoomBlocked(room: HotelRoomSummary) {
    const isBlocked = getRoomStatus(room) === "blocked";
    const confirmation = await showConfirmDialog({
      icon: isBlocked ? "question" : "warning",
      title: isBlocked
        ? `Mở khóa phòng ${getRoomNumber(room)}?`
        : `Khóa phòng ${getRoomNumber(room)}?`,
      text: isBlocked
        ? "Phòng sẽ trở lại trạng thái TRỐNG và có thể được sử dụng."
        : "Phòng sẽ không thể được đặt, gán booking hoặc check-in cho đến khi mở khóa.",
      confirmText: isBlocked ? "Mở khóa phòng" : "Khóa phòng",
      cancelText: "Hủy",
    });

    if (!confirmation.isConfirmed) return;

    try {
      await requestInternalApiEnvelope(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/rooms/${encodeURIComponent(room.id)}`,
        {
          method: "PATCH",
          body: { status: isBlocked ? "AVAILABLE" : "BLOCKED" },
        },
      );
      await showSuccessAlert(
        isBlocked ? "Đã mở khóa phòng" : "Đã khóa phòng",
        isBlocked ? "Phòng đã trở lại trạng thái khả dụng." : "Phòng đã được khóa an toàn.",
      );
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
      AVAILABLE: "TRỐNG (Sẵn sàng)",
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
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/rooms/${encodeURIComponent(room.id)}`,
        {
          method: "PATCH",
          body: { status: targetStatus },
        },
      );
      await showSuccessAlert(
        `Phòng ${roomNum} đã chuyển sang ${labels[targetStatus]}!`,
        "Cập nhật trạng thái thành công.",
      );
      void refetch();
    } catch (error) {
      await showErrorAlert(
        "Không thể cập nhật trạng thái phòng",
        error instanceof Error ? error.message : "Vui lòng thử lại.",
      );
    }
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
          <button id="swal-btn-blocked" style="padding:12px 16px;border-radius:12px;background:#be123c;color:#fff;font-weight:700;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;transition:all 0.15s ease">
            🔒 KHÓA PHÒNG
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

  async function handleOverdueRoomClick(room: HotelRoomSummary) {
    const roomNum = getRoomNumber(room);
    const stay = room.activeStay;
    const guestName = stay?.guestDisplayName || "Khách lưu trú";
    const plannedOutStr = formatDateTime(stay?.plannedCheckOutAt);

    await SwalVietSage.fire({
      title: `⚠️ Cảnh báo: Phòng ${roomNum} quá hạn trả!`,
      html: `
        <div style="font-size:14px;color:#475569;margin-bottom:16px;text-align:left">
          Phòng <strong>${roomNum}</strong> (${guestName}) đã quá thời gian check-out dự kiến (<span style="color:#dc2626;font-weight:700">${plannedOutStr}</span>) nhưng lễ tân chưa làm thủ tục trả phòng.
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button id="swal-btn-checkout" style="padding:12px 16px;border-radius:12px;background:#dc2626;color:#fff;font-weight:700;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;transition:all 0.15s ease">
            🧾 Check-out & Chốt Folio (Thanh toán)
          </button>
          <button id="swal-btn-extend" style="padding:12px 16px;border-radius:12px;background:#2563eb;color:#fff;font-weight:700;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;transition:all 0.15s ease">
            ⏳ Gia hạn thời gian lưu trú
          </button>
        </div>
      `,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: "Đóng",
      didOpen: () => {
        const btnCheckout = document.getElementById("swal-btn-checkout");
        const btnExtend = document.getElementById("swal-btn-extend");

        btnCheckout?.addEventListener("click", () => {
          SwalVietSage.close();
          const params = new URLSearchParams();
          if (roomNum) params.set("roomNumber", roomNum);
          if (stay?.id) params.set("stayId", stay.id);
          if (room.id) params.set("roomId", room.id);
          router.push(`/hotels/${encodeURIComponent(hotelId)}/billing?${params.toString()}`);
        });

        btnExtend?.addEventListener("click", () => {
          SwalVietSage.close();
          void handleExtendStayModal(room);
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
          Check-out cũ: <span style="color:#dc2626;font-weight:700">${formatDateTime(stay.plannedCheckOutAt)}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;text-align:left">
          <label style="font-size:13px;font-weight:700;color:#334155">Thời gian Check-out mới:</label>
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
    } catch (error) {
      await showErrorAlert(
        "Không thể gia hạn phòng",
        error instanceof Error ? error.message : "Vui lòng thử lại.",
      );
    }
  }

  async function handleOtaFastCheckIn(booking: SimulatedBookingItem, room: HotelRoomSummary) {
    if (!booking.reservationId) {
      await showWarningAlert(
        "Chưa liên kết Đặt phòng",
        "Đơn này chưa có mã reservationId trên hệ thống.",
      );
      return;
    }

    const confirm = await showConfirmDialog({
      icon: "question",
      title: "Nhận phòng cho khách OTA?",
      text: `Khách hàng: ${booking.guestName}
Kênh OTA: ${booking.otaName}
Phòng: ${getRoomNumber(room)} (${room.type || "Tiêu chuẩn"})
Lưu trú: ${booking.checkInDate} ➔ ${booking.checkOutDate}`,
      confirmText: "Nhận phòng",
      cancelText: "Hủy",
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await requestInternalApiEnvelope<{
        accessCode: string;
        stayId: string;
        guestUrl?: string;
      }>(
        `${apiBase}/reservations/${encodeURIComponent(booking.reservationId)}/check-in`,
        { method: "POST" },
      );

      await showSuccessAlert(
        "Nhận phòng thành công",
        `Đã nhận phòng ${getRoomNumber(room)} cho khách ${booking.guestName}.${res.data?.accessCode ? ` Mã GuestOS: ${res.data.accessCode}` : ""}`,
      );

      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      void boundChannelResource.invalidate(queryClient);
      void refetch();
    } catch (err) {
      await showErrorAlert(
        "Không thể nhận phòng OTA",
        err instanceof Error ? err.message : "Đã có lỗi xảy ra khi nhận phòng.",
      );
    }
  }

  function handleCardClick(room: HotelRoomSummary) {
    if (isHousekeeping) {
      if (getRoomStatus(room) === "processing") {
        void confirmRoomReady(room);
      }
      return;
    }
    if (isFutureDate) {
      if (getEffectiveRoomStatus(room, true) === "available") {
        openFutureReservationModal(room);
      }
      return;
    }
    const roomStatus = getRoomStatus(room);
    if (roomStatus === "overdue") {
      void handleOverdueRoomClick(room);
    } else if (roomStatus === "available") {
      const ota = incomingOtaByRoomNumber.get(getRoomNumber(room).toUpperCase());
      if (ota && canManageStays) {
        void handleOtaFastCheckIn(ota, room);
      } else {
        openWalkIn(room);
      }
    } else if (roomStatus === "occupied") {
      setRoomQrPreview({
        room,
        guestUrl: getGuestQrUrl(room, window.location.origin),
      });
    } else if (roomStatus === "processing") {
      void confirmRoomReady(room);
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
      setSubmitError("Thời gian check-out không hợp lệ.");
      return;
    }

    const confirmation = await showConfirmDialog({
      icon: "question",
      title: "Xác nhận mở phòng check-in?",
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

  return (
    <div className="space-y-6">
      {isHousekeeping ? (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50/90 p-4 text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white">
              <VsIcon name="cleaning_services" className="text-xl" />
            </span>
            <div>
              <p className="font-extrabold text-sm text-emerald-950">Chế độ phân quyền Buồng phòng (Housekeeping)</p>
              <p className="text-xs text-emerald-800 mt-0.5">
                Hiển thị sơ đồ buồng phòng tối giản. Bạn có quyền xác nhận phòng chờ dọn sang trạng thái sẵn sàng đón khách.
              </p>
            </div>
          </div>
          <span className="self-start sm:self-auto shrink-0 rounded-lg bg-emerald-200/80 px-2.5 py-1 text-xs font-black text-emerald-900 border border-emerald-300">
            Quyền hạn tối thiểu
          </span>
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

      <section className="sticky top-0 z-20 -mx-2 rounded-xl bg-[var(--surface)]/90 px-2 py-3 backdrop-blur md:top-2">
        <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
            <label className="relative w-full sm:w-60 lg:w-72 min-w-0">
              <VsIcon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[var(--outline)]"
              />
              <input
                value={inputQuery}
                onChange={(event) => setInputQuery(event.target.value)}
                className="h-11 w-full rounded-lg border-0 bg-[var(--surface-container-low)] pl-10 pr-4 text-sm outline-none ring-1 ring-transparent focus:ring-[var(--primary)] min-h-[44px]"
                placeholder="Tìm kiếm phòng..."
              />
            </label>

            {/* Date selection group */}
            {!isHousekeeping ? (
            <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
              <input
                type="date"
                value={businessDate}
                onChange={(e) => handleBusinessDateChange(e.target.value)}
                className="h-11 rounded-lg border-0 bg-[var(--surface-container-low)] px-3 text-sm ring-1 ring-transparent focus:ring-[var(--primary)] min-h-[44px] flex-1 sm:flex-initial"
                title="Chọn ngày kinh doanh (Xem sơ đồ phòng dự kiến)"
              />
              <button
                type="button"
                onClick={() => handleBusinessDateChange(todayYmd)}
                className={`h-11 px-3 text-xs font-bold rounded-lg min-h-[44px] transition cursor-pointer ${
                  businessDate === todayYmd
                    ? "bg-[var(--primary)] text-white shadow-2xs"
                    : "bg-[var(--surface-container-low)] text-[var(--primary)] hover:bg-[var(--surface-container)]"
                }`}
              >
                Hôm nay
              </button>
              <button
                type="button"
                onClick={() => handleBusinessDateChange(tomorrowYmd)}
                className={`h-11 px-3 text-xs font-bold rounded-lg min-h-[44px] transition cursor-pointer ${
                  businessDate === tomorrowYmd
                    ? "bg-[var(--primary)] text-white shadow-2xs"
                    : "bg-[var(--surface-container-low)] text-[var(--primary)] hover:bg-[var(--surface-container)]"
                }`}
              >
                Ngày mai
              </button>
            </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <select
                value={floor}
                onChange={(event) => {
                  setFloor(event.target.value);
                  setPage(1);
                }}
                className="h-11 shrink-0 rounded-lg border-0 bg-[var(--surface-container-low)] px-3 text-sm ring-1 ring-transparent focus:ring-[var(--primary)] min-w-[115px] min-h-[44px]"
              >
                <option value="all">Tầng: Tất cả</option>
                {floors.map((value) => (
                  <option key={value} value={value}>
                    Tầng {value}
                  </option>
                ))}
              </select>
              <select
                value={type}
                onChange={(event) => {
                  setType(event.target.value);
                  setPage(1);
                }}
                className="h-11 shrink-0 rounded-lg border-0 bg-[var(--surface-container-low)] px-3 text-sm ring-1 ring-transparent focus:ring-[var(--primary)] min-w-[145px] min-h-[44px]"
              >
                <option value="all">Loại phòng: Tất cả</option>
                {types.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as RoomStatusFilter);
                  setPage(1);
                }}
                className="h-11 shrink-0 rounded-lg border-0 bg-[var(--surface-container-low)] px-3 text-sm ring-1 ring-transparent focus:ring-[var(--primary)] min-w-[145px] min-h-[44px]"
              >
                {statusFilters.map((item) => (
                  <option key={item.value} value={item.value}>
                    Trạng thái: {item.label}
                  </option>
                ))}
              </select>
            </div>

            {!isHousekeeping ? (
              <>
                <button
                  type="button"
                  onClick={() => openFutureReservationModal()}
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 px-4 text-sm font-bold text-white whitespace-nowrap min-h-[44px] cursor-pointer transition shadow-2xs"
                >
                  <VsIcon name="event" className="text-base" />
                  <span>Đặt phòng trước</span>
                </button>
                <button
                  type="button"
                  onClick={openArrivalsModal}
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-sky-700 hover:bg-sky-800 px-4 text-sm font-bold text-white whitespace-nowrap min-h-[44px] cursor-pointer transition shadow-2xs"
                >
                  <VsIcon name="flight_land" className="text-base" />
                  <span>Khách đến (Arrivals)</span>
                </button>
                <button
                  type="button"
                  onClick={printActiveStayList}
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-bold text-white hover:opacity-90 whitespace-nowrap min-h-[44px] cursor-pointer transition"
                >
                  <VsIcon name="print" className="text-base" />
                  <span>In danh sách lưu trú</span>
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/hotels/${encodeURIComponent(hotelId)}/channel-manager?tab=BOOKINGS`)}
                  className="relative inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-4 text-sm font-bold text-[var(--primary)] hover:bg-[var(--surface-container)] whitespace-nowrap shadow-2xs transition cursor-pointer min-h-[44px]"
                  title="Xem danh sách đơn đặt phòng từ Booking.com, Trip.com, Agoda"
                >
                  <VsIcon name="book_online" className="text-base" />
                  <span>Đơn đặt phòng OTA</span>
                  {todayOtaArrivalCount > 0 ? (
                    <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold bg-sky-700 text-white rounded-full shadow-2xs">
                      {todayOtaArrivalCount} đến
                    </span>
                  ) : null}
                  {unassignedOtaCount > 0 ? (
                    <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold bg-amber-600 text-white rounded-full shadow-2xs">
                      {unassignedOtaCount} chưa xếp
                    </span>
                  ) : null}
                </button>
              </>
            ) : null}
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 2xl:ml-auto">
            <div className="grid grid-cols-2 gap-4 text-center shrink-0">
              <div>
                <p className="text-xs text-[var(--on-surface-variant)]">Tổng</p>
                <p className="font-bold text-[var(--primary)]">{totalItems}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--on-surface-variant)]">
                  Khả dụng
                </p>
                <p className="font-bold text-[var(--secondary)]">
                  {isFutureDate ? futureAvailableCount : totalAvailable}
                </p>
              </div>
            </div>
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
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {filteredRooms.map((room) => {
              const effectiveStatus = getEffectiveRoomStatus(room, isFutureDate);
              const physicalStatus = getRoomStatus(room);
              const progress = activeStayProgress(room);
              const incomingOta = incomingOtaByRoomNumber.get(getRoomNumber(room).toUpperCase());
              const isVip = /suite|vip|premium|penthouse/i.test(room.type ?? "");

              return (
                <div
                  key={room.id}
                  onClick={() => handleCardClick(room)}
                  className={`flex flex-col justify-between h-full min-h-[240px] rounded-2xl border p-5 text-left shadow-[0_4px_20px_rgba(0,0,0,0.05)] transition-all cursor-pointer ${roomCardClass(effectiveStatus)}`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="vs-display text-3xl font-semibold">
                        {getRoomNumber(room)}
                      </h3>
                      <p
                        className={
                          effectiveStatus === "occupied" || effectiveStatus === "overdue"
                            ? "text-sm text-white/75"
                            : "text-sm text-[var(--on-surface-variant)]"
                        }
                      >
                        {room.type ?? "Tiêu chuẩn"}
                      </p>
                    </div>
                    <span
                      className={
                        isVip
                          ? effectiveStatus === "occupied" || effectiveStatus === "overdue"
                            ? "rounded-full bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 px-3 py-1 text-xs font-black text-slate-950 shadow-xs border border-yellow-200 tracking-wider shrink-0 whitespace-nowrap"
                            : "rounded-full bg-slate-900 px-3 py-1 text-xs font-black text-amber-300 shadow-xs border border-amber-400/80 tracking-wider shrink-0 whitespace-nowrap"
                          : "rounded-full bg-[var(--surface-container-high)] px-3 py-1 text-xs font-bold text-[var(--on-surface-variant)] shrink-0 whitespace-nowrap"
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
                  <div className="my-3 flex-1 flex flex-col justify-center">
                    <p
                      className={
                        effectiveStatus === "overdue"
                          ? "text-xs uppercase tracking-[0.18em] text-red-300 font-bold"
                          : effectiveStatus === "occupied"
                            ? "text-xs uppercase tracking-[0.18em] text-white/70 font-semibold"
                            : effectiveStatus === "maintenance"
                              ? "text-xs uppercase tracking-[0.18em] text-rose-900/80 font-bold"
                              : effectiveStatus === "blocked"
                                ? "text-xs uppercase tracking-[0.18em] text-slate-700 font-bold"
                                : effectiveStatus === "processing"
                                  ? "text-xs uppercase tracking-[0.18em] text-amber-900/80 font-bold"
                                  : "text-xs uppercase tracking-[0.18em] text-emerald-800/80 font-bold"
                      }
                    >
                      {effectiveStatus === "overdue" ? "⚠️ Cảnh báo quá hạn" : "Trạng thái vận hành"}
                    </p>
                    <div
                      className={
                        effectiveStatus === "overdue"
                          ? "mt-1 font-extrabold text-red-200 text-sm flex items-center gap-1.5"
                          : effectiveStatus === "occupied"
                            ? "mt-1 font-bold text-white text-base"
                            : effectiveStatus === "maintenance"
                              ? "mt-1.5 font-extrabold text-rose-900 text-sm flex items-center gap-1.5"
                              : effectiveStatus === "blocked"
                                ? "mt-1.5 font-extrabold text-slate-900 text-sm flex items-center gap-1.5"
                                : effectiveStatus === "processing"
                                  ? "mt-1.5 font-extrabold text-amber-950 text-sm flex items-center gap-1.5"
                                  : "mt-1.5 font-extrabold text-emerald-900 text-sm flex items-center gap-1.5"
                      }
                    >
                      {effectiveStatus === "overdue" ? (
                        <>
                          <VsIcon name="warning" className="text-base text-red-400 shrink-0 animate-bounce" />
                          <span>{room.activeStay?.guestDisplayName ?? "Khách chưa check-out"}</span>
                        </>
                      ) : effectiveStatus === "occupied" ? (
                        isFutureDate ? "Đã có lịch lưu trú tương lai" : (room.activeStay?.guestDisplayName ?? "Khách lưu trú (Đã nhận phòng)")
                      ) : effectiveStatus === "processing" ? (
                        <>
                          <VsIcon name="cleaning_services" className="text-base text-amber-700 shrink-0" />
                          <span>Chờ dọn dẹp buồng phòng</span>
                        </>
                      ) : effectiveStatus === "available" ? (
                        !isFutureDate && incomingOta ? (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 text-sky-800 font-extrabold text-sm">
                              <VsIcon name="book_online" className="text-base text-sky-600 shrink-0" />
                              <span className="truncate">{incomingOta.guestName}</span>
                            </div>
                            <span className="text-[11px] font-semibold text-sky-700">
                              🛎️ {incomingOta.otaName} · Đến hôm nay
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
                          <VsIcon name="build" className="text-base text-rose-700 shrink-0" />
                          <span>Đang bảo trì / Tạm ngưng</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Footer */}
                  <div
                    className={
                      effectiveStatus === "occupied"
                        ? "mt-auto border-t border-white/15 pt-3"
                        : "mt-auto border-t border-[var(--outline-variant)]/40 pt-3"
                    }
                  >
                    {!isFutureDate && effectiveStatus === "occupied" ? (
                      <>
                        <div className="mb-1 flex justify-between text-xs text-white/65">
                          <span>
                            {formatDateTime(
                              room.activeStay?.checkedInAt ?? room.activeStay?.plannedCheckInAt,
                            )}
                          </span>
                          <span>
                            {formatDateTime(room.activeStay?.plannedCheckOutAt)}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
                          <div
                            className="h-full rounded-full bg-[var(--secondary-fixed-dim)]"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="h-1.5 rounded-full bg-[var(--surface-container-high)]" />
                    )}

                    <div className="mt-2.5 flex items-center justify-between gap-1.5 overflow-hidden">
                      {!isHousekeeping ? (
                        <span
                          className="shrink-0 whitespace-nowrap text-xs font-extrabold text-amber-950 bg-amber-100/90 border border-amber-300 px-2 py-0.5 rounded-md shadow-2xs tabular-nums tracking-tight"
                          title={
                            room.price && Number(room.price) > 0
                              ? `Giá phòng: ${formatMoney({ price: room.price ?? null, currency: "VND" })}`
                              : room.type ? `Loại: ${room.type}` : `Phòng ${getRoomNumber(room)}`
                          }
                        >
                          {room.price && Number(room.price) > 0
                            ? `${formatMoney({ price: room.price ?? null, currency: "VND" })}`
                            : room.type ? room.type : "Giá linh hoạt"}
                        </span>
                      ) : (
                        <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded-md">
                          {room.type ?? "Tiêu chuẩn"}
                        </span>
                      )}
                      <span className={`${roomStatusBadgeClass(effectiveStatus)} shrink-0 whitespace-nowrap`}>
                        {isFutureDate && room.projectedStatus ? `Dự kiến: ${roomStatusLabel(effectiveStatus)}` : roomStatusLabel(effectiveStatus)}
                      </span>
                    </div>

                    {isFutureDate && room.projectedStatus ? (
                      <p className="mt-1 text-[11px] text-slate-500 font-medium">
                        Thực tế hiện tại: <span className="font-bold text-slate-700">{roomStatusLabel(physicalStatus)}</span>
                      </p>
                    ) : null}

                    {/* Direct Touch Action Buttons - min-h-[44px] */}
                    <div className="mt-3 flex flex-col gap-2">
                      {isHousekeeping ? (
                        effectiveStatus === "processing" ? (
                          <button
                            type="button"
                            onClick={() => void confirmRoomReady(room)}
                            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow-sm transition active:scale-[0.98] cursor-pointer"
                          >
                            <VsIcon name="check_circle" className="text-base shrink-0" />
                            <span>Xác nhận phòng đã dọn xong</span>
                          </button>
                        ) : (
                          <div className="flex w-full min-h-[44px] items-center justify-center rounded-xl bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">
                            <span>Trạng thái: {roomStatusLabel(effectiveStatus)}</span>
                          </div>
                        )
                      ) : isFutureDate ? (
                        effectiveStatus === "available" ? (
                          <button
                            type="button"
                            onClick={() => openFutureReservationModal(room)}
                            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow-sm transition active:scale-[0.98] cursor-pointer"
                          >
                            <VsIcon name="event" className="text-base shrink-0" />
                            <span>Đặt trước phòng này</span>
                          </button>
                        ) : (
                          <div className="flex w-full min-h-[44px] items-center justify-center rounded-xl bg-slate-200/80 text-slate-700 text-xs font-bold border border-slate-300">
                            <span>Đã có lịch đặt / Đang bận</span>
                          </div>
                        )
                      ) : (
                        // Realtime / Today actions
                        effectiveStatus === "available" ? (
                          incomingOta && canManageStays ? (
                            <button
                              type="button"
                              onClick={() => void handleOtaFastCheckIn(incomingOta, room)}
                              className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs shadow-2xs transition active:scale-[0.98] cursor-pointer"
                            >
                              <VsIcon name="book_online" className="text-base shrink-0" />
                              <span>Nhận phòng {incomingOta.otaName}</span>
                            </button>
                          ) : (
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => openWalkIn(room)}
                                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[var(--primary)] hover:opacity-90 text-white font-extrabold text-xs shadow-2xs transition active:scale-[0.98] cursor-pointer"
                              >
                                <VsIcon name="login" className="text-base shrink-0" />
                                <span>Walk-in</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openFutureReservationModal(room)}
                                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] hover:bg-[var(--surface-container)] text-[var(--primary)] font-bold text-xs transition active:scale-[0.98] cursor-pointer"
                              >
                                <VsIcon name="event" className="text-base shrink-0" />
                                <span>Đặt trước</span>
                              </button>
                            </div>
                          )
                        ) : effectiveStatus === "processing" ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => void confirmRoomReady(room)}
                              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow-xs transition active:scale-[0.98] cursor-pointer col-span-full sm:col-span-1"
                            >
                              <VsIcon name="check_circle" className="text-base shrink-0" />
                              <span>Dọn xong</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void updateRoomStatus(room, "MAINTENANCE")}
                              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs transition active:scale-[0.98] cursor-pointer col-span-full sm:col-span-1"
                            >
                              <VsIcon name="build" className="text-base shrink-0" />
                              <span>Bảo trì</span>
                            </button>
                          </div>
                        ) : effectiveStatus === "occupied" ? (
                          <button
                            type="button"
                            onClick={() => {
                              setRoomQrPreview({
                                room,
                                guestUrl: getGuestQrUrl(room, window.location.origin),
                              });
                            }}
                            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-white/20 hover:bg-white/30 text-white font-extrabold text-xs shadow-2xs transition active:scale-[0.98] cursor-pointer"
                          >
                            <VsIcon name="qr_code_2" className="text-base shrink-0" />
                            <span>QR & Khách lưu trú</span>
                          </button>
                        ) : effectiveStatus === "overdue" ? (
                          <button
                            type="button"
                            onClick={() => void handleOverdueRoomClick(room)}
                            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs shadow-md transition active:scale-[0.98] cursor-pointer"
                          >
                            <VsIcon name="warning" className="text-base shrink-0" />
                            <span>Xử lý check-out quá hạn</span>
                          </button>
                        ) : effectiveStatus === "blocked" ? (
                          <button
                            type="button"
                            onClick={() => void toggleRoomBlocked(room)}
                            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow-2xs transition active:scale-[0.98] cursor-pointer"
                          >
                            <VsIcon name="lock_open" className="text-base shrink-0" />
                            <span>Mở khóa phòng → Trống</span>
                          </button>
                        ) : effectiveStatus === "maintenance" ? (
                          <button
                            type="button"
                            onClick={() => void updateRoomStatus(room, "AVAILABLE")}
                            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow-2xs transition active:scale-[0.98] cursor-pointer"
                          >
                            <VsIcon name="check_circle" className="text-base shrink-0" />
                            <span>Xong bảo trì → Trống</span>
                          </button>
                        ) : null
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredRooms.length === 0 && !isFetching ? (
              isUnassigned ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center col-span-full">
                  <VsIcon name="warning" className="text-3xl text-amber-600 mb-2 inline-block" />
                  <h3 className="font-bold text-base text-amber-950">Chưa gán phòng — tài khoản chưa thể thao tác vận hành</h3>
                  <p className="mt-1 text-xs text-amber-800 max-w-md mx-auto">
                    Khách sạn này áp dụng mô hình phân quyền độc quyền phòng. Vui lòng liên hệ Chủ khách sạn (Owner) để được gán phòng phụ trách.
                  </p>
                </div>
              ) : (
                <p className="rounded-xl border border-[var(--outline-variant)] bg-white p-8 text-center text-sm text-[var(--on-surface-variant)] col-span-full">
                  Không có phòng phù hợp với bộ lọc.
                </p>
              )
            ) : null}
          </div>
        </div>

        {totalPages > 1 ? (
          <div className="mt-6 flex flex-col gap-3 border-t border-[var(--outline-variant)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[var(--on-surface-variant)]">
              Hiển thị {filteredRooms.length} trên {totalItems} phòng
            </p>
            {renderPaginationButtons(page, totalPages, setPage)}
          </div>
        ) : null}
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

      {/* Walk-in Check-in Workspace */}
      {isCheckInOpen && selectedRoom ? (
        <CheckInWorkspace
          key={selectedRoom.id}
          open={isCheckInOpen}
          hotelId={hotelId}
          room={{ id: selectedRoom.id, roomNumber: getRoomNumber(selectedRoom), type: selectedRoom.type ?? undefined, status: "available" }}
          canManageStays={canManageStays}
          enabledFeatures={enabledFeatures}
          initialStayFields={{ plannedCheckOutAt: localDateTime(1, 12) }}
          submitState={saving ? 'submitting' : 'idle'}
          submitError={submitError}
          onSubmit={submitWalkIn}
          onClose={() => {
            if (saving) return;
            setIsCheckInOpen(false);
            setSelectedRoom(null);
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
          <div className="my-auto w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl sm:p-6 text-left">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--outline-variant)] pb-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">
                  Lịch đón khách
                </p>
                <h2 id="arrivals-modal-title" className="vs-display mt-0.5 text-2xl font-semibold text-[var(--primary)]">
                  Danh sách khách đến (Arrivals)
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsArrivalsOpen(false)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--primary)] hover:bg-[var(--surface-container-low)] min-h-[44px]"
              >
                <VsIcon name="close" />
              </button>
            </div>

            {/* Date Range Tabs */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setArrivalsRange("today");
                  void loadArrivals("today");
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition min-h-[44px] cursor-pointer ${
                  arrivalsRange === "today"
                    ? "bg-sky-700 text-white shadow-2xs"
                    : "bg-[var(--surface-container-low)] text-[var(--primary)] hover:bg-[var(--surface-container)]"
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
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition min-h-[44px] cursor-pointer ${
                  arrivalsRange === "tomorrow"
                    ? "bg-sky-700 text-white shadow-2xs"
                    : "bg-[var(--surface-container-low)] text-[var(--primary)] hover:bg-[var(--surface-container)]"
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
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition min-h-[44px] cursor-pointer ${
                  arrivalsRange === "week"
                    ? "bg-sky-700 text-white shadow-2xs"
                    : "bg-[var(--surface-container-low)] text-[var(--primary)] hover:bg-[var(--surface-container)]"
                }`}
              >
                7 ngày tới
              </button>
            </div>

            {/* List */}
            <div className="mt-4 max-h-[60vh] overflow-y-auto space-y-3 pr-1">
              {arrivalsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-700 border-t-transparent" />
                </div>
              ) : arrivalsList.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600">
                  Không có khách đến trong khoảng thời gian đã chọn.
                </div>
              ) : (
                arrivalsList.map((arrival) => {
                  const isToday = arrival.plannedCheckInAt?.slice(0, 10) === todayYmd;
                  return (
                    <div
                      key={arrival.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 hover:border-slate-300 transition"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-extrabold text-base text-slate-900 truncate">
                            {arrival.guestDisplayName}
                          </p>
                          {arrival.room?.roomNumber ? (
                            <span className="rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300 px-2 py-0.5 text-xs font-bold">
                              Phòng {arrival.room?.roomNumber}
                            </span>
                          ) : (
                            <span className="rounded-md bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 text-xs font-bold">
                              Chưa gán phòng
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                          <span>SĐT: {arrival.guestPhone || "Chưa có"}</span>
                          <span>Đến: {formatDateTime(arrival.plannedCheckInAt)}</span>
                          <span>Đi: {formatDateTime(arrival.plannedCheckOutAt)}</span>
                          {arrival.rate || arrival.nightlyRateSnapshot ? (
                            <span className="font-bold text-amber-900">
                              Giá: {formatMoney({ price: Number(arrival.rate || arrival.nightlyRateSnapshot) || null, currency: "VND" })}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            void SwalVietSage.fire({
                              title: `Chi tiết khách đến: ${arrival.guestDisplayName}`,
                              html: `
                                <div style="font-size:14px;text-align:left;line-height:1.6;color:#334155">
                                  <p><strong>Mã đặt phòng:</strong> ${arrival.id}</p>
                                  <p><strong>Họ tên:</strong> ${arrival.guestDisplayName}</p>
                                  <p><strong>Điện thoại:</strong> ${arrival.guestPhone || "Chưa có"}</p>
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
                          className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                        >
                          Xem chi tiết
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleAssignRoom(arrival)}
                          className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-amber-600 hover:bg-amber-700 px-3 text-xs font-bold text-white transition cursor-pointer"
                        >
                          {arrival.roomId ? "Đổi phòng" : "Gán phòng"}
                        </button>

                        {/* Strictly no early check-in for tomorrow or later: only today gets Check-in button */}
                        {isToday ? (
                          <button
                            type="button"
                            onClick={() => void handleCheckInArrival(arrival)}
                            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-emerald-700 hover:bg-emerald-800 px-3 text-xs font-bold text-white transition cursor-pointer"
                          >
                            Nhận phòng (Check-in)
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })
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
          <div className="my-auto w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6 text-left">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--outline-variant)] pb-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                  Đặt phòng trước
                </p>
                <h2 id="future-reservation-title" className="vs-display mt-0.5 text-2xl font-semibold text-[var(--primary)]">
                  Tạo lịch đặt phòng mới
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!reservationSubmitting) setIsReservationOpen(false);
                }}
                disabled={reservationSubmitting}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--primary)] hover:bg-[var(--surface-container-low)] min-h-[44px]"
              >
                <VsIcon name="close" />
              </button>
            </div>

            <form onSubmit={submitFutureReservation} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Họ và tên khách lưu trú <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={reservationGuestName}
                  onChange={(e) => setReservationGuestName(e.target.value)}
                  placeholder="VD: Nguyễn Văn An"
                  className="w-full h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] outline-none min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Số điện thoại
                </label>
                <input
                  type="tel"
                  value={reservationGuestPhone}
                  onChange={(e) => setReservationGuestPhone(e.target.value)}
                  placeholder="VD: 0912345678"
                  className="w-full h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] outline-none min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Chọn phòng (Tùy chọn)
                  </label>
                  <select
                    value={reservationRoomId}
                    onChange={(e) => {
                      setReservationRoomId(e.target.value);
                      const selected = rooms.find((r) => r.id === e.target.value);
                      if (selected?.price) {
                        setReservationNightlyRate(String(selected.price));
                      }
                    }}
                    className="w-full h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] outline-none min-h-[44px]"
                  >
                    <option value="">Chưa gán phòng (Gán sau)</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        Phòng {getRoomNumber(r)} ({r.type || "Tiêu chuẩn"})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Giá phòng mỗi đêm (VND)
                  </label>
                  <input
                    type="text"
                    value={reservationNightlyRate}
                    onChange={(e) => setReservationNightlyRate(e.target.value)}
                    placeholder="VD: 500000"
                    className="w-full h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] outline-none min-h-[44px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Thời gian nhận phòng (Check-in) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={reservationCheckIn}
                    onChange={(e) => setReservationCheckIn(e.target.value)}
                    className="w-full h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] outline-none min-h-[44px]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Thời gian trả phòng (Check-out) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={reservationCheckOut}
                    onChange={(e) => setReservationCheckOut(e.target.value)}
                    className="w-full h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] outline-none min-h-[44px]"
                  />
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-3 border-t border-[var(--outline-variant)] pt-3">
                <button
                  type="button"
                  onClick={() => setIsReservationOpen(false)}
                  disabled={reservationSubmitting}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-100 transition min-h-[44px] cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={reservationSubmitting}
                  className="px-5 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-sm font-bold text-white transition min-h-[44px] cursor-pointer flex items-center gap-2 disabled:opacity-60"
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
    </div>
  );
}
