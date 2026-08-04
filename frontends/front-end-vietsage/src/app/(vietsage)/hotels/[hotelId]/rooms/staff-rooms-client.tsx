"use client";

import { createPortal } from "react-dom";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
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
import type {
  HotelArrival,
  HotelCheckInResult,
  HotelOpsPage,
  HotelReservationCheckInResult,
  HotelRoomSummary,
} from "@/features/hotel-ops/types/hotel-ops-contract";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";

type Props = {
  hotelId: string;
  initialRoomsPage: HotelOpsPage<HotelRoomSummary>;
  arrivals: HotelArrival[];
  canManageRooms: boolean;
  canManageReservations: boolean;
  canManageStays: boolean;
};

type RoomStatusFilter =
  | "all"
  | "available"
  | "occupied"
  | "overdue"
  | "processing"
  | "maintenance"
  | "blocked";
type FlowMode = "walk-in" | "reservation";


type ReservationForm = {
  roomId: string;
  guestDisplayName: string;
  guestPhone: string;
  plannedCheckInAt: string;
  plannedCheckOutAt: string;
};

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


function emptyReservation(roomId = ""): ReservationForm {
  return {
    roomId,
    guestDisplayName: "",
    guestPhone: "",
    plannedCheckInAt: localDateTime(0, 14),
    plannedCheckOutAt: localDateTime(1, 12),
  };
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
  arrivals,
  canManageRooms,
  canManageReservations,
  canManageStays,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const apiBase = `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}`;


  const [page, setPage] = useState(1);
  const [pageSize] = useState(100);
  const [inputQuery, setInputQuery] = useState("");
  const [query, setQuery] = useState("");
  const [floor, setFloor] = useState("all");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState<RoomStatusFilter>("all");
  const [vipOnly, setVipOnly] = useState(false);
  const [flow, setFlow] = useState<FlowMode>("walk-in");
  const [selectedRoom, setSelectedRoom] = useState<HotelRoomSummary | null>(
    null,
  );
  const [roomQrPreview, setRoomQrPreview] = useState<RoomQrPreview | null>(
    null,
  );
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>();

  const [reservationForm, setReservationForm] = useState<ReservationForm>(() =>
    emptyReservation(),
  );
  const [saving, setSaving] = useState(false);

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
  } = useQuery({
    ...staffRoomsResource.bind({ hotelId }).queries.list.options({
      page,
      limit: pageSize,
      q: query,
      status,
      floor,
      type,
      vipOnly,
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
      !vipOnly
        ? initialRoomsPage
        : undefined,
  });

  const rooms = useMemo(() => roomsPage?.items ?? [], [roomsPage?.items]);
  const floors = useMemo(() => {
    const rawFloors = roomsPage?.floors ?? initialRoomsPage.floors ?? [];
    return [...new Set(rawFloors)].sort((a, b) => a.localeCompare(b));
  }, [roomsPage?.floors, initialRoomsPage.floors]);

  const types = useMemo(() => {
    const rawTypes = roomsPage?.types ?? initialRoomsPage.types ?? [];
    return [...new Set(rawTypes)].sort((a, b) => a.localeCompare(b));
  }, [roomsPage?.types, initialRoomsPage.types]);

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

  const availableRooms = useMemo(() => rooms.filter(isAvailable), [rooms]);

  function openWalkIn(room: HotelRoomSummary) {
    if (!isAvailable(room) || !canManageStays) return;
    setSelectedRoom(room);
    setSubmitError(undefined);
    setIsCheckInOpen(true);
  }

  async function markRoomCleaned(room: HotelRoomSummary) {
    const confirmation = await Swal.fire({
      icon: "question",
      title: `Hoàn tất dọn phòng ${room.roomNumber ?? room.id}?`,
      text: "Xác nhận phòng đã được dọn dẹp sạch sẽ và sẵn sàng đón khách mới.",
      showCancelButton: true,
      confirmButtonText: "Chuyển sang TRỐNG (Sẵn sàng)",
      cancelButtonText: "Hủy",
      confirmButtonColor: "#17201b",
    });

    if (!confirmation.isConfirmed) return;

    try {
      await requestInternalApiEnvelope(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/rooms/${encodeURIComponent(room.id)}`,
        {
          method: "PATCH",
          body: { status: "AVAILABLE" },
        },
      );
      await Swal.fire({
        icon: "success",
        title: `Phòng ${room.roomNumber ?? room.id} đã sẵn sàng!`,
        text: "Trạng thái phòng đã chuyển thành TRỐNG.",
        confirmButtonColor: "#17201b",
      });
      void refetch();
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "Không thể cập nhật trạng thái phòng",
        text: error instanceof Error ? error.message : "Vui lòng thử lại.",
        confirmButtonColor: "#17201b",
      });
    }
  }

  async function toggleRoomBlocked(room: HotelRoomSummary) {
    const isBlocked = getRoomStatus(room) === "blocked";
    const confirmation = await Swal.fire({
      icon: isBlocked ? "question" : "warning",
      title: isBlocked
        ? `Mở khóa phòng ${getRoomNumber(room)}?`
        : `Khóa phòng ${getRoomNumber(room)}?`,
      text: isBlocked
        ? "Phòng sẽ trở lại trạng thái TRỐNG và có thể được sử dụng."
        : "Phòng sẽ không thể được đặt, gán booking hoặc check-in cho đến khi mở khóa.",
      showCancelButton: true,
      confirmButtonText: isBlocked ? "Mở khóa phòng" : "Khóa phòng",
      cancelButtonText: "Hủy",
      confirmButtonColor: isBlocked ? "#17201b" : "#ba1a1a",
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
      await Swal.fire({
        icon: "success",
        title: isBlocked ? "Đã mở khóa phòng" : "Đã khóa phòng",
        confirmButtonColor: "#17201b",
      });
      void refetch();
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "Không thể cập nhật trạng thái phòng",
        text: error instanceof Error ? error.message : "Vui lòng thử lại.",
        confirmButtonColor: "#17201b",
      });
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
    const confirmation = await Swal.fire({
      icon: "question",
      title: `Chuyển phòng ${roomNum} sang ${labels[targetStatus]}?`,
      text: `Xác nhận cập nhật trạng thái phòng ${roomNum}.`,
      showCancelButton: true,
      confirmButtonText: "Xác nhận chuyển",
      cancelButtonText: "Hủy",
      confirmButtonColor: "#17201b",
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
      await Swal.fire({
        icon: "success",
        title: `Phòng ${roomNum} đã chuyển sang ${labels[targetStatus]}!`,
        confirmButtonColor: "#17201b",
      });
      void refetch();
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "Không thể cập nhật trạng thái phòng",
        text: error instanceof Error ? error.message : "Vui lòng thử lại.",
        confirmButtonColor: "#17201b",
      });
    }
  }

  async function handleBlockedRoomClick(room: HotelRoomSummary) {
    const roomNum = getRoomNumber(room);
    await Swal.fire({
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
          Swal.close();
          void updateRoomStatus(room, "AVAILABLE");
        });
        btnMaintenance?.addEventListener("click", () => {
          Swal.close();
          void updateRoomStatus(room, "MAINTENANCE");
        });
        btnProcessing?.addEventListener("click", () => {
          Swal.close();
          void updateRoomStatus(room, "PROCESSING");
        });
      },
    });
  }

  async function handleMaintenanceRoomClick(room: HotelRoomSummary) {
    const roomNum = getRoomNumber(room);
    await Swal.fire({
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
          Swal.close();
          void updateRoomStatus(room, "AVAILABLE");
        });
        btnBlocked?.addEventListener("click", () => {
          Swal.close();
          void updateRoomStatus(room, "BLOCKED");
        });
        btnProcessing?.addEventListener("click", () => {
          Swal.close();
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

    await Swal.fire({
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
          Swal.close();
          const params = new URLSearchParams();
          if (roomNum) params.set("roomNumber", roomNum);
          if (stay?.id) params.set("stayId", stay.id);
          if (room.id) params.set("roomId", room.id);
          router.push(`/hotels/${encodeURIComponent(hotelId)}/billing?${params.toString()}`);
        });

        btnExtend?.addEventListener("click", () => {
          Swal.close();
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

    const { value: newCheckOut } = await Swal.fire({
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
      confirmButtonColor: "#2563eb",
      preConfirm: () => {
        const input = document.getElementById("swal-input-checkout") as HTMLInputElement | null;
        if (!input || !input.value) {
          Swal.showValidationMessage("Vui lòng chọn thời gian check-out mới");
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
      await Swal.fire({
        icon: "success",
        title: `Đã gia hạn phòng ${roomNum}!`,
        text: `Thời gian check-out mới: ${formatDateTime(newCheckOut)}`,
        confirmButtonColor: "#17201b",
      });
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      router.refresh();
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "Không thể gia hạn phòng",
        text: error instanceof Error ? error.message : "Vui lòng thử lại.",
        confirmButtonColor: "#17201b",
      });
    }
  }

  function handleCardClick(room: HotelRoomSummary) {
    const roomStatus = getRoomStatus(room);
    if (roomStatus === "overdue") {
      void handleOverdueRoomClick(room);
    } else if (roomStatus === "available") {
      openWalkIn(room);
    } else if (roomStatus === "occupied") {
      setRoomQrPreview({
        room,
        guestUrl: getGuestQrUrl(room, window.location.origin),
      });
    } else if (roomStatus === "processing") {
      void markRoomCleaned(room);
    } else if (roomStatus === "blocked") {
      void handleBlockedRoomClick(room);
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

    const confirmation = await Swal.fire({
      icon: "question",
      title: "Xác nhận mở phòng check-in?",
      text: `Mở phòng ${getRoomNumber(selectedRoom)} cho khách "${fields.guestDisplayName.trim()}". Hệ thống sẽ kích hoạt QR và mã GuestOS ngay.`,
      showCancelButton: true,
      confirmButtonText: "Xác nhận mở phòng",
      cancelButtonText: "Hủy",
      confirmButtonColor: "#00003c",
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
      await Swal.fire({
        icon: "success",
        title: "Đã mở phòng",
        text: `Mã GuestOS: ${result.data.accessCode}.`,
        confirmButtonColor: "#00003c",
      });
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      router.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Vui lòng thử lại.");
      await Swal.fire({
        icon: "error",
        title: "Không thể mở phòng",
        text: error instanceof Error ? error.message : "Vui lòng thử lại.",
        confirmButtonColor: "#00003c",
      });
    } finally {
      setSaving(false);
    }
  }

  async function createReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const confirmation = await Swal.fire({
      icon: "question",
      title: "Xác nhận tạo đặt phòng?",
      text: `Tạo đặt trước cho khách "${reservationForm.guestDisplayName.trim()}".`,
      showCancelButton: true,
      confirmButtonText: "Tạo đặt phòng",
      cancelButtonText: "Hủy",
      confirmButtonColor: "#00003c",
    });

    if (!confirmation.isConfirmed) return;

    setSaving(true);
    try {
      await requestInternalApiEnvelope(`${apiBase}/reservations`, {
        method: "POST",
        body: {
          guestDisplayName: reservationForm.guestDisplayName.trim(),
          ...(reservationForm.guestPhone.trim()
            ? { guestPhone: reservationForm.guestPhone.trim() }
            : {}),
          plannedCheckInAt: new Date(
            reservationForm.plannedCheckInAt,
          ).toISOString(),
          plannedCheckOutAt: new Date(
            reservationForm.plannedCheckOutAt,
          ).toISOString(),
          ...(reservationForm.roomId ? { roomId: reservationForm.roomId } : {}),
        },
      });
      setReservationForm(emptyReservation());
      await Swal.fire({
        icon: "success",
        title: "Đã tạo đặt phòng",
        timer: 1400,
        showConfirmButton: false,
      });
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      router.refresh();
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "Không thể tạo đặt phòng",
        text: error instanceof Error ? error.message : "Vui lòng thử lại.",
        confirmButtonColor: "#00003c",
      });
    } finally {
      setSaving(false);
    }
  }

  async function assignArrivalRoom(arrival: HotelArrival) {
    const options = Object.fromEntries(
      availableRooms.map((room) => [
        room.id,
        `Phòng ${getRoomNumber(room)} · ${room.type ?? "Tiêu chuẩn"}`,
      ]),
    );
    const result = await Swal.fire({
      title: `Gán phòng cho ${arrival.guestDisplayName}`,
      input: "select",
      inputOptions: options,
      inputPlaceholder: "Chọn phòng trống",
      showCancelButton: true,
      confirmButtonText: "Gán phòng",
      cancelButtonText: "Hủy",
      confirmButtonColor: "#00003c",
      inputValidator: (value) => (value ? undefined : "Hãy chọn phòng."),
    });
    if (!result.isConfirmed || !result.value) return;
    try {
      await requestInternalApiEnvelope(
        `${apiBase}/reservations/${encodeURIComponent(arrival.id)}/room`,
        { method: "PUT", body: { roomId: result.value } },
      );
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      router.refresh();
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "Không thể gán phòng",
        text: error instanceof Error ? error.message : "Vui lòng thử lại.",
        confirmButtonColor: "#00003c",
      });
    }
  }

  async function checkInArrival(arrival: HotelArrival) {
    const confirmation = await Swal.fire({
      icon: "question",
      title: `Check-in ${arrival.guestDisplayName}?`,
      text: "Hệ thống sẽ mở stay, folio và kích hoạt QR phòng.",
      showCancelButton: true,
      confirmButtonText: "Check-in",
      cancelButtonText: "Hủy",
      confirmButtonColor: "#00003c",
    });
    if (!confirmation.isConfirmed) return;
    try {
      const result =
        await requestInternalApiEnvelope<HotelReservationCheckInResult>(
          `${apiBase}/reservations/${encodeURIComponent(arrival.id)}/check-in`,
          { method: "POST" },
        );
      await Swal.fire({
        icon: "success",
        title: "Check-in hoàn tất",
        text: result.data.accessCode
          ? `Mã GuestOS: ${result.data.accessCode}`
          : "QR phòng đã sẵn sàng.",
        confirmButtonColor: "#00003c",
      });
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      router.refresh();
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "Không thể check-in",
        text: error instanceof Error ? error.message : "Vui lòng thử lại.",
        confirmButtonColor: "#00003c",
      });
    }
  }

  return (
    <div className="space-y-8">
      <style>{`
        @keyframes quickCheckInEntrance {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-quick-check-in {
          animation: quickCheckInEntrance 480ms cubic-bezier(0.25, 1, 0.35, 1) forwards;
        }
        @keyframes subtleFlash {
          0% {
            box-shadow: 0 4px 20px rgba(0,0,0,0.05);
            border-color: var(--outline-variant);
          }
          30% {
            box-shadow: 0 0 0 4px rgba(0, 0, 60, 0.2);
            border-color: var(--primary);
          }
          100% {
            box-shadow: 0 4px 20px rgba(0,0,0,0.05);
            border-color: var(--outline-variant);
          }
        }
        .animate-subtle-flash {
          animation: subtleFlash 1400ms ease-out;
        }
      `}</style>

      <section className="sticky top-0 z-20 -mx-2 rounded-xl bg-[var(--surface)]/90 px-2 py-3 backdrop-blur md:top-2">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative min-w-0 flex-1 lg:max-w-xs">
              <VsIcon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[var(--outline)]"
              />
              <input
                value={inputQuery}
                onChange={(event) => setInputQuery(event.target.value)}
                className="h-11 w-full rounded-lg border-0 bg-[var(--surface-container-low)] pl-10 pr-4 text-sm outline-none ring-1 ring-transparent focus:ring-[var(--primary)]"
                placeholder="Tìm kiếm phòng hoặc khách..."
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-3 lg:flex">
              <select
                value={floor}
                onChange={(event) => {
                  setFloor(event.target.value);
                  setPage(1);
                }}
                className="h-11 rounded-lg border-0 bg-[var(--surface-container-low)] px-3 text-sm ring-1 ring-transparent focus:ring-[var(--primary)]"
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
                className="h-11 rounded-lg border-0 bg-[var(--surface-container-low)] px-3 text-sm ring-1 ring-transparent focus:ring-[var(--primary)]"
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
                className="h-11 rounded-lg border-0 bg-[var(--surface-container-low)] px-3 text-sm ring-1 ring-transparent focus:ring-[var(--primary)]"
              >
                {statusFilters.map((item) => (
                  <option key={item.value} value={item.value}>
                    Trạng thái: {item.label}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" onClick={printActiveStayList} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-bold text-white hover:opacity-90">
              <VsIcon name="print" className="text-base" />
              In danh sách lưu trú
            </button>
          </div>
          <div className="flex items-center justify-between gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--on-surface-variant)]">
              <input
                type="checkbox"
                checked={vipOnly}
                onChange={(event) => {
                  setVipOnly(event.target.checked);
                  setPage(1);
                }}
                className="rounded border-[var(--outline-variant)] text-[var(--primary)] focus:ring-[var(--primary)]"
              />
              Chế độ VIP
            </label>
            <div className="grid grid-cols-2 gap-4 border-l border-[var(--outline-variant)] pl-4 text-center">
              <div>
                <p className="text-xs text-[var(--on-surface-variant)]">Tổng</p>
                <p className="font-bold text-[var(--primary)]">{totalItems}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--on-surface-variant)]">
                  Khả dụng
                </p>
                <p className="font-bold text-[var(--secondary)]">
                  {totalAvailable}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="relative min-h-[400px] flex flex-col justify-between">
          <div className="relative flex-1">
            {isFetching && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 backdrop-blur-[1px] rounded-xl transition-all">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {rooms.map((room) => {
                const roomStatus = getRoomStatus(room);
                const progress = activeStayProgress(room);
                const isVip = /suite|vip|premium|penthouse/i.test(
                  room.type ?? "",
                );
                const isInteractiveCard =
                  (roomStatus === "available" && canManageStays) ||
                  roomStatus === "occupied" ||
                  roomStatus === "overdue" ||
                  roomStatus === "processing" ||
                  roomStatus === "blocked" ||
                  roomStatus === "maintenance";
                return (
                  <div
                    key={room.id}
                    onClick={() => handleCardClick(room)}
                    className={`flex flex-col justify-between h-full min-h-[235px] rounded-2xl border p-5 text-left shadow-[0_4px_20px_rgba(0,0,0,0.05)] transition-all ${
                      isInteractiveCard
                        ? "cursor-pointer hover:-translate-y-0.5"
                        : ""
                    } ${roomCardClass(roomStatus)}`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="vs-display text-3xl font-semibold">
                          {getRoomNumber(room)}
                        </h3>
                        <p
                          className={
                            roomStatus === "occupied" || roomStatus === "overdue"
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
                            ? roomStatus === "occupied" || roomStatus === "overdue"
                              ? "rounded-full bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 px-3 py-1 text-xs font-black text-slate-950 shadow-xs border border-yellow-200 tracking-wider shrink-0"
                              : "rounded-full bg-slate-900 px-3 py-1 text-xs font-black text-amber-300 shadow-xs border border-amber-400/80 tracking-wider shrink-0"
                            : "rounded-full bg-[var(--surface-container-high)] px-3 py-1 text-xs font-bold text-[var(--on-surface-variant)] shrink-0"
                        }
                      >
                        {isVip
                          ? "VIP"
                          : room.floor
                            ? `Tầng ${room.floor}`
                            : roomStatusLabel(roomStatus)}
                      </span>
                    </div>

                    {/* Middle Body */}
                    <div className="my-3 flex-1 flex flex-col justify-center">
                      <p
                        className={
                          roomStatus === "overdue"
                            ? "text-xs uppercase tracking-[0.18em] text-red-300 font-bold"
                            : roomStatus === "occupied"
                              ? "text-xs uppercase tracking-[0.18em] text-white/70 font-semibold"
                              : roomStatus === "maintenance"
                                ? "text-xs uppercase tracking-[0.18em] text-rose-900/80 font-bold"
                                : roomStatus === "blocked"
                                  ? "text-xs uppercase tracking-[0.18em] text-slate-700 font-bold"
                                  : roomStatus === "processing"
                                    ? "text-xs uppercase tracking-[0.18em] text-amber-900/80 font-bold"
                                    : "text-xs uppercase tracking-[0.18em] text-emerald-800/80 font-bold"
                        }
                      >
                        {roomStatus === "overdue" ? "⚠️ Cảnh báo quá hạn" : "Khách hàng"}
                      </p>
                      <div
                        className={
                          roomStatus === "overdue"
                            ? "mt-1 font-extrabold text-red-200 text-sm flex items-center gap-1.5"
                            : roomStatus === "occupied"
                              ? "mt-1 font-bold text-white text-base"
                              : roomStatus === "maintenance"
                                ? "mt-1.5 font-extrabold text-rose-900 text-sm flex items-center gap-1.5"
                                : roomStatus === "blocked"
                                  ? "mt-1.5 font-extrabold text-slate-900 text-sm flex items-center gap-1.5"
                                  : roomStatus === "processing"
                                    ? "mt-1.5 font-extrabold text-amber-950 text-sm flex items-center gap-1.5"
                                    : "mt-1.5 font-extrabold text-emerald-900 text-sm flex items-center gap-1.5"
                        }
                      >
                        {roomStatus === "overdue" ? (
                          <>
                            <VsIcon name="warning" className="text-base text-red-400 shrink-0 animate-bounce" />
                            <span>{room.activeStay?.guestDisplayName ?? "Khách chưa check-out"}</span>
                          </>
                        ) : roomStatus === "occupied" ? (
                          room.activeStay?.guestDisplayName ?? "Khách lưu trú (Đã nhận phòng)"
                        ) : roomStatus === "processing" ? (
                          <>
                            <VsIcon name="cleaning_services" className="text-base text-amber-700 shrink-0" />
                            <span>Đang chờ dọn dẹp...</span>
                          </>
                        ) : roomStatus === "available" ? (
                          <>
                            <VsIcon name="check_circle" className="text-base text-emerald-600 shrink-0" />
                            <span>Sẵn sàng đón khách</span>
                          </>
                        ) : roomStatus === "blocked" ? (
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
                        roomStatus === "occupied"
                          ? "mt-auto border-t border-white/15 pt-3.5"
                          : "mt-auto border-t border-[var(--outline-variant)]/40 pt-3.5"
                      }
                    >
                      {roomStatus === "occupied" ? (
                        <>
                          <div className="mb-1 flex justify-between text-xs text-white/65">
                            <span>
                              {formatDateTime(
                                room.activeStay?.checkedInAt ??
                                  room.activeStay?.plannedCheckInAt,
                              )}
                            </span>
                            <span>
                              {formatDateTime(
                                room.activeStay?.plannedCheckOutAt,
                              )}
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

                      <div className="mt-3 flex items-center justify-between gap-2 overflow-hidden">
                        <span
                          className="min-w-0 truncate text-xs font-extrabold text-amber-950 bg-amber-100/90 border border-amber-300 px-2 py-0.5 rounded-md shadow-2xs"
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
                        <span className={roomStatusBadgeClass(roomStatus)}>
                          {roomStatusLabel(roomStatus)}
                        </span>
                      </div>

                      {roomStatus !== "occupied" ? (
                        <div className="group relative mt-3 w-full">
                          {/* Animated hover popover menu */}
                          <div className="absolute bottom-full left-0 right-0 mb-2 z-30 pointer-events-none opacity-0 translate-y-2 scale-95 transition-all duration-200 ease-out group-hover:pointer-events-auto group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus-within:scale-100 rounded-2xl border border-[var(--outline-variant)] bg-white/95 p-1.5 shadow-2xl backdrop-blur-md">
                            <div className="flex flex-col gap-1">
                              {/* Cleaning Action */}
                              {roomStatus === "processing" ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    markRoomCleaned(room);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-xl bg-amber-700 py-2 px-3 text-xs font-extrabold text-white shadow-xs hover:bg-amber-800 transition text-left"
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
                                    updateRoomStatus(room, "PROCESSING");
                                  }}
                                  className="flex w-full items-center gap-2 rounded-xl bg-amber-600/90 py-2 px-3 text-xs font-extrabold text-white shadow-xs hover:bg-amber-700 transition text-left"
                                >
                                  <VsIcon
                                    name="cleaning_services"
                                    className="text-base shrink-0"
                                  />
                                  <span>Chuyển CHỜ DỌN DẸP</span>
                                </button>
                              )}

                              {/* Maintenance Action */}
                              {roomStatus === "maintenance" ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    updateRoomStatus(room, "AVAILABLE");
                                  }}
                                  className="flex w-full items-center gap-2 rounded-xl bg-emerald-700 py-2 px-3 text-xs font-extrabold text-white shadow-xs hover:bg-emerald-800 transition text-left"
                                >
                                  <VsIcon
                                    name="build"
                                    className="text-base shrink-0"
                                  />
                                  <span>Xong bảo trì → Chuyển TRỐNG</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    updateRoomStatus(room, "MAINTENANCE");
                                  }}
                                  className="flex w-full items-center gap-2 rounded-xl bg-slate-700 py-2 px-3 text-xs font-extrabold text-white shadow-xs hover:bg-slate-800 transition text-left"
                                >
                                  <VsIcon
                                    name="build"
                                    className="text-base shrink-0"
                                  />
                                  <span>Đánh dấu BẢO TRÌ</span>
                                </button>
                              )}

                              {/* Lock / Unlock Action */}
                              {canManageRooms ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleRoomBlocked(room);
                                  }}
                                  className={`flex w-full items-center gap-2 rounded-xl py-2 px-3 text-xs font-extrabold shadow-xs transition text-left ${
                                    roomStatus === "blocked"
                                      ? "bg-emerald-700 text-white hover:bg-emerald-800"
                                      : "bg-rose-700 text-white hover:bg-rose-800"
                                  }`}
                                >
                                  <VsIcon
                                    name={
                                      roomStatus === "blocked"
                                        ? "lock_open"
                                        : "block"
                                    }
                                    className="text-base shrink-0"
                                  />
                                  <span>
                                    {roomStatus === "blocked"
                                      ? "Mở khóa → Chuyển TRỐNG"
                                      : "Khóa phòng"}
                                  </span>
                                </button>
                              ) : null}
                            </div>
                          </div>

                          {/* Single Update Trigger Button */}
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleCardClick(room);
                            }}
                            className="flex w-full items-center justify-between gap-1.5 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] py-2 px-3 text-xs font-extrabold text-[var(--primary)] transition hover:border-[var(--primary)] hover:bg-[var(--primary)] hover:text-white"
                          >
                            <span className="flex items-center gap-1.5">
                              <VsIcon name="tune" className="text-base" />
                              Cập nhật phòng
                            </span>
                            <VsIcon
                              name="keyboard_arrow_up"
                              className="text-base transition-transform duration-200 group-hover:-translate-y-0.5"
                            />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {rooms.length === 0 && !isFetching ? (
                <p className="rounded-xl border border-[var(--outline-variant)] bg-white p-8 text-center text-sm text-[var(--on-surface-variant)] sm:col-span-2 xl:col-span-3">
                  Không có phòng phù hợp với bộ lọc.
                </p>
              ) : null}
            </div>
          </div>

          {totalPages > 1 ? (
            <div className="mt-6 flex flex-col gap-3 border-t border-[var(--outline-variant)] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[var(--on-surface-variant)]">
                Hiển thị {rooms.length} trên {totalItems} phòng
              </p>
              {renderPaginationButtons(page, totalPages, setPage)}
            </div>
          ) : null}
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-[var(--outline-variant)] bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
            <div className="flex rounded-lg bg-[var(--surface-container-low)] p-1">
              <button
                type="button"
                onClick={() => setFlow("walk-in")}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold ${flow === "walk-in" ? "bg-[var(--primary)] text-white" : "text-[var(--on-surface-variant)]"}`}
              >
                Mở phòng mới
              </button>
              <button
                type="button"
                onClick={() => setFlow("reservation")}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold ${flow === "reservation" ? "bg-[var(--primary)] text-white" : "text-[var(--on-surface-variant)]"}`}
              >
                Đặt trước
              </button>
            </div>

            {flow === "walk-in" ? (
              <div className="mt-5 p-6 border border-dashed border-[var(--outline-variant)] rounded-xl text-center">
                <VsIcon name="login" className="text-4xl text-[var(--primary)] opacity-50 mb-2" />
                <h3 className="font-semibold text-[var(--primary)] text-lg">Check-in nhanh</h3>
                <p className="text-sm text-[var(--on-surface-variant)] mt-1">
                  Chọn một phòng TRỐNG trên lưới để mở giao diện Check-in.
                </p>
              </div>
            ) : (
              <form
                key="reservation-form"
                onSubmit={createReservation}
                className="mt-5 space-y-4 animate-quick-check-in"
              >
                <div>
                  <h2 className="vs-display text-2xl font-semibold text-[var(--primary)]">
                    Tạo đặt phòng
                  </h2>
                  <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
                    Đặt trước được hiển thị trong hàng đợi bên dưới để gán phòng
                    và check-in.
                  </p>
                </div>
                <select
                  value={reservationForm.roomId}
                  onChange={(event) => {
                    const room =
                      rooms.find((item) => item.id === event.target.value) ??
                      null;
                    setSelectedRoom(room);
                    setReservationForm((current) => ({
                      ...current,
                      roomId: event.target.value,
                    }));
                  }}
                  className="h-12 w-full rounded-lg border-0 bg-[var(--surface-container-low)] px-3 text-sm ring-1 ring-transparent focus:ring-[var(--primary)]"
                >
                  <option value="">Chọn phòng trống (tùy chọn)</option>
                  {availableRooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      Phòng {getRoomNumber(room)} · {room.type ?? "Tiêu chuẩn"}
                    </option>
                  ))}
                </select>
                <input
                  required
                  minLength={2}
                  value={reservationForm.guestDisplayName}
                  onChange={(event) =>
                    setReservationForm((current) => ({
                      ...current,
                      guestDisplayName: event.target.value,
                    }))
                  }
                  className="h-12 w-full rounded-lg border-0 bg-[var(--surface-container-low)] px-4 text-sm ring-1 ring-transparent focus:ring-[var(--primary)]"
                  placeholder="Tên khách"
                />
                <input
                  value={reservationForm.guestPhone}
                  onChange={(event) =>
                    setReservationForm((current) => ({
                      ...current,
                      guestPhone: event.target.value,
                    }))
                  }
                  className="h-12 w-full rounded-lg border-0 bg-[var(--surface-container-low)] px-4 text-sm ring-1 ring-transparent focus:ring-[var(--primary)]"
                  placeholder="Số điện thoại"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    required
                    type="datetime-local"
                    value={reservationForm.plannedCheckInAt}
                    onChange={(event) =>
                      setReservationForm((current) => ({
                        ...current,
                        plannedCheckInAt: event.target.value,
                      }))
                    }
                    className="h-12 rounded-lg border-0 bg-[var(--surface-container-low)] px-3 text-sm ring-1 ring-transparent focus:ring-[var(--primary)]"
                  />
                  <input
                    required
                    type="datetime-local"
                    value={reservationForm.plannedCheckOutAt}
                    onChange={(event) =>
                      setReservationForm((current) => ({
                        ...current,
                        plannedCheckOutAt: event.target.value,
                      }))
                    }
                    className="h-12 rounded-lg border-0 bg-[var(--surface-container-low)] px-3 text-sm ring-1 ring-transparent focus:ring-[var(--primary)]"
                  />
                </div>
                <button
                  disabled={saving || !canManageReservations}
                  className="h-12 w-full rounded-full bg-[var(--primary)] px-5 text-sm font-bold text-white disabled:opacity-50"
                >
                  {saving ? "Đang tạo..." : "Tạo đặt phòng"}
                </button>
              </form>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-[var(--outline-variant)] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
            <div className="border-b border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--secondary)]">
                7 ngày tới
              </p>
              <h2 className="vs-display text-2xl font-semibold text-[var(--primary)]">
                Khách chờ đến
              </h2>
            </div>
            <div className="max-h-[32rem] divide-y divide-[var(--outline-variant)] overflow-y-auto">
              {arrivals.map((arrival) => {
                const room = rooms.find((item) => item.id === arrival.roomId);
                return (
                  <article key={arrival.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-[var(--primary)]">
                          {arrival.reservationCode}
                        </p>
                        <p className="mt-1 text-sm font-semibold">
                          {arrival.guestDisplayName}
                        </p>
                        <p className="mt-1 text-xs text-[var(--on-surface-variant)]">
                          {formatDateTime(arrival.plannedCheckInAt)} đến{" "}
                          {formatDateTime(arrival.plannedCheckOutAt)}
                        </p>
                      </div>
                      <span className="rounded-full bg-[var(--primary-fixed)] px-3 py-1 text-xs font-bold text-[var(--on-primary-fixed)]">
                        {arrival.status}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-[var(--on-surface-variant)]">
                      {room ? `Phòng ${getRoomNumber(room)}` : "Chưa gán phòng"}
                    </p>
                    {canManageReservations &&
                    arrival.status !== "CHECKED_IN" ? (
                      <div className="mt-3 flex gap-2">
                        {arrival.roomId ? (
                          <button
                            type="button"
                            onClick={() => void checkInArrival(arrival)}
                            className="rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-bold text-white"
                          >
                            Check-in
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void assignArrivalRoom(arrival)}
                            className="rounded-lg border border-[var(--outline-variant)] px-3 py-2 text-xs font-bold text-[var(--primary)]"
                          >
                            Gán phòng
                          </button>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })}
              {arrivals.length === 0 ? (
                <p className="p-5 text-center text-sm text-[var(--on-surface-variant)]">
                  Không có khách dự kiến đến trong 7 ngày tới.
                </p>
              ) : null}
            </div>
          </div>
        </aside>
      </section>
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
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--primary)] transition hover:bg-[var(--surface-container-low)]"
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

      {isCheckInOpen && selectedRoom ? (
        <CheckInWorkspace
          key={selectedRoom.id}
          open={isCheckInOpen}
          hotelId={hotelId}
          room={{ id: selectedRoom.id, roomNumber: getRoomNumber(selectedRoom), type: selectedRoom.type ?? undefined, status: "available" }}
          canManageStays={canManageStays}
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
    </div>
  );
}
