"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import { invalidateHotelRealtimeQueries } from "@/features/hotel-ops/utils/invalidate-hotel-realtime-queries";
import { staffRoomsResource } from "@/features/hotel-ops/resources/staff-rooms-resource";
import type { HotelArrival } from "@/features/hotel-ops/types/hotel-ops-contract";
import { getArrivalStatusDisplay } from "@/features/hotel-ops/utils/hotel-ops-display";
import { CheckInWorkspace } from "@/features/local-biometric/components/check-in-workspace";
import type { CheckInStayFields } from "@/features/local-biometric/types/check-in-workspace";
import {
  showConfirmDialog,
  showErrorAlert,
  showSuccessAlert,
  showWarningAlert,
} from "@/libs/swal";

export type FrontDeskArrivalDetailPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  hotelId: string;
  arrival: HotelArrival | null;
  todayYmd: string;
  canCheckInStay?: boolean;
  canManageReservations?: boolean;
  canOperateArrivals?: boolean;
  triggerElementRef?: React.RefObject<HTMLElement | null>;
};

function formatDateTime(value?: string | Date | null): string {
  if (!value) return "Chưa xác định";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa xác định";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatVnd(val?: number | string | null): string {
  if (val === null || val === undefined || val === "") return "0 ₫";
  const num = typeof val === "number" ? val : Number(val);
  if (!Number.isFinite(num)) return "0 ₫";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(num);
}

function calculateNights(start?: string | null, end?: string | null): number {
  if (!start || !end) return 1;
  const d1 = new Date(start).getTime();
  const d2 = new Date(end).getTime();
  if (Number.isNaN(d1) || Number.isNaN(d2) || d2 <= d1) return 1;
  const nights = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
  return Math.max(1, nights);
}

export function FrontDeskArrivalDetailPanel({
  isOpen,
  onClose,
  hotelId,
  arrival,
  todayYmd,
  canCheckInStay = false,
  canManageReservations = false,
  canOperateArrivals = false,
  triggerElementRef,
}: FrontDeskArrivalDetailPanelProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();

  const [prevArrivalId, setPrevArrivalId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [isAssigningMode, setIsAssigningMode] = useState<boolean>(false);
  const [isSubmittingRoom, setIsSubmittingRoom] = useState<boolean>(false);
  const [isCheckingIn, setIsCheckingIn] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [isMarkingNoShow, setIsMarkingNoShow] = useState<boolean>(false);
  const [isCheckInWorkspaceOpen, setIsCheckInWorkspaceOpen] = useState<boolean>(false);
  const [checkInError, setCheckInError] = useState<string | undefined>();

  // Synchronize state when arrival changes without cascading render effect
  if (arrival && arrival.id !== prevArrivalId) {
    setPrevArrivalId(arrival.id);
    setSelectedRoomId(arrival.roomId || "");
    setIsAssigningMode(!arrival.roomId);
    setIsCheckInWorkspaceOpen(false);
    setCheckInError(undefined);
    setIsCancelling(false);
    setIsMarkingNoShow(false);
  }

  // Keyboard navigation and focus trap
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "Tab" && panelRef.current) {
        const focusableElements = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusableElements.length === 0) return;
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Initial focus on open and return focus to trigger on close
  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus();
    }
    const triggerEl = triggerElementRef?.current;
    return () => {
      triggerEl?.focus();
    };
  }, [isOpen, triggerElementRef]);

  // Query available rooms for assignment
  const canAssignRoom = Boolean(canManageReservations || canOperateArrivals);
  const { data: roomsPage, isLoading: isLoadingRooms } = useQuery({
    ...staffRoomsResource.bind({ hotelId }).queries.list.options({
      status: "AVAILABLE",
      limit: 100,
    }),
    enabled: Boolean(isOpen && canAssignRoom),
    staleTime: 10_000,
  });

  const availableRooms = useMemo(() => {
    const items = roomsPage?.items || [];
    return items.filter((r) => r.status === "AVAILABLE" || r.id === arrival?.roomId);
  }, [roomsPage?.items, arrival?.roomId]);

  if (!isOpen || !arrival) {
    return null;
  }

  const checkInYmd = arrival.plannedCheckInAt.slice(0, 10);
  const isToday = checkInYmd === todayYmd;
  const isFuture = checkInYmd > todayYmd;
  const nights = calculateNights(arrival.plannedCheckInAt, arrival.plannedCheckOutAt);
  const rateNumber = Number(arrival.rate ?? arrival.nightlyRateSnapshot ?? 0);
  const totalEstimated = rateNumber * nights;

  async function handleConfirmAssignRoom() {
    if (!arrival) return;
    if (!selectedRoomId) {
      await showWarningAlert(
        "Chưa chọn phòng",
        "Vui lòng chọn một phòng trống từ danh sách để gán cho khách.",
      );
      return;
    }

    const selectedRoom = availableRooms.find((r) => r.id === selectedRoomId);
    const roomName = selectedRoom?.roomNumber ? `Phòng ${selectedRoom.roomNumber}` : "phòng đã chọn";

    const confirm = await showConfirmDialog({
      icon: "question",
      title: "Xác nhận gán phòng?",
      text: `Khách hàng: ${arrival.guestDisplayName}\n${roomName}`,
      confirmText: "Gán phòng",
      cancelText: "Hủy bỏ",
      reverseButtons: false,
    });

    if (!confirm.isConfirmed) return;

    setIsSubmittingRoom(true);
    try {
      await requestInternalApiEnvelope(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/${encodeURIComponent(arrival.id)}/room`,
        {
          method: "PUT",
          body: { roomId: selectedRoomId },
        },
      );

      await showSuccessAlert(
        "Gán phòng thành công",
        `Đã gán ${roomName} cho khách ${arrival.guestDisplayName}.`,
      );

      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      setIsAssigningMode(false);
      onClose();
      router.refresh();
    } catch (err) {
      await showErrorAlert(
        "Không thể gán phòng",
        err instanceof Error ? err.message : "Đã có lỗi xảy ra khi gán phòng.",
      );
    } finally {
      setIsSubmittingRoom(false);
    }
  }

  function handleStartCheckIn() {
    if (!arrival) return;
    if (!arrival.roomId) {
      void showWarningAlert(
        "Chưa gán phòng",
        "Vui lòng gán phòng cho khách trước khi làm thủ tục nhận phòng.",
      );
      return;
    }
    setCheckInError(undefined);
    setIsCheckInWorkspaceOpen(true);
  }

  async function handleCheckInWorkspaceSubmit(fields: CheckInStayFields) {
    if (!arrival) return;

    const confirmation = await showConfirmDialog({
      icon: "question",
      title: "Xác nhận nhận phòng?",
      text: `Nhận phòng ${arrival.room?.roomNumber ? `Phòng ${arrival.room.roomNumber}` : ""} cho khách "${fields.guestDisplayName || arrival.guestDisplayName}". Hệ thống sẽ kích hoạt QR và mã GuestOS ngay.`,
      confirmText: "Nhận phòng",
      cancelText: "Hủy bỏ",
      reverseButtons: false,
    });

    if (!confirmation.isConfirmed) return;

    setIsCheckingIn(true);
    setCheckInError(undefined);
    try {
      const res = await requestInternalApiEnvelope<{
        accessCode: string;
        stayId: string;
        guestUrl?: string;
      }>(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/${encodeURIComponent(arrival.id)}/check-in`,
        {
          method: "POST",
          body: {
            guestDisplayName: fields.guestDisplayName?.trim() || arrival.guestDisplayName,
            ...(fields.guestPhone?.trim() ? { guestPhone: fields.guestPhone.trim() } : {}),
            ...(fields.guestIdentityNumber?.trim() ? { guestIdentityNumber: fields.guestIdentityNumber.trim() } : {}),
            ...(fields.guestDateOfBirth?.trim() ? { guestDateOfBirth: fields.guestDateOfBirth.trim() } : {}),
            ...(fields.guestGender?.trim() ? { guestGender: fields.guestGender.trim() } : {}),
            ...(fields.guestNationality?.trim() ? { guestNationality: fields.guestNationality.trim() } : {}),
            ...(fields.guestResidencePlace?.trim() ? { guestResidencePlace: fields.guestResidencePlace.trim() } : {}),
            ...(fields.plannedCheckOutAt ? { plannedCheckOutAt: fields.plannedCheckOutAt } : {}),
            ...(fields.occupants?.length ? { occupants: fields.occupants } : {}),
          },
        },
      );

      setIsCheckInWorkspaceOpen(false);
      await showSuccessAlert(
        "Nhận phòng thành công",
        `Đã nhận phòng cho khách ${fields.guestDisplayName || arrival.guestDisplayName}.${res.data?.accessCode ? ` Mã GuestOS: ${res.data.accessCode}` : ""}`,
      );

      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      onClose();
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Đã có lỗi xảy ra khi làm thủ tục nhận phòng.";
      setCheckInError(msg);
      await showErrorAlert("Không thể nhận phòng", msg);
    } finally {
      setIsCheckingIn(false);
    }
  }

  async function handleCancelReservation() {
    if (!arrival) return;

    const confirm = await showConfirmDialog({
      icon: "warning",
      title: "Xác nhận hủy đặt phòng?",
      text: `Đơn đặt phòng #${arrival.reservationCode} của khách "${arrival.guestDisplayName}" sẽ bị hủy. Phòng đã gán (nếu có) sẽ được giải phóng ngay lập tức để đón khách khác.`,
      confirmText: "Hủy đặt phòng",
      cancelText: "Giữ lại",
      reverseButtons: false,
    });

    if (!confirm.isConfirmed) return;

    setIsCancelling(true);
    try {
      await requestInternalApiEnvelope(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/${encodeURIComponent(arrival.id)}/cancel`,
        {
          method: "POST",
          body: {},
        },
      );

      await showSuccessAlert(
        "Hủy đặt phòng thành công",
        `Đã hủy đơn đặt phòng #${arrival.reservationCode} của khách ${arrival.guestDisplayName} và giải phóng phòng thành công.`,
      );

      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      onClose();
      router.refresh();
    } catch (err) {
      await showErrorAlert(
        "Không thể hủy đặt phòng",
        err instanceof Error ? err.message : "Đã có lỗi xảy ra khi hủy đặt phòng.",
      );
    } finally {
      setIsCancelling(false);
    }
  }

  async function handleMarkNoShow() {
    if (!arrival) return;

    const confirm = await showConfirmDialog({
      icon: "warning",
      title: "Xác nhận báo vắng mặt (No-show)?",
      text: `Xác nhận khách "${arrival.guestDisplayName}" (Đơn #${arrival.reservationCode}) không đến nhận phòng? Phòng sẽ được giải phóng ngay lập tức để phục vụ khách khác.`,
      confirmText: "Báo vắng mặt",
      cancelText: "Hủy bỏ",
      reverseButtons: false,
    });

    if (!confirm.isConfirmed) return;

    setIsMarkingNoShow(true);
    try {
      await requestInternalApiEnvelope(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/reservations/${encodeURIComponent(arrival.id)}/no-show`,
        {
          method: "POST",
          body: {},
        },
      );

      await showSuccessAlert(
        "Ghi nhận vắng mặt thành công",
        `Đã chuyển đơn đặt phòng #${arrival.reservationCode} của khách ${arrival.guestDisplayName} sang trạng thái vắng mặt (No-show).`,
      );

      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      onClose();
      router.refresh();
    } catch (err) {
      await showErrorAlert(
        "Không thể ghi nhận vắng mặt",
        err instanceof Error ? err.message : "Đã có lỗi xảy ra khi báo vắng mặt.",
      );
    } finally {
      setIsMarkingNoShow(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        className="my-auto flex flex-col w-full max-w-4xl lg:max-w-5xl rounded-2xl bg-white shadow-2xl border border-slate-200 text-slate-900 overflow-hidden max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4.5 bg-slate-50 shrink-0">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 id={titleId} className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 text-balance">
                {arrival.guestDisplayName}
              </h2>
              {arrival.reservationCode ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 font-mono text-xs sm:text-sm font-black text-blue-900 shadow-2xs whitespace-nowrap">
                  <span>#{arrival.reservationCode}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (arrival.reservationCode) {
                        void navigator.clipboard.writeText(arrival.reservationCode);
                        void showSuccessAlert(
                          "Đã sao chép",
                          `Mã đặt phòng #${arrival.reservationCode} đã được sao chép vào bộ nhớ tạm.`,
                        );
                      }
                    }}
                    className="inline-flex items-center text-blue-600 hover:text-blue-950 transition cursor-pointer"
                    title="Sao chép mã đặt phòng"
                    aria-label="Sao chép mã đặt phòng"
                  >
                    <VsIcon name="content_copy" className="text-xs" />
                  </button>
                </span>
              ) : null}
              {arrival.status === "CANCELLED" ? (
                <span className="rounded-lg bg-rose-50 text-rose-800 border border-rose-300 px-3 py-1 text-sm font-black uppercase tracking-wider whitespace-nowrap">
                  Đã hủy đặt phòng
                </span>
              ) : arrival.status === "NO_SHOW" ? (
                <span className="rounded-lg bg-slate-100 text-slate-800 border border-slate-300 px-3 py-1 text-sm font-black uppercase tracking-wider whitespace-nowrap">
                  Vắng mặt (No-show)
                </span>
              ) : isToday ? (
                <span className="rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 px-3 py-1 text-sm font-black uppercase tracking-wider whitespace-nowrap">
                  Hôm nay nhận phòng
                </span>
              ) : isFuture ? (
                <span className="rounded-lg bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 text-sm font-black uppercase tracking-wider whitespace-nowrap">
                  Lịch đặt tương lai
                </span>
              ) : (
                <span className="rounded-lg bg-amber-50 text-amber-800 border border-amber-300 px-3 py-1 text-sm font-black uppercase tracking-wider whitespace-nowrap">
                  Đến hạn nhận phòng
                </span>
              )}
              {arrival.status === "CANCELLED" || arrival.status === "NO_SHOW" ? null : arrival.roomId ? (
                <span className="rounded-lg bg-sky-50 text-sky-800 border border-sky-300 px-3 py-1 text-sm font-black uppercase tracking-wider whitespace-nowrap">
                  Phòng {arrival.room?.roomNumber || "Đã gán"}
                </span>
              ) : (
                <span className="rounded-lg bg-amber-50 text-amber-800 border border-amber-300 px-3 py-1 text-sm font-black uppercase tracking-wider whitespace-nowrap">
                  Chưa gán phòng
                </span>
              )}
            </div>
            <p id={descId} className="text-sm font-bold text-slate-600 mt-1">
              Khách đặt trước · Dự kiến nhận: {formatDateTime(arrival.plannedCheckInAt)}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Đóng chi tiết khách đặt trước"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-200 transition cursor-pointer min-h-[44px]"
          >
            <VsIcon name="close" className="text-2xl" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Warning banner if room is not yet allocated */}
          {!arrival.roomId && (
            <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs sm:text-sm text-amber-900 font-medium shadow-2xs">
              <VsIcon name="warning" className="text-base text-amber-600 shrink-0" />
              <span>
                Đơn đặt phòng này chưa được phân bổ phòng cụ thể. Bạn có thể chọn và gán phòng trống khả dụng ngay bên dưới trước khi khách làm thủ tục nhận phòng.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
            {/* Card 1: Guest Information */}
            <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 space-y-4">
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-200/80 pb-2.5">
                  <VsIcon name="person" className="text-slate-600 text-lg" />
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">
                    Thông tin khách đặt phòng
                  </h3>
                </div>
                <div className="space-y-3 text-base">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-600">Khách đại diện:</span>
                    <span className="font-black text-slate-900 text-lg">
                      {arrival.guestDisplayName || "Chưa rõ"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-600">Số điện thoại:</span>
                    {arrival.guestPhone ? (
                      <a
                        href={`tel:${arrival.guestPhone}`}
                        className="font-bold text-blue-700 hover:underline inline-flex items-center gap-1"
                      >
                        <VsIcon name="phone" className="text-xs" />
                        <span>{arrival.guestPhone}</span>
                      </a>
                    ) : (
                      <span className="text-slate-400 font-medium">Chưa cung cấp</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200/70">
                    <span className="text-sm font-semibold text-slate-600">Mã đặt phòng:</span>
                    <span className="font-mono font-bold text-slate-800 bg-slate-200 px-2.5 py-0.5 rounded text-sm">
                      #{arrival.reservationCode}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-600">Trạng thái:</span>
                    {(() => {
                      const statusDisplay = getArrivalStatusDisplay(arrival, todayYmd);
                      return (
                        <span
                          className={`inline-flex items-center gap-1.5 font-bold px-2.5 py-1 rounded text-xs border ${statusDisplay.badgeClass}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${statusDisplay.dotClass}`} />
                          <span>{statusDisplay.label}</span>
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </section>

            {/* Card 2: Schedule & Pricing */}
            <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs space-y-4">
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                  <VsIcon name="calendar_month" className="text-slate-500 text-lg" />
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">
                    Lịch lưu trú & Chi phí dự kiến
                  </h3>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-semibold">Nhận phòng dự kiến:</span>
                    <span className="font-bold text-slate-900">
                      {formatDateTime(arrival.plannedCheckInAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-semibold">Trả phòng dự kiến:</span>
                    <span className="font-bold text-slate-900">
                      {formatDateTime(arrival.plannedCheckOutAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-semibold">Số đêm lưu trú:</span>
                    <span className="font-bold text-slate-900">{nights} đêm</span>
                  </div>
                  {rateNumber > 0 ? (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 font-semibold">Giá phòng niêm yết:</span>
                      <span className="font-bold text-slate-900">
                        {formatVnd(rateNumber)} / đêm
                      </span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between pt-2.5 border-t border-slate-200/70 text-base font-black text-slate-900">
                    <span>Tổng tiền phòng dự kiến:</span>
                    <span className="text-emerald-700 text-lg font-black">
                      {formatVnd(totalEstimated)}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Section 3: Room Allocation */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <VsIcon name="meeting_room" className="text-blue-600 text-xl" />
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">
                  Phân bổ phòng cho khách
                </h3>
              </div>
              {arrival.roomId && !isAssigningMode && canAssignRoom ? (
                <button
                  type="button"
                  onClick={() => setIsAssigningMode(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition-all hover:bg-slate-50 hover:text-slate-900 cursor-pointer min-h-[36px]"
                >
                  <VsIcon name="swap_horiz" className="h-4 w-4 text-slate-500" />
                  <span>Đổi phòng khác</span>
                </button>
              ) : null}
            </div>

            {arrival.roomId && !isAssigningMode ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white font-black text-lg shadow-2xs">
                    {arrival.room?.roomNumber || "OK"}
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900 text-base">
                      Phòng {arrival.room?.roomNumber || arrival.roomId}
                    </h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Đã được phân bổ an toàn cho đơn đặt này. Phòng sẵn sàng tiếp đón khi khách đến.
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 self-start sm:self-center rounded-full bg-emerald-100 border border-emerald-300 px-3 py-1 text-xs font-bold text-emerald-800">
                  <span className="h-2 w-2 rounded-full bg-emerald-600" />
                  <span>Đã phân bổ phòng</span>
                </span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="arrival-assign-room-select"
                    className="text-xs font-bold uppercase tracking-wider text-slate-700"
                  >
                    Chọn phòng trống phù hợp từ danh sách khách sạn:
                  </label>
                  {isLoadingRooms ? (
                    <div className="flex items-center gap-2 py-3 text-sm text-slate-500">
                      <VsIcon name="refresh" className="h-4 w-4 animate-spin text-blue-600" />
                      <span>Đang tải danh sách phòng trống khả dụng...</span>
                    </div>
                  ) : availableRooms.length === 0 ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                      Hiện tại không có phòng nào ở trạng thái TRỐNG để gán. Vui lòng rà soát trên sơ đồ phòng.
                    </div>
                  ) : (
                    <select
                      id="arrival-assign-room-select"
                      value={selectedRoomId}
                      onChange={(e) => setSelectedRoomId(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 shadow-2xs focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                    >
                      <option value="">-- Chọn phòng trống phù hợp --</option>
                      {availableRooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          Phòng {r.roomNumber || r.id} ({r.type || "Tiêu chuẩn"}{r.floor ? ` · Tầng ${r.floor}` : ""})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={!selectedRoomId || isSubmittingRoom}
                    onClick={() => void handleConfirmAssignRoom()}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-xs transition-all hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                  >
                    <VsIcon name="check" className="h-4 w-4" />
                    <span>{isSubmittingRoom ? "Đang lưu..." : "Xác nhận gán phòng"}</span>
                  </button>
                  {arrival.roomId ? (
                    <button
                      type="button"
                      onClick={() => setIsAssigningMode(false)}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 cursor-pointer"
                    >
                      <span>Hủy đổi phòng</span>
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Footer Actions Bar */}
        <footer className="border-t border-slate-200 px-6 py-4 bg-slate-50 shrink-0 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/hotels/${encodeURIComponent(hotelId)}/rooms?flow=arrivals&roomId=${encodeURIComponent(arrival.roomId || "")}`}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-slate-700 font-bold text-xs sm:text-sm shadow-2xs transition-all hover:bg-slate-50 hover:text-slate-900 cursor-pointer whitespace-nowrap"
            >
              <VsIcon name="grid_view" className="text-base text-slate-500" />
              <span>Xem trên sơ đồ phòng</span>
            </Link>

            {canAssignRoom && (arrival.status === "CONFIRMED" || arrival.status === "ARRIVAL_READY") ? (
              <>
                <button
                  type="button"
                  disabled={isCancelling || isMarkingNoShow || isCheckingIn}
                  onClick={() => void handleCancelReservation()}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-white hover:bg-rose-50 px-3.5 py-2 text-rose-700 font-bold text-xs sm:text-sm transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <VsIcon name="cancel" className="text-base text-rose-600" />
                  <span>{isCancelling ? "Đang hủy..." : "Hủy đặt phòng"}</span>
                </button>

                <button
                  type="button"
                  disabled={isCancelling || isMarkingNoShow || isCheckingIn}
                  onClick={() => void handleMarkNoShow()}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3.5 py-2 text-slate-700 font-bold text-xs sm:text-sm transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <VsIcon name="person_off" className="text-base text-slate-500" />
                  <span>{isMarkingNoShow ? "Đang ghi nhận..." : "Báo vắng mặt (No-show)"}</span>
                </button>
              </>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-5 py-2.5 text-slate-800 font-bold text-sm transition cursor-pointer min-h-[44px] whitespace-nowrap"
            >
              <span>Đóng</span>
            </button>

            {arrival.status === "CANCELLED" || arrival.status === "NO_SHOW" ? (
              <div className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-slate-200/80 px-4 py-2 text-slate-700 text-sm font-bold border border-slate-300 whitespace-nowrap">
                <span>Đơn không còn hoạt động</span>
              </div>
            ) : arrival.roomId ? (
              isToday && canCheckInStay ? (
                <button
                  type="button"
                  disabled={isCheckingIn || isCancelling || isMarkingNoShow}
                  onClick={() => handleStartCheckIn()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 px-6 py-2.5 text-white font-black text-sm sm:text-base shadow-md transition active:scale-[0.98] cursor-pointer min-h-[44px] whitespace-nowrap"
                >
                  <VsIcon name="login" className="text-lg" />
                  <span>{isCheckingIn ? "Đang nhận phòng..." : "Nhận phòng ngay"}</span>
                </button>
              ) : (
                <div className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-slate-200/80 px-4 py-2 text-slate-800 text-sm font-bold border border-slate-300 whitespace-nowrap">
                  <VsIcon name="schedule" className="mr-1.5 h-4 w-4 text-slate-600" />
                  <span>Lịch đặt tương lai — Đến vào ngày nhận</span>
                </div>
              )
            ) : (
              <button
                type="button"
                onClick={() => setIsAssigningMode(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 px-5 py-2.5 text-white font-bold text-sm shadow-md transition cursor-pointer min-h-[44px] whitespace-nowrap"
              >
                <VsIcon name="meeting_room" className="text-lg" />
                <span>Gán phòng trước</span>
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>

    {isCheckInWorkspaceOpen && arrival.roomId ? (
      <CheckInWorkspace
        open={isCheckInWorkspaceOpen}
        hotelId={hotelId}
        room={{
          id: arrival.roomId,
          roomNumber: arrival.room?.roomNumber ? String(arrival.room.roomNumber) : arrival.roomId,
          type: availableRooms.find((r) => r.id === arrival.roomId)?.type ?? undefined,
          status: "available",
        }}
        canManageStays={Boolean(canCheckInStay || canOperateArrivals)}
        initialStayFields={{
          guestDisplayName: arrival.guestDisplayName,
          guestPhone: arrival.guestPhone || "",
          plannedCheckOutAt: arrival.plannedCheckOutAt,
        }}
        submitState={isCheckingIn ? "submitting" : "idle"}
        submitError={checkInError}
        onSubmit={handleCheckInWorkspaceSubmit}
        onClose={() => {
          if (isCheckingIn) return;
          setIsCheckInWorkspaceOpen(false);
          setCheckInError(undefined);
        }}
      />
    ) : null}
  </>
  );
}
