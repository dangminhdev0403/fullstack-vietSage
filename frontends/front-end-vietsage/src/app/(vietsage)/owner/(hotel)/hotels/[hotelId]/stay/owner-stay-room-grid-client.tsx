"use client";

import { useMemo, useState } from "react";

import type {
  HotelRoomSummary,
} from "@/features/hotel-ops/types/hotel-ops-contract";

import { VsIcon } from "../../../../../_components/vs-icon";
import { filterExtraOccupants } from "@/features/hotel-ops/utils/hotel-ops-display";

function joinClasses(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

type Props = {
  hotelId: string;
  rooms: HotelRoomSummary[];
  apiBasePath?: string;
  onRoomsChanged?: () => Promise<unknown>;
};

type RoomStatusFilter =
  | "all"
  | "available"
  | "occupied"
  | "overdue"
  | "processing"
  | "maintenance"
  | "blocked";


type RoomAvailability =
  | "available"
  | "occupied"
  | "overdue"
  | "processing"
  | "maintenance"
  | "blocked";

const pageSize = 30;

const statusFilters: { value: RoomStatusFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "available", label: "Trống" },
  { value: "occupied", label: "Đang ở" },
  { value: "overdue", label: "⚠️ Quá hạn trả" },
  { value: "processing", label: "Chờ dọn" },
  { value: "maintenance", label: "Bảo trì" },
  { value: "blocked", label: "Đã khóa" },
];


function getRoomNumber(room: HotelRoomSummary): string {
  return room.roomNumber?.trim() || room.id;
}

function getRoomType(room: HotelRoomSummary): string {
  return room.type?.trim() || "";
}

function getRoomStatus(room: HotelRoomSummary): string {
  return room.status?.trim().toUpperCase() || "AVAILABLE";
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

function roomHasActiveStay(room: HotelRoomSummary): boolean {
  return room.activeStay?.status?.toUpperCase() === "ACTIVE";
}

function getRoomAvailability(room: HotelRoomSummary): RoomAvailability {
  if (isOverdueCheckOut(room)) return "overdue";
  const status = getRoomStatus(room);

  if (roomHasActiveStay(room) || status === "OCCUPIED") return "occupied";
  if (status === "MAINTENANCE") return "maintenance";
  if (
    [
      "DISABLED",
      "INACTIVE",
      "OUT_OF_SERVICE",
      "UNAVAILABLE",
      "BLOCKED",
    ].includes(status)
  )
    return "blocked";
  if (["CLEANING", "PROCESSING", "PENDING", "DIRTY"].includes(status))
    return "processing";

  return "available";
}

function roomStatusLabel(room: HotelRoomSummary): string {
  const availability = getRoomAvailability(room);
  if (availability === "overdue") return "QUÁ HẠN CHECK-OUT";
  if (availability === "occupied") return "Đang ở";
  if (availability === "processing") return "Chờ dọn";
  if (availability === "maintenance") return "Bảo trì";
  if (availability === "blocked") return "Đã khóa";
  return "Trống";
}

function roomTileClass(room: HotelRoomSummary): string {
  const availability = getRoomAvailability(room);
  if (availability === "overdue")
    return "border-2 border-red-500 bg-red-950 text-white font-bold animate-pulse-subtle shadow-md shadow-red-900/40";
  if (availability === "occupied")
    return "border-blue-300 bg-blue-100 text-blue-900 font-bold hover:-translate-y-0.5 hover:shadow-md";
  if (availability === "processing")
    return "border-amber-300 bg-amber-100 text-amber-900 font-bold hover:-translate-y-0.5 hover:shadow-md";
  if (availability === "maintenance")
    return "border-rose-300 bg-rose-100 text-rose-900 font-bold hover:-translate-y-0.5 hover:shadow-md";
  if (availability === "blocked")
    return "border-slate-400 bg-slate-200 text-slate-900 font-bold hover:-translate-y-0.5 hover:shadow-md";
  return "border-emerald-300 bg-emerald-100 text-emerald-900 font-bold hover:-translate-y-0.5 hover:shadow-md";
}


function roomSearchText(room: HotelRoomSummary): string {
  return [room.id, room.roomNumber, room.type, room.status]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function formatRoomPrice(room: HotelRoomSummary): string {
  const value = Number(room.price);
  if (!Number.isFinite(value)) return "Chưa cập nhật";
  return `${new Intl.NumberFormat("vi-VN").format(value)} ₫`;
}

function formatRoomDate(value: string | null | undefined): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}


function StayOccupantsViewer({ stay }: { stay: NonNullable<HotelRoomSummary["activeStay"]> }) {
  const [selectedGuestIndex, setSelectedGuestIndex] = useState(0);

  const extraOccupants = useMemo(() => {
    return filterExtraOccupants(stay.occupants, stay);
  }, [stay]);

  const totalGuests = 1 + extraOccupants.length;
  const currentOccupant = selectedGuestIndex > 0 ? extraOccupants[selectedGuestIndex - 1] : null;

  return (
    <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50/70 p-5 shadow-2xs">
      <div className="flex flex-col gap-3 border-b border-blue-200/80 pb-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">
            Khách đang lưu trú ({totalGuests} người)
          </p>
        </div>

        <nav className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          <button
            type="button"
            onClick={() => setSelectedGuestIndex(0)}
            className={joinClasses(
              "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all cursor-pointer",
              selectedGuestIndex === 0
                ? "bg-blue-700 text-white shadow-sm shadow-blue-700/20"
                : "bg-blue-100/90 text-blue-900 hover:bg-blue-200/80",
            )}
          >
            <VsIcon name="person" className="text-sm" />
            Đại diện (Chủ phòng)
          </button>
          {extraOccupants.map((occ, idx) => (
            <button
              key={occ.id || idx}
              type="button"
              onClick={() => setSelectedGuestIndex(idx + 1)}
              className={joinClasses(
                "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all cursor-pointer",
                selectedGuestIndex === idx + 1
                  ? "bg-blue-700 text-white shadow-sm shadow-blue-700/20"
                  : "bg-blue-100/90 text-blue-900 hover:bg-blue-200/80",
              )}
            >
              <VsIcon name="group" className="text-sm" />
              Khách ở cùng {idx + 1}
            </button>
          ))}
        </nav>
      </div>

      {!currentOccupant ? (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-lg font-extrabold text-blue-950">
              {stay.guestDisplayName || "Khách đại diện"}
            </p>
            <span className="rounded-lg bg-blue-200/80 px-2.5 py-0.5 text-xs font-bold text-blue-900">
              Chủ đặt phòng
            </span>
          </div>
          <div className="mt-3 grid gap-2.5 text-sm text-blue-900 sm:grid-cols-2">
            <p><span className="font-semibold text-blue-950">SĐT:</span> {stay.guestPhone || "chưa có"}</p>
            <p><span className="font-semibold text-blue-950">Mã đặt phòng:</span> {stay.reservationCode || "chưa có"}</p>
            <p><span className="font-semibold text-blue-950">Số CCCD:</span> {stay.guestIdentityNumber || "chưa có"}</p>
            <p><span className="font-semibold text-blue-950">Ngày sinh:</span> {stay.guestDateOfBirth || "chưa có"}</p>
            <p><span className="font-semibold text-blue-950">Giới tính:</span> {stay.guestGender || "chưa có"}</p>
            <p><span className="font-semibold text-blue-950">Quốc tịch:</span> {stay.guestNationality || "chưa có"}</p>
            <p className="sm:col-span-2"><span className="font-semibold text-blue-950">Địa chỉ thường trú:</span> {stay.guestResidencePlace || "chưa có"}</p>
            <p><span className="font-semibold text-blue-950">Check-in:</span> {formatRoomDate(stay.checkedInAt)}</p>
            <p><span className="font-semibold text-blue-950">Check-out:</span> {formatRoomDate(stay.plannedCheckOutAt)}</p>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-lg font-extrabold text-blue-950">
              {currentOccupant.fullName || `Khách ở cùng ${selectedGuestIndex}`}
            </p>
            <span className="rounded-lg bg-amber-200/90 px-2.5 py-0.5 text-xs font-bold text-amber-950">
              Khách ở cùng #{selectedGuestIndex}
            </span>
          </div>
          <div className="mt-3 grid gap-2.5 text-sm text-blue-900 sm:grid-cols-2">
            <p><span className="font-semibold text-blue-950">SĐT:</span> {currentOccupant.phone || "chưa có"}</p>
            <p><span className="font-semibold text-blue-950">Số CCCD:</span> {currentOccupant.identityNumber || "chưa có"}</p>
            <p><span className="font-semibold text-blue-950">Ngày sinh:</span> {currentOccupant.dateOfBirth || "chưa có"}</p>
            <p><span className="font-semibold text-blue-950">Giới tính:</span> {currentOccupant.gender || "chưa có"}</p>
            <p><span className="font-semibold text-blue-950">Quốc tịch:</span> {currentOccupant.nationality || "chưa có"}</p>
            <p className="sm:col-span-2"><span className="font-semibold text-blue-950">Địa chỉ thường trú:</span> {currentOccupant.residencePlace || "chưa có"}</p>
            <p><span className="font-semibold text-blue-950">Chủ phòng đại diện:</span> {stay.guestDisplayName}</p>
            <p><span className="font-semibold text-blue-950">Mã đặt phòng:</span> {stay.reservationCode || "chưa có"}</p>
            <p><span className="font-semibold text-blue-950">Check-in:</span> {formatRoomDate(stay.checkedInAt)}</p>
            <p><span className="font-semibold text-blue-950">Check-out:</span> {formatRoomDate(stay.plannedCheckOutAt)}</p>
          </div>
        </div>
      )}
    </div>
  );
}


export function OwnerStayRoomGridClient({
  hotelId: _hotelId,
  rooms,
  apiBasePath: _apiBasePath,
  onRoomsChanged: _onRoomsChanged,
}: Props) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<RoomStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [detailRoom, setDetailRoom] = useState<HotelRoomSummary | null>(null);

  const filteredRooms = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return rooms.filter((room) => {
      const availability = getRoomAvailability(room);
      const matchesStatus =
        statusFilter === "all" || availability === statusFilter;
      const matchesQuery =
        !normalizedQuery || roomSearchText(room).includes(normalizedQuery);

      return matchesStatus && matchesQuery;
    });
  }, [query, rooms, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRooms.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedRooms = filteredRooms.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  function updateQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  function updateStatusFilter(value: RoomStatusFilter) {
    setStatusFilter(value);
    setPage(1);
  }

  function handleTileClick(room: HotelRoomSummary) {
    setDetailRoom(room);
  }

  return (
    <section>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--on-surface-variant)]">
            Sơ đồ phòng trực quan
          </p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--primary)]">
            Tình trạng phòng theo khách sạn
          </h2>
        </div>
        <div className="flex flex-wrap gap-3 text-xs font-semibold text-[var(--on-surface-variant)]">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Trống
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            Đang ở
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-gray-400" />
            Đang xử lý
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-400" />
            Không khả dụng
          </span>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-[var(--outline-variant)] bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)] lg:flex-row lg:items-center">
        <label className="relative min-w-[200px] sm:min-w-[240px] flex-1">
          <span className="sr-only">Tìm phòng</span>
          <VsIcon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[var(--on-surface-variant)]"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder="Tìm theo số phòng hoặc loại phòng..."
            className="h-11 w-full rounded-xl border border-[var(--outline-variant)] bg-white pl-10 pr-4 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-fixed)]"
          />
        </label>
        <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0 shrink-0">
          {statusFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => updateStatusFilter(filter.value)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                statusFilter === filter.value
                  ? "bg-[var(--primary-fixed)] text-[var(--primary)]"
                  : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)]"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-8 xl:grid-cols-10">
        {paginatedRooms.map((room) => {
          return (
            <button
              key={room.id}
              type="button"
              onClick={() => handleTileClick(room)}
              title={`Xem chi tiết phòng ${getRoomNumber(room)} - ${roomStatusLabel(room)}`}
              className={`aspect-square cursor-pointer rounded-lg border p-2 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${roomTileClass(room)}`}
            >
              <span className="block truncate text-sm font-bold">
                {getRoomNumber(room)}
              </span>
              <span className="mt-1 block truncate text-[10px] font-bold uppercase tracking-[0.08em] opacity-75">
                {roomStatusLabel(room)}
              </span>
            </button>
          );
        })}
        {filteredRooms.length === 0 ? (
          <p className="col-span-full rounded-xl border border-[var(--outline-variant)] bg-white p-6 text-center text-sm text-[var(--on-surface-variant)]">
            Chưa có phòng phù hợp với bộ lọc hiện tại.
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-[var(--outline-variant)] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--on-surface-variant)]">
          Hiển thị {paginatedRooms.length} trên {filteredRooms.length} phòng
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(current - 1, 1))}
            disabled={safePage === 1}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--on-surface-variant)] transition hover:bg-[var(--surface-container-low)] disabled:opacity-40"
          >
            <VsIcon name="chevron_left" className="text-[18px]" />
          </button>
          {Array.from({ length: totalPages }, (_, index) => index + 1)
            .slice(Math.max(0, safePage - 3), Math.max(3, safePage + 2))
            .map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                onClick={() => setPage(pageNumber)}
                className={`h-9 w-9 rounded-lg text-sm font-semibold ${pageNumber === safePage ? "bg-[var(--primary)] text-white" : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)]"}`}
              >
                {pageNumber}
              </button>
            ))}
          <button
            type="button"
            onClick={() =>
              setPage((current) => Math.min(current + 1, totalPages))
            }
            disabled={safePage === totalPages}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--on-surface-variant)] transition hover:bg-[var(--surface-container-low)] disabled:opacity-40"
          >
            <VsIcon name="chevron_right" className="text-[18px]" />
          </button>
        </div>
      </div>

      {detailRoom ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
          <button
            type="button"
            aria-label="Đóng chi tiết phòng"
            onClick={() => setDetailRoom(null)}
            className="absolute inset-0 bg-[color:rgba(26,28,28,0.48)] backdrop-blur-sm"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-detail-title"
            className="relative z-10 max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-[color:rgba(198,197,213,0.62)] bg-white p-6 shadow-[0_28px_80px_rgba(0,0,60,0.22)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--secondary)]">
                  Chi tiết phòng
                </p>
                <h2
                  id="room-detail-title"
                  className="mt-2 text-3xl font-semibold text-[var(--primary)]"
                >
                  Phòng {getRoomNumber(detailRoom)}
                </h2>
                <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
                  {getRoomType(detailRoom) || "Chưa cập nhật loại phòng"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailRoom(null)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--primary)] transition hover:bg-[var(--primary-fixed)]"
                title="Đóng"
              >
                <VsIcon name="close" />
              </button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                ["Trạng thái", roomStatusLabel(detailRoom)],
                ["Tầng", detailRoom.floor?.trim() || "Chưa cập nhật"],
                ["Giá phòng", formatRoomPrice(detailRoom)],
                [
                  "QR GuestOS",
                  (detailRoom.qr?.status ?? detailRoom.qrStatus ?? "INACTIVE")
                    .toString()
                    .toUpperCase() === "ACTIVE"
                    ? "Đang hoạt động"
                    : "Chưa hoạt động",
                ],
                [
                  "Thiết bị khách",
                  `${detailRoom.activeGuestDeviceCount ?? 0} / ${detailRoom.maxActiveGuestDevices ?? 3}`,
                ],
                ["Mã phòng", detailRoom.id],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-4"
                >
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">
                    {label}
                  </p>
                  <p className="mt-2 break-words text-sm font-semibold text-[var(--primary)]">
                    {value}
                  </p>
                </div>
              ))}
            </div>

            {detailRoom.activeStay ? (
              <StayOccupantsViewer stay={detailRoom.activeStay} />
            ) : (
              <p className="mt-5 rounded-xl border border-dashed border-[var(--outline-variant)] p-4 text-sm text-[var(--on-surface-variant)]">
                Phòng hiện không có khách lưu trú.
              </p>
            )}

            <div className="mt-6 flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={() => setDetailRoom(null)}
                className="min-h-11 rounded-xl border border-[var(--outline-variant)] px-5 text-sm font-bold text-[var(--primary)] transition hover:bg-[var(--surface-container-low)]"
              >
                Đóng
              </button>

            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
