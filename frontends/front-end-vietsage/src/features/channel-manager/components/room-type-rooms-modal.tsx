"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { BrandedRoomQr } from "@/features/hotel-ops/components/branded-room-qr";
import {
  showConfirmDialog,
  showErrorAlert,
  showSuccessAlert,
  SwalVietSage,
} from "@/libs/swal";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import { staffRoomsResource } from "@/features/hotel-ops/resources/staff-rooms-resource";
import { ownerRoomsResource } from "@/features/hotel-ops/resources/owner-rooms-resource";
import type { HotelRoomSummary } from "@/features/hotel-ops/types/hotel-ops-contract";

export type RoomDisplayCategory =
  "trống" | "đặt trước" | "đang ở" | "hard-block";

export interface RoomTypeRoomsModalProps {
  isOpen: boolean;
  onClose: () => void;
  hotelId: string;
  roomType: {
    roomTypeId: string;
    roomTypeName: string;
    roomTypeCode: string;
    totalRooms: number;
    basePrice?: number | null;
  };
  selectedDate: string; // YYYY-MM-DD
  canManage: boolean;
  roleScope?: "owner" | "admin";
  onRoomCreated?: () => void;
}

function getTodayInVietnam(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDateDisplay(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function resolveRoomProjection(
  room: HotelRoomSummary,
  isSelectedDateToday: boolean,
  isFutureDate: boolean,
): {
  statusCategory: RoomDisplayCategory;
  label: string;
  badgeClass: string;
  guestName: string | null;
  reservationCode: string | null;
  groupCode: string | null;
} {
  const rawStatus = (
    isFutureDate && room.projectedStatus
      ? room.projectedStatus
      : room.projectedStatus || room.status || ""
  ).toUpperCase();

  // 1. Hard-block statuses: MAINTENANCE, BLOCKED, OUT_OF_SERVICE
  if (["MAINTENANCE", "BLOCKED", "OUT_OF_SERVICE"].includes(rawStatus)) {
    return {
      statusCategory: "hard-block",
      label: "Hard-block",
      badgeClass: "bg-slate-100 text-slate-700 border-slate-300",
      guestName: null,
      reservationCode: null,
      groupCode: null,
    };
  }

  // 2. Stay context: On future dates, ONLY projectedStay is authoritative.
  // Current occupant identity (activeStay) MUST NOT leak into a non-overlapping future date.
  const stay = isFutureDate
    ? (room.projectedStay ?? null)
    : room.projectedStay || room.activeStay || null;

  const reservation = isFutureDate
    ? (room.projectedReservation ?? null)
    : room.projectedReservation || room.upcomingReservation || null;

  const groupCode =
    (reservation as { groupCode?: string | null } | null)?.groupCode ??
    (stay as { groupCode?: string | null } | null)?.groupCode ??
    (room as unknown as { groupCode?: string | null }).groupCode ??
    null;

  if (rawStatus === "OCCUPIED" || Boolean(stay)) {
    return {
      statusCategory: "đang ở",
      label: "Đang ở",
      badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
      guestName: stay?.guestDisplayName || null,
      reservationCode: stay?.reservationCode || null,
      groupCode,
    };
  }

  // 3. Reserved context
  if (rawStatus === "RESERVED" || Boolean(reservation)) {
    return {
      statusCategory: "đặt trước",
      label: "Đặt trước",
      badgeClass: "bg-purple-50 text-purple-800 border-purple-200",
      guestName: reservation?.guestDisplayName || null,
      reservationCode: reservation?.reservationCode || null,
      groupCode,
    };
  }

  // 4. Available
  return {
    statusCategory: "trống",
    label: "Trống",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    guestName: null,
    reservationCode: null,
    groupCode,
  };
}

function getRoomNumber(room: HotelRoomSummary): string {
  return room.roomNumber?.trim() || "--";
}

function getQrStatus(room: HotelRoomSummary): string {
  return (room.qr?.status ?? room.qrStatus ?? "INACTIVE").trim().toUpperCase();
}

function getQrValue(room: HotelRoomSummary): string | null {
  if (getQrStatus(room) !== "ACTIVE") {
    return null;
  }
  return room.qr?.publicCode?.trim() || null;
}

function getGuestQrUrl(room: HotelRoomSummary, origin = ""): string | null {
  const qrCode = getQrValue(room);
  if (!qrCode) {
    return null;
  }
  const path = `/g/${encodeURIComponent(qrCode)}`;
  return origin ? `${origin.replace(/\/$/, "")}${path}` : path;
}

export function RoomTypeRoomsModal({
  isOpen,
  onClose,
  hotelId,
  roomType,
  selectedDate,
  canManage,
  roleScope = "owner",
  onRoomCreated,
}: RoomTypeRoomsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const todayStr = useMemo(() => getTodayInVietnam(), []);
  const [userDate, setUserDate] = useState<string | null>(null);
  const [prevSelectedDate, setPrevSelectedDate] = useState(selectedDate);

  if (prevSelectedDate !== selectedDate) {
    setPrevSelectedDate(selectedDate);
    setUserDate(null);
  }

  const currentDate = userDate ?? selectedDate;
  const isToday = currentDate === todayStr;
  const isFuture = currentDate > todayStr;

  const canManageQr = canManage && roleScope === "owner";
  const [clientOrigin, setClientOrigin] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined") {
      setClientOrigin(window.location.origin);
    }
  }, []);

  const [isBulkQrBusy, setIsBulkQrBusy] = useState(false);
  const [selectedQrRoom, setSelectedQrRoom] = useState<HotelRoomSummary | null>(null);
  const [qrActionBusyRoomId, setQrActionBusyRoomId] = useState<string | null>(null);

  // Add room form state
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [roomNumber, setRoomNumber] = useState("");
  const [floor, setFloor] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const canAddRoom = canManage && roleScope === "owner";

  // Query physical rooms for this room type on the selected date
  const staffRoomsScope = useMemo(
    () => staffRoomsResource.bind({ hotelId }),
    [hotelId],
  );

  const {
    data: roomsPage,
    isLoading,
    isFetching,
    isError,
    refetch: refetchRooms,
  } = useQuery({
    ...staffRoomsScope.queries.list.options({
      type: roomType.roomTypeName,
      businessDate: currentDate,
      limit: 100,
    }),
    enabled: isOpen && Boolean(hotelId) && Boolean(roomType.roomTypeName),
    staleTime: 5_000,
  });

  // Filter exact room type
  const rooms = useMemo(() => {
    const items = roomsPage?.items ?? [];
    return items.filter((r) => {
      if (r.roomTypeId && roomType.roomTypeId) {
        return r.roomTypeId === roomType.roomTypeId;
      }
      if (r.type && roomType.roomTypeName) {
        return (
          r.type.toLowerCase().trim() ===
          roomType.roomTypeName.toLowerCase().trim()
        );
      }
      return true;
    });
  }, [roomsPage?.items, roomType.roomTypeId, roomType.roomTypeName]);

  // Mutation for creating owner room
  const ownerRoomsScope = useMemo(
    () => ownerRoomsResource.bind({ hotelId }),
    [hotelId],
  );
  const createRoomMutation = useMutation(
    ownerRoomsScope.mutations.create.options(),
  );

  const handleCreateRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreateError(null);

    const trimmedNumber = roomNumber.trim();
    if (!trimmedNumber) {
      setCreateError("Vui lòng nhập số phòng.");
      return;
    }

    try {
      await createRoomMutation.mutateAsync({
        roomNumber: trimmedNumber,
        ...(floor.trim() ? { floor: floor.trim() } : {}),
        ...(roomType.roomTypeId
          ? { roomTypeId: roomType.roomTypeId }
          : { type: roomType.roomTypeName }),
      });

      toast.success(`Đã thêm phòng ${trimmedNumber} thành công.`);
      setRoomNumber("");
      setFloor("");
      setIsAddFormOpen(false);
      await refetchRooms();
      onRoomCreated?.();
    } catch (err: unknown) {
      // Preserve duplicate room-number or backend error verbatim
      const message =
        err instanceof Error ? err.message : "Không thể tạo phòng";
      setCreateError(message);
      toast.error(message);
    }
  };

  const handleBatchActivateQr = async () => {
    if (!canManageQr || isBulkQrBusy) return;

    const targetRooms = rooms.filter(
      (room) =>
        getQrStatus(room) !== "ACTIVE" && getQrStatus(room) !== "REVOKED",
    );

    if (targetRooms.length === 0) {
      await SwalVietSage.fire({
        icon: "info",
        title: "Tất cả QR đã kích hoạt",
        text: `Toàn bộ ${rooms.length} phòng của hạng ${roomType.roomTypeName} đều đang có mã QR GuestOS hoạt động.`,
        confirmButtonText: "OK",
      });
      return;
    }

    const confirmed = await showConfirmDialog({
      icon: "question",
      title: `Kích hoạt QR cho ${targetRooms.length} phòng?`,
      text: `Hệ thống sẽ tạo và bật mã QR GuestOS cho các phòng chưa kích hoạt thuộc hạng ${roomType.roomTypeName}.`,
      confirmText: "Kích hoạt tất cả",
      cancelText: "Hủy",
    });
    if (!confirmed.isConfirmed) return;

    setIsBulkQrBusy(true);
    try {
      let successCount = 0;
      for (const room of targetRooms) {
        try {
          await requestInternalApiEnvelope<HotelRoomSummary>(
            `/api/owner/hotels/${encodeURIComponent(hotelId)}/rooms/${encodeURIComponent(room.id)}/qr/activate`,
            { method: "POST" },
          );
          successCount++;
        } catch (err) {
          console.error(`Lỗi kích hoạt QR phòng ${room.id}:`, err);
        }
      }
      await refetchRooms();
      await showSuccessAlert(
        "Kích hoạt QR thành công",
        `Đã kích hoạt mã QR cho ${successCount}/${targetRooms.length} phòng của hạng ${roomType.roomTypeName}.`,
      );
    } catch (error) {
      await showErrorAlert(
        "Không thể kích hoạt QR hàng loạt",
        error instanceof Error ? error.message : "Vui lòng thử lại.",
      );
    } finally {
      setIsBulkQrBusy(false);
    }
  };

  const handleSingleRoomQrAction = async (
    room: HotelRoomSummary,
    action: "activate" | "deactivate",
  ) => {
    if (!canManageQr || qrActionBusyRoomId) return;

    setQrActionBusyRoomId(room.id);
    try {
      await requestInternalApiEnvelope<HotelRoomSummary>(
        `/api/owner/hotels/${encodeURIComponent(hotelId)}/rooms/${encodeURIComponent(room.id)}/qr/${action}`,
        { method: "POST" },
      );
      toast.success(
        action === "activate"
          ? `Đã kích hoạt QR phòng ${getRoomNumber(room)}`
          : `Đã tắt QR phòng ${getRoomNumber(room)}`,
      );
      await refetchRooms();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Thao tác QR thất bại";
      toast.error(message);
    } finally {
      setQrActionBusyRoomId(null);
    }
  };

  // Keyboard accessibility: Escape to close and focus trap
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "Tab" && modalRef.current) {
        const focusableElements =
          modalRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          );
        if (focusableElements.length === 0) return;
        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-type-rooms-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
    >
      <div
        ref={modalRef}
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-emerald-900 to-[#1a352d] px-5 py-4 text-white sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-emerald-300">
              <VsIcon name="meeting_room" className="text-xl" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="room-type-rooms-modal-title"
                  className="text-lg font-bold tracking-tight text-white sm:text-xl text-balance"
                >
                  {roomType.roomTypeName}
                </h2>
                <span className="rounded-md border border-white/20 bg-white/10 px-2 py-0.5 text-xs font-mono font-bold text-emerald-200">
                  #{roomType.roomTypeCode}
                </span>
                <span className="rounded-md border border-white/20 bg-white/10 px-2 py-0.5 text-xs font-semibold text-emerald-100">
                  {roomType.totalRooms} phòng vật lý
                </span>
              </div>
              <p className="mt-0.5 text-xs text-emerald-100/90 sm:text-sm text-pretty">
                Danh sách phòng vật lý &amp; {canManageQr ? "kích hoạt QR GuestOS theo ngày " : "trạng thái chiếu ngày "}
                <strong className="text-white">
                  {formatDateDisplay(currentDate)}
                </strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng bảng chi tiết phòng"
            className="rounded-xl p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white cursor-pointer focus-visible:outline-2 focus-visible:outline-white"
          >
            <VsIcon name="close" className="text-xl" />
          </button>
        </div>

        {/* Toolbar: Date Selector & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50/90 px-5 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Ngày kiểm tra:
            </span>
            <input
              type="date"
              value={currentDate}
              onChange={(e) => {
                if (e.target.value) setUserDate(e.target.value);
              }}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 shadow-2xs transition focus:outline-none focus:ring-2 focus:ring-emerald-600/30 cursor-pointer"
            />
            {isToday ? (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-black uppercase tracking-wider text-emerald-800">
                Hôm nay
              </span>
            ) : isFuture ? (
              <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-black uppercase tracking-wider text-indigo-800">
                Tương lai (Dự kiến)
              </span>
            ) : (
              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                Đã qua
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void refetchRooms()}
              disabled={isFetching}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <VsIcon
                name="refresh"
                className={`text-sm ${isFetching ? "animate-spin text-emerald-700" : ""}`}
              />
              <span>Làm mới</span>
            </button>

            {canManageQr && (
              <button
                type="button"
                onClick={() => void handleBatchActivateQr()}
                disabled={isBulkQrBusy || isFetching}
                title="Kích hoạt mã QR cho toàn bộ phòng chưa bật thuộc hạng này"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 shadow-2xs transition hover:bg-emerald-100 hover:border-emerald-400 active:scale-95 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                <VsIcon
                  name={isBulkQrBusy ? "refresh" : "qr_code_scanner"}
                  className={`text-sm ${isBulkQrBusy ? "animate-spin text-emerald-700" : "text-emerald-700"}`}
                />
                <span>
                  {isBulkQrBusy ? "Đang kích hoạt..." : "Kích hoạt tất cả QR"}
                </span>
              </button>
            )}

            {canAddRoom && (
              <button
                type="button"
                onClick={() => {
                  setIsAddFormOpen((prev) => !prev);
                  setCreateError(null);
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-800 px-3 text-xs font-bold text-white shadow-2xs transition hover:bg-emerald-900 cursor-pointer whitespace-nowrap"
              >
                <VsIcon
                  name={isAddFormOpen ? "remove" : "add"}
                  className="text-sm"
                />
                <span>{isAddFormOpen ? "Đóng biểu mẫu" : "Thêm phòng"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Permission-gated Add Room Form (Room type is FIXED) */}
        {canAddRoom && isAddFormOpen && (
          <form
            onSubmit={(e) => void handleCreateRoom(e)}
            className="border-b border-emerald-100 bg-emerald-50/50 p-4 transition-all sm:px-6"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Thêm phòng vật lý mới
              </h3>
              <span className="text-xs font-semibold text-emerald-800">
                Hạng phòng cố định: {roomType.roomTypeName}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* Fixed Room Type Display */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Hạng phòng (Cố định)
                </label>
                <div className="flex h-9 items-center rounded-xl border border-slate-200 bg-slate-100 px-3 text-xs font-bold text-slate-800 select-none">
                  {roomType.roomTypeName}
                </div>
              </div>

              {/* Room Number Input */}
              <div>
                <label
                  htmlFor="new-room-number-input"
                  className="mb-1 block text-xs font-semibold text-slate-700"
                >
                  Số phòng <span className="text-rose-500">*</span>
                </label>
                <input
                  id="new-room-number-input"
                  type="text"
                  required
                  placeholder="VD: 101, 202"
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  disabled={createRoomMutation.isPending}
                  className="h-9 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 shadow-2xs focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                />
              </div>

              {/* Floor Input */}
              <div>
                <label
                  htmlFor="new-room-floor-input"
                  className="mb-1 block text-xs font-semibold text-slate-700"
                >
                  Tầng (Tùy chọn)
                </label>
                <input
                  id="new-room-floor-input"
                  type="text"
                  placeholder="VD: Tầng 1, Tầng 2"
                  value={floor}
                  onChange={(e) => setFloor(e.target.value)}
                  disabled={createRoomMutation.isPending}
                  className="h-9 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 shadow-2xs focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                />
              </div>
            </div>

            {createError && (
              <div
                role="alert"
                className="mt-2.5 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs font-bold text-rose-800"
              >
                {createError}
              </div>
            )}

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsAddFormOpen(false);
                  setCreateError(null);
                }}
                disabled={createRoomMutation.isPending}
                className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={createRoomMutation.isPending || !roomNumber.trim()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-800 px-4 text-xs font-bold text-white shadow-2xs transition hover:bg-emerald-900 cursor-pointer disabled:opacity-50"
              >
                {createRoomMutation.isPending ? (
                  <>
                    <VsIcon name="refresh" className="animate-spin text-sm" />
                    <span>Đang tạo phòng...</span>
                  </>
                ) : (
                  <span>Tạo phòng</span>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Read-Only Physical Room Table */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
          {isLoading ? (
            <div
              role="status"
              className="flex min-h-60 items-center justify-center text-sm font-semibold text-slate-600"
            >
              <VsIcon
                name="refresh"
                className="mr-2 animate-spin text-lg text-emerald-700"
              />
              Đang tải danh sách phòng vật lý...
            </div>
          ) : isError ? (
            <div
              role="alert"
              className="space-y-3 rounded-2xl bg-rose-50 p-8 text-center"
            >
              <h4 className="text-base font-bold text-rose-900">
                Không thể tải danh sách phòng
              </h4>
              <p className="text-xs text-rose-800">
                Vui lòng kiểm tra quyền truy cập hoặc kết nối mạng và thử lại.
              </p>
              <button
                type="button"
                onClick={() => void refetchRooms()}
                className="h-8 rounded-lg bg-rose-800 px-4 text-xs font-bold text-white hover:bg-rose-900 cursor-pointer"
              >
                Thử lại
              </button>
            </div>
          ) : rooms.length === 0 ? (
            <div className="space-y-2 rounded-2xl bg-slate-50 p-8 text-center">
              <VsIcon
                name="meeting_room"
                className="mx-auto text-3xl text-slate-400"
              />
              <h4 className="text-base font-bold text-slate-900">
                Chưa có phòng vật lý nào
              </h4>
              <p className="text-xs text-slate-500">
                {canAddRoom
                  ? "Bấm 'Thêm phòng' ở trên để bổ sung phòng vật lý cho hạng phòng này."
                  : "Chưa có phòng nào được thiết lập cho hạng phòng này."}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-bold uppercase tracking-wider text-slate-600">
                    <th scope="col" className="p-3 pl-4">
                      Số phòng
                    </th>
                    <th scope="col" className="p-3">
                      Tầng
                    </th>
                    <th scope="col" className="p-3 text-center">
                      Trạng thái ({formatDateDisplay(currentDate)})
                    </th>
                    <th scope="col" className="p-3">
                      Khách / Đặt phòng
                    </th>
                    <th scope="col" className="p-3 text-center">
                      Mã đoàn
                    </th>
                    {canManageQr && (
                      <th scope="col" className="p-3 text-center">
                        Mã QR GuestOS
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rooms.map((room) => {
                    const {
                      label,
                      badgeClass,
                      guestName,
                      reservationCode,
                      groupCode,
                    } = resolveRoomProjection(room, isToday, isFuture);

                    return (
                      <tr
                        key={room.id}
                        className="transition-colors hover:bg-slate-50/70"
                      >
                        {/* Room Number */}
                        <td className="p-3 pl-4">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-xs font-black text-slate-900 border border-slate-200/80">
                              {room.roomNumber ?? "—"}
                            </span>
                          </div>
                        </td>

                        {/* Floor */}
                        <td className="p-3 text-xs font-semibold text-slate-600">
                          {room.floor?.trim() || "—"}
                        </td>

                        {/* Status Label (Trống / Đặt trước / Đang ở / Hard-block) */}
                        <td className="p-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold shadow-2xs ${badgeClass}`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
                            <span>{label}</span>
                          </span>
                        </td>

                        {/* Guest / Reservation Context */}
                        <td className="p-3 text-xs text-slate-700">
                          {guestName ? (
                            <div>
                              <div className="font-bold text-slate-900">
                                {guestName}
                              </div>
                              {reservationCode && (
                                <div className="text-xs font-mono text-slate-500">
                                  #{reservationCode}
                                </div>
                              )}
                            </div>
                          ) : reservationCode ? (
                            <div className="font-mono text-xs font-semibold text-slate-700">
                              #{reservationCode}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Group Code (Exposed & Visible) */}
                        <td className="p-3 text-center">
                          {groupCode ? (
                            <span className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-mono font-bold text-indigo-700 shadow-2xs">
                              <VsIcon name="group" className="text-xs" />
                              <span>{groupCode}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>

                        {/* GuestOS QR Status & Actions (Tenant only) */}
                        {canManageQr && (
                          <td className="p-3 text-center">
                            {(() => {
                              const status = getQrStatus(room);
                              const isActive = status === "ACTIVE";
                              const isBusy = qrActionBusyRoomId === room.id;

                              return (
                                <div className="inline-flex items-center justify-center gap-1.5">
                                  {isActive ? (
                                    <>
                                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800 shadow-2xs whitespace-nowrap">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                                        <span>Đang bật</span>
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setSelectedQrRoom(room)}
                                        title={`Xem & tải mã QR phòng ${getRoomNumber(room)}`}
                                        aria-label={`Xem QR phòng ${getRoomNumber(room)}`}
                                        className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 transition cursor-pointer shadow-2xs whitespace-nowrap"
                                      >
                                        <VsIcon name="qr_code_2" className="text-xs text-emerald-700" />
                                        <span>Xem QR</span>
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 shadow-2xs whitespace-nowrap">
                                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                                        <span>Chưa bật</span>
                                      </span>
                                      <button
                                        type="button"
                                        disabled={isBusy || isBulkQrBusy}
                                        onClick={() =>
                                          void handleSingleRoomQrAction(room, "activate")
                                        }
                                        title={`Kích hoạt mã QR cho phòng ${getRoomNumber(room)}`}
                                        aria-label={`Kích hoạt QR phòng ${getRoomNumber(room)}`}
                                        className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 hover:border-emerald-400 transition cursor-pointer disabled:opacity-50 shadow-2xs whitespace-nowrap"
                                      >
                                        <VsIcon
                                          name={isBusy ? "refresh" : "power_settings_new"}
                                          className={`text-xs ${isBusy ? "animate-spin" : ""}`}
                                        />
                                        <span>{isBusy ? "Đang bật..." : "Kích hoạt"}</span>
                                      </button>
                                    </>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 sm:px-6">
          <p className="text-xs text-slate-500 text-pretty">
            {canManageQr
              ? "Chế độ quản lý phòng & kích hoạt QR GuestOS • Chiếu theo ngày vận hành "
              : "Chế độ kiểm tra phòng vật lý (chỉ đọc) • Chiếu theo ngày vận hành "}
            <strong className="font-semibold text-slate-700">
              {formatDateDisplay(currentDate)}
            </strong>
          </p>
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-lg border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-100 cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-700"
          >
            Đóng
          </button>
        </div>
      </div>

      {/* Room QR Preview Sub-Modal */}
      {selectedQrRoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-preview-title"
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in"
        >
          <div className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-emerald-900 to-[#1a352d] px-5 py-3.5 text-white">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-emerald-300">
                  <VsIcon name="qr_code_2" className="text-lg" />
                </div>
                <div>
                  <h3
                    id="qr-preview-title"
                    className="text-sm font-bold text-white text-balance"
                  >
                    Mã QR GuestOS — Phòng #{getRoomNumber(selectedQrRoom)}
                  </h3>
                  <p className="text-xs text-emerald-100/80">
                    {roomType.roomTypeName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedQrRoom(null)}
                aria-label="Đóng bảng mã QR"
                className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white transition cursor-pointer"
              >
                <VsIcon name="close" className="text-lg" />
              </button>
            </div>

            {/* QR Code Body */}
            <div className="flex flex-col items-center p-6 text-center">
              {getGuestQrUrl(selectedQrRoom, clientOrigin) ? (
                <div className="flex flex-col items-center">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <BrandedRoomQr
                      value={getGuestQrUrl(selectedQrRoom, clientOrigin) ?? ""}
                      size={200}
                      title={`QR GuestOS Phòng ${getRoomNumber(selectedQrRoom)}`}
                    />
                  </div>

                  <p className="mt-3 text-xs font-mono font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200 max-w-xs truncate">
                    {getGuestQrUrl(selectedQrRoom, clientOrigin)}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        const url = getGuestQrUrl(selectedQrRoom, clientOrigin);
                        if (!url) return;
                        try {
                          await navigator.clipboard.writeText(url);
                          toast.success("Đã sao chép liên kết GuestOS vào clipboard.");
                        } catch {
                          toast.error("Không thể sao chép liên kết.");
                        }
                      }}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer whitespace-nowrap"
                    >
                      <VsIcon name="content_copy" className="text-xs text-slate-500" />
                      <span>Sao chép liên kết</span>
                    </button>

                    <a
                      href={getGuestQrUrl(selectedQrRoom, clientOrigin) ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 shadow-2xs hover:bg-emerald-100 transition cursor-pointer whitespace-nowrap"
                    >
                      <VsIcon name="open_in_new" className="text-xs text-emerald-700" />
                      <span>Mở thử GuestOS</span>
                    </a>
                  </div>
                </div>
              ) : (
                <div className="py-6">
                  <VsIcon name="qr_code_2" className="mx-auto text-4xl text-slate-300 mb-2" />
                  <p className="text-xs font-bold text-slate-700">Phòng chưa có mã QR công khai</p>
                  <p className="text-xs text-slate-500 mt-1">Vui lòng bấm Kích hoạt QR để tạo mã mới.</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-3">
              {getQrStatus(selectedQrRoom) === "ACTIVE" ? (
                <button
                  type="button"
                  onClick={() => {
                    const room = selectedQrRoom;
                    setSelectedQrRoom(null);
                    void handleSingleRoomQrAction(room, "deactivate");
                  }}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-rose-200 bg-white px-2.5 text-xs font-bold text-rose-700 hover:bg-rose-50 transition cursor-pointer"
                >
                  <VsIcon name="power_settings_new" className="text-xs" />
                  <span>Tạm tắt QR</span>
                </button>
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={() => setSelectedQrRoom(null)}
                className="h-8 rounded-lg border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
