"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
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

type RoomStatusFilter = "all" | "available" | "occupied" | "processing" | "maintenance";
type FlowMode = "walk-in" | "reservation";

type WalkInForm = {
  roomId: string;
  guestDisplayName: string;
  guestPhone: string;
  plannedCheckOutAt: string;
};

type ReservationForm = {
  roomId: string;
  guestDisplayName: string;
  guestPhone: string;
  plannedCheckInAt: string;
  plannedCheckOutAt: string;
};

const statusFilters: Array<{ value: RoomStatusFilter; label: string }> = [
  { value: "all", label: "Tất cả" },
  { value: "available", label: "Trống" },
  { value: "occupied", label: "Đang ở" },
  { value: "processing", label: "Chờ dọn" },
  { value: "maintenance", label: "Bảo trì" },
];

function localDateTime(offsetDays: number, hour: number): string {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  value.setHours(hour, 0, 0, 0);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
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

function getRoomStatus(room: HotelRoomSummary): RoomStatusFilter {
  const status = room.status?.toUpperCase();
  if (room.activeStay || status === "OCCUPIED" || status === "RESERVED") return "occupied";
  if (status === "PROCESSING") return "processing";
  if (status === "MAINTENANCE" || status === "OUT_OF_SERVICE") return "maintenance";
  return "available";
}

function roomStatusLabel(status: RoomStatusFilter): string {
  if (status === "available") return "TRỐNG";
  if (status === "occupied") return "ĐANG Ở";
  if (status === "processing") return "CHỜ DỌN";
  if (status === "maintenance") return "BẢO TRÌ";
  return "TẤT CẢ";
}

function roomCardClass(status: RoomStatusFilter): string {
  if (status === "occupied") return "border-[var(--primary)] bg-[var(--primary)] text-[var(--on-primary)]";
  if (status === "processing") return "border-l-4 border-l-[var(--secondary)] bg-[var(--surface-container-low)] text-[var(--primary)]";
  if (status === "maintenance") return "border-l-4 border-l-[var(--error)] bg-[var(--error-container)]/45 text-[var(--on-error-container)]";
  return "border-[var(--outline-variant)] bg-white text-[var(--primary)] hover:border-[var(--primary)]";
}

function isAvailable(room: HotelRoomSummary): boolean {
  return getRoomStatus(room) === "available";
}

function emptyWalkIn(roomId = ""): WalkInForm {
  return {
    roomId,
    guestDisplayName: "",
    guestPhone: "",
    plannedCheckOutAt: localDateTime(1, 12),
  };
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

function activeStayProgress(room: HotelRoomSummary): number {
  const stay = room.activeStay;
  if (!stay?.plannedCheckInAt || !stay.plannedCheckOutAt) return 0;
  const start = new Date(stay.plannedCheckInAt).getTime();
  const end = new Date(stay.plannedCheckOutAt).getTime();
  const now = Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(0, Math.min(100, Math.round(((now - start) / (end - start)) * 100)));
}

function renderPaginationButtons(currentPage: number, totalPages: number, onPageChange: (p: number) => void) {
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
    </button>
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
      pages.push(1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages);
    }
  }

  pages.forEach((p, idx) => {
    if (p === "...") {
      buttons.push(
        <span key={`ellipsis-${idx}`} className="px-2 text-sm text-[var(--on-surface-variant)] select-none">
          ...
        </span>
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
        </button>
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
    </button>
  );

  return <div className="flex items-center gap-1.5">{buttons}</div>;
}

export function StaffRoomsClient({
  hotelId,
  initialRoomsPage,
  arrivals,
  canManageReservations,
  canManageStays,
}: Props) {
  const router = useRouter();
  const apiBase = `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}`;

  const checkInContainerRef = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState(false);
  const flashTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [inputQuery, setInputQuery] = useState("");
  const [query, setQuery] = useState("");
  const [floor, setFloor] = useState("all");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState<RoomStatusFilter>("all");
  const [vipOnly, setVipOnly] = useState(false);
  const [flow, setFlow] = useState<FlowMode>("walk-in");
  const [selectedRoom, setSelectedRoom] = useState<HotelRoomSummary | null>(null);
  const [walkInForm, setWalkInForm] = useState<WalkInForm>(() => emptyWalkIn());
  const [reservationForm, setReservationForm] = useState<ReservationForm>(() => emptyReservation());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handler = setTimeout(() => {
      setQuery(inputQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [inputQuery]);

  const { data: roomsPage, isFetching } = useQuery({
    queryKey: [
      "hotel-ops",
      hotelId,
      "rooms",
      { page, limit: pageSize, q: query, status, floor, type, vipOnly },
    ],
    queryFn: async () => {
      const searchParams = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
        ...(query ? { q: query } : {}),
        ...(status !== "all" ? { status: status.toUpperCase() } : {}),
        ...(floor !== "all" ? { floor } : {}),
        ...(type !== "all" ? { type } : {}),
        ...(vipOnly ? { vipOnly: "true" } : {}),
      });
      const response = await requestInternalApiEnvelope<HotelOpsPage<HotelRoomSummary>>(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/rooms?${searchParams.toString()}`,
        { method: "GET" },
      );
      return response.data;
    },
    placeholderData: keepPreviousData,
    initialData: page === 1 && !query && status === "all" && floor === "all" && type === "all" && !vipOnly
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
  const totalAvailable = roomsPage?.totalAvailable ?? initialRoomsPage.totalAvailable ?? 0;

  const availableRooms = useMemo(() => rooms.filter(isAvailable), [rooms]);

  function openWalkIn(room: HotelRoomSummary) {
    if (!isAvailable(room) || !canManageStays) return;
    setSelectedRoom(room);
    setWalkInForm(emptyWalkIn(room.id));
    setReservationForm(emptyReservation(room.id));

    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current);
    }
    setFlash(true);
    flashTimeoutRef.current = setTimeout(() => {
      setFlash(false);
    }, 800);

    if (checkInContainerRef.current) {
      const rect = checkInContainerRef.current.getBoundingClientRect();
      const inViewport =
        rect.top >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight);
      if (!inViewport) {
        checkInContainerRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }

  async function submitWalkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRoom) return;
    setSaving(true);
    try {
      const result = await requestInternalApiEnvelope<HotelCheckInResult>(`${apiBase}/stays`, {
        method: "POST",
        body: {
          roomId: walkInForm.roomId,
          guestDisplayName: walkInForm.guestDisplayName.trim(),
          ...(walkInForm.guestPhone.trim() ? { guestPhone: walkInForm.guestPhone.trim() } : {}),
          plannedCheckInAt: new Date().toISOString(),
          plannedCheckOutAt: new Date(walkInForm.plannedCheckOutAt).toISOString(),
        },
      });
      setSelectedRoom(null);
      await Swal.fire({
        icon: "success",
        title: "Đã mở phòng",
        text: `Mã GuestOS: ${result.data.accessCode}. Khách có thể quét QR để gọi dịch vụ và nhắn tin.`,
        confirmButtonColor: "#00003c",
      });
      router.refresh();
    } catch (error) {
      await Swal.fire({ icon: "error", title: "Không thể mở phòng", text: error instanceof Error ? error.message : "Vui lòng thử lại.", confirmButtonColor: "#00003c" });
    } finally {
      setSaving(false);
    }
  }

  async function createReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await requestInternalApiEnvelope(`${apiBase}/reservations`, {
        method: "POST",
        body: {
          guestDisplayName: reservationForm.guestDisplayName.trim(),
          ...(reservationForm.guestPhone.trim() ? { guestPhone: reservationForm.guestPhone.trim() } : {}),
          plannedCheckInAt: new Date(reservationForm.plannedCheckInAt).toISOString(),
          plannedCheckOutAt: new Date(reservationForm.plannedCheckOutAt).toISOString(),
          ...(reservationForm.roomId ? { roomId: reservationForm.roomId } : {}),
        },
      });
      setReservationForm(emptyReservation());
      await Swal.fire({ icon: "success", title: "Đã tạo đặt phòng", timer: 1400, showConfirmButton: false });
      router.refresh();
    } catch (error) {
      await Swal.fire({ icon: "error", title: "Không thể tạo đặt phòng", text: error instanceof Error ? error.message : "Vui lòng thử lại.", confirmButtonColor: "#00003c" });
    } finally {
      setSaving(false);
    }
  }

  async function assignArrivalRoom(arrival: HotelArrival) {
    const options = Object.fromEntries(availableRooms.map((room) => [room.id, `Phòng ${getRoomNumber(room)} · ${room.type ?? "Tiêu chuẩn"}`]));
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
      await requestInternalApiEnvelope(`${apiBase}/reservations/${encodeURIComponent(arrival.id)}/room`, { method: "PUT", body: { roomId: result.value } });
      router.refresh();
    } catch (error) {
      await Swal.fire({ icon: "error", title: "Không thể gán phòng", text: error instanceof Error ? error.message : "Vui lòng thử lại.", confirmButtonColor: "#00003c" });
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
      const result = await requestInternalApiEnvelope<HotelReservationCheckInResult>(`${apiBase}/reservations/${encodeURIComponent(arrival.id)}/check-in`, { method: "POST" });
      await Swal.fire({ icon: "success", title: "Check-in hoàn tất", text: result.data.accessCode ? `Mã GuestOS: ${result.data.accessCode}` : "QR phòng đã sẵn sàng.", confirmButtonColor: "#00003c" });
      router.refresh();
    } catch (error) {
      await Swal.fire({ icon: "error", title: "Không thể check-in", text: error instanceof Error ? error.message : "Vui lòng thử lại.", confirmButtonColor: "#00003c" });
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
          animation: quickCheckInEntrance 240ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
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
          animation: subtleFlash 800ms ease-out;
        }
      `}</style>

      <section className="sticky top-0 z-20 -mx-2 rounded-xl bg-[var(--surface)]/90 px-2 py-3 backdrop-blur md:top-2">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative min-w-0 flex-1 lg:max-w-xs">
              <VsIcon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[var(--outline)]" />
              <input value={inputQuery} onChange={(event) => setInputQuery(event.target.value)} className="h-11 w-full rounded-lg border-0 bg-[var(--surface-container-low)] pl-10 pr-4 text-sm outline-none ring-1 ring-transparent focus:ring-[var(--primary)]" placeholder="Tìm kiếm phòng hoặc khách..." />
            </label>
            <div className="grid gap-2 sm:grid-cols-3 lg:flex">
              <select value={floor} onChange={(event) => { setFloor(event.target.value); setPage(1); }} className="h-11 rounded-lg border-0 bg-[var(--surface-container-low)] px-3 text-sm ring-1 ring-transparent focus:ring-[var(--primary)]">
                <option value="all">Tầng: Tất cả</option>
                {floors.map((value) => <option key={value} value={value}>Tầng {value}</option>)}
              </select>
              <select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} className="h-11 rounded-lg border-0 bg-[var(--surface-container-low)] px-3 text-sm ring-1 ring-transparent focus:ring-[var(--primary)]">
                <option value="all">Loại phòng: Tất cả</option>
                {types.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <select value={status} onChange={(event) => { setStatus(event.target.value as RoomStatusFilter); setPage(1); }} className="h-11 rounded-lg border-0 bg-[var(--surface-container-low)] px-3 text-sm ring-1 ring-transparent focus:ring-[var(--primary)]">
                {statusFilters.map((item) => <option key={item.value} value={item.value}>Trạng thái: {item.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--on-surface-variant)]">
              <input type="checkbox" checked={vipOnly} onChange={(event) => { setVipOnly(event.target.checked); setPage(1); }} className="rounded border-[var(--outline-variant)] text-[var(--primary)] focus:ring-[var(--primary)]" />
              Chế độ VIP
            </label>
            <div className="grid grid-cols-2 gap-4 border-l border-[var(--outline-variant)] pl-4 text-center">
              <div><p className="text-xs text-[var(--on-surface-variant)]">Tổng</p><p className="font-bold text-[var(--primary)]">{totalItems}</p></div>
              <div><p className="text-xs text-[var(--on-surface-variant)]">Khả dụng</p><p className="font-bold text-[var(--secondary)]">{totalAvailable}</p></div>
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
                const isVip = /suite|vip|premium|penthouse/i.test(room.type ?? "");
                return (
                  <button key={room.id} type="button" onClick={() => openWalkIn(room)} disabled={!isAvailable(room) || !canManageStays} className={`min-h-52 rounded-xl border p-5 text-left shadow-[0_4px_20px_rgba(0,0,0,0.05)] transition hover:-translate-y-0.5 disabled:cursor-default disabled:hover:translate-y-0 ${roomCardClass(roomStatus)}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="vs-display text-3xl font-semibold">{getRoomNumber(room)}</h3>
                        <p className={roomStatus === "occupied" ? "text-sm text-white/75" : "text-sm text-[var(--on-surface-variant)]"}>{room.type ?? "Tiêu chuẩn"}</p>
                      </div>
                      <span className={isVip ? "rounded-full border border-[var(--secondary-fixed-dim)] bg-[var(--secondary-fixed)]/20 px-3 py-1 text-xs font-bold text-[var(--secondary-fixed)]" : "rounded-full bg-[var(--surface-container-high)] px-3 py-1 text-xs font-semibold text-[var(--on-surface-variant)]"}>
                        {isVip ? "VIP" : room.floor ? `Tầng ${room.floor}` : roomStatusLabel(roomStatus)}
                      </span>
                    </div>
                    <div className="mt-5">
                      <p className={roomStatus === "occupied" ? "text-xs uppercase tracking-[0.18em] text-white/60" : "text-xs uppercase tracking-[0.18em] text-[var(--on-surface-variant)]"}>Khách hàng</p>
                      <p className={roomStatus === "occupied" ? "mt-1 font-bold text-white" : "mt-1 text-sm italic text-[var(--outline)]"}>
                        {room.activeStay?.guestDisplayName ?? (roomStatus === "available" ? "Sẵn sàng đón khách" : "Chưa có khách lưu trú")}
                      </p>
                    </div>
                    <div className={roomStatus === "occupied" ? "mt-5 border-t border-white/15 pt-4" : "mt-5 border-t border-[var(--outline-variant)]/40 pt-4"}>
                      {roomStatus === "occupied" ? (
                        <>
                          <div className="mb-1 flex justify-between text-xs text-white/65"><span>{formatDateTime(room.activeStay?.checkedInAt ?? room.activeStay?.plannedCheckInAt)}</span><span>{formatDateTime(room.activeStay?.plannedCheckOutAt)}</span></div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-[var(--secondary-fixed-dim)]" style={{ width: `${progress}%` }} /></div>
                        </>
                      ) : (
                        <div className="h-1.5 rounded-full bg-[var(--surface-container-high)]" />
                      )}
                      <div className="mt-4 flex items-center justify-between gap-2 overflow-hidden">
                        <span className="min-w-0 truncate text-xs font-bold" title={room.publicCode ?? room.qr?.publicCode ?? "QR GuestOS"}>
                          {room.publicCode ?? room.qr?.publicCode ?? "QR GuestOS"}
                        </span>
                        <span className="shrink-0 rounded bg-[var(--secondary-fixed-dim)] px-2 py-1 text-xs font-bold text-[var(--on-secondary-fixed)]">{roomStatusLabel(roomStatus)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
              {rooms.length === 0 && !isFetching ? (
                <p className="rounded-xl border border-[var(--outline-variant)] bg-white p-8 text-center text-sm text-[var(--on-surface-variant)] sm:col-span-2 xl:col-span-3">Không có phòng phù hợp với bộ lọc.</p>
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
          <div
            ref={checkInContainerRef}
            className={`rounded-xl border bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.05)] transition-all duration-300 ${
              flash ? "animate-subtle-flash" : "border-[var(--outline-variant)]"
            }`}
          >
            <div className="flex rounded-lg bg-[var(--surface-container-low)] p-1">
              <button type="button" onClick={() => setFlow("walk-in")} className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold ${flow === "walk-in" ? "bg-[var(--primary)] text-white" : "text-[var(--on-surface-variant)]"}`}>Mở phòng mới</button>
              <button type="button" onClick={() => setFlow("reservation")} className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold ${flow === "reservation" ? "bg-[var(--primary)] text-white" : "text-[var(--on-surface-variant)]"}`}>Đặt trước</button>
            </div>

            {flow === "walk-in" ? (
              <form key="walk-in-form" onSubmit={submitWalkIn} className="mt-5 space-y-4 animate-quick-check-in">
                <div>
                  <h2 className="vs-display text-2xl font-semibold text-[var(--primary)]">Check-in nhanh</h2>
                  <p className="mt-1 text-sm text-[var(--on-surface-variant)]">Chọn phòng trống trên lưới hoặc trong danh sách.</p>
                </div>
                <select required value={walkInForm.roomId} onChange={(event) => { const room = rooms.find((item) => item.id === event.target.value) ?? null; setSelectedRoom(room); setWalkInForm((current) => ({ ...current, roomId: event.target.value })); }} className="h-12 w-full rounded-lg border-0 bg-[var(--surface-container-low)] px-3 text-sm ring-1 ring-transparent focus:ring-[var(--primary)]">
                  <option value="">Chọn phòng trống</option>
                  {availableRooms.map((room) => <option key={room.id} value={room.id}>Phòng {getRoomNumber(room)} · {room.type ?? "Tiêu chuẩn"}</option>)}
                </select>
                <input required minLength={2} value={walkInForm.guestDisplayName} onChange={(event) => setWalkInForm((current) => ({ ...current, guestDisplayName: event.target.value }))} className="h-12 w-full rounded-lg border-0 bg-[var(--surface-container-low)] px-4 text-sm ring-1 ring-transparent focus:ring-[var(--primary)]" placeholder="Tên khách" />
                <input value={walkInForm.guestPhone} onChange={(event) => setWalkInForm((current) => ({ ...current, guestPhone: event.target.value }))} className="h-12 w-full rounded-lg border-0 bg-[var(--surface-container-low)] px-4 text-sm ring-1 ring-transparent focus:ring-[var(--primary)]" placeholder="Số điện thoại" />
                <label className="block space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">Dự kiến trả phòng</span>
                  <input required type="datetime-local" value={walkInForm.plannedCheckOutAt} onChange={(event) => setWalkInForm((current) => ({ ...current, plannedCheckOutAt: event.target.value }))} className="h-12 w-full rounded-lg border-0 bg-[var(--surface-container-low)] px-4 text-sm ring-1 ring-transparent focus:ring-[var(--primary)]" />
                </label>
                <button disabled={saving || !canManageStays} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-5 text-sm font-bold text-white disabled:opacity-50">
                  <VsIcon name="check_circle" />
                  {saving ? "Đang xử lý..." : "Xác nhận check-in"}
                </button>
              </form>
            ) : (
              <form key="reservation-form" onSubmit={createReservation} className="mt-5 space-y-4 animate-quick-check-in">
                <div>
                  <h2 className="vs-display text-2xl font-semibold text-[var(--primary)]">Tạo đặt phòng</h2>
                  <p className="mt-1 text-sm text-[var(--on-surface-variant)]">Đặt trước được hiển thị trong hàng đợi bên dưới để gán phòng và check-in.</p>
                </div>
                <select value={reservationForm.roomId} onChange={(event) => { const room = rooms.find((item) => item.id === event.target.value) ?? null; setSelectedRoom(room); setReservationForm((current) => ({ ...current, roomId: event.target.value })); }} className="h-12 w-full rounded-lg border-0 bg-[var(--surface-container-low)] px-3 text-sm ring-1 ring-transparent focus:ring-[var(--primary)]">
                  <option value="">Chọn phòng trống (tùy chọn)</option>
                  {availableRooms.map((room) => <option key={room.id} value={room.id}>Phòng {getRoomNumber(room)} · {room.type ?? "Tiêu chuẩn"}</option>)}
                </select>
                <input required minLength={2} value={reservationForm.guestDisplayName} onChange={(event) => setReservationForm((current) => ({ ...current, guestDisplayName: event.target.value }))} className="h-12 w-full rounded-lg border-0 bg-[var(--surface-container-low)] px-4 text-sm ring-1 ring-transparent focus:ring-[var(--primary)]" placeholder="Tên khách" />
                <input value={reservationForm.guestPhone} onChange={(event) => setReservationForm((current) => ({ ...current, guestPhone: event.target.value }))} className="h-12 w-full rounded-lg border-0 bg-[var(--surface-container-low)] px-4 text-sm ring-1 ring-transparent focus:ring-[var(--primary)]" placeholder="Số điện thoại" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input required type="datetime-local" value={reservationForm.plannedCheckInAt} onChange={(event) => setReservationForm((current) => ({ ...current, plannedCheckInAt: event.target.value }))} className="h-12 rounded-lg border-0 bg-[var(--surface-container-low)] px-3 text-sm ring-1 ring-transparent focus:ring-[var(--primary)]" />
                  <input required type="datetime-local" value={reservationForm.plannedCheckOutAt} onChange={(event) => setReservationForm((current) => ({ ...current, plannedCheckOutAt: event.target.value }))} className="h-12 rounded-lg border-0 bg-[var(--surface-container-low)] px-3 text-sm ring-1 ring-transparent focus:ring-[var(--primary)]" />
                </div>
                <button disabled={saving || !canManageReservations} className="h-12 w-full rounded-full bg-[var(--primary)] px-5 text-sm font-bold text-white disabled:opacity-50">{saving ? "Đang tạo..." : "Tạo đặt phòng"}</button>
              </form>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-[var(--outline-variant)] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
            <div className="border-b border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--secondary)]">7 ngày tới</p>
              <h2 className="vs-display text-2xl font-semibold text-[var(--primary)]">Khách chờ đến</h2>
            </div>
            <div className="max-h-[32rem] divide-y divide-[var(--outline-variant)] overflow-y-auto">
              {arrivals.map((arrival) => {
                const room = rooms.find((item) => item.id === arrival.roomId);
                return (
                  <article key={arrival.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-[var(--primary)]">{arrival.reservationCode}</p>
                        <p className="mt-1 text-sm font-semibold">{arrival.guestDisplayName}</p>
                        <p className="mt-1 text-xs text-[var(--on-surface-variant)]">{formatDateTime(arrival.plannedCheckInAt)} đến {formatDateTime(arrival.plannedCheckOutAt)}</p>
                      </div>
                      <span className="rounded-full bg-[var(--primary-fixed)] px-3 py-1 text-xs font-bold text-[var(--on-primary-fixed)]">{arrival.status}</span>
                    </div>
                    <p className="mt-3 text-sm text-[var(--on-surface-variant)]">{room ? `Phòng ${getRoomNumber(room)}` : "Chưa gán phòng"}</p>
                    {canManageReservations && arrival.status !== "CHECKED_IN" ? (
                      <div className="mt-3 flex gap-2">
                        {arrival.roomId ? (
                          <button type="button" onClick={() => void checkInArrival(arrival)} className="rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-bold text-white">Check-in</button>
                        ) : (
                          <button type="button" onClick={() => void assignArrivalRoom(arrival)} className="rounded-lg border border-[var(--outline-variant)] px-3 py-2 text-xs font-bold text-[var(--primary)]">Gán phòng</button>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })}
              {arrivals.length === 0 ? <p className="p-5 text-center text-sm text-[var(--on-surface-variant)]">Không có khách dự kiến đến trong 7 ngày tới.</p> : null}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
