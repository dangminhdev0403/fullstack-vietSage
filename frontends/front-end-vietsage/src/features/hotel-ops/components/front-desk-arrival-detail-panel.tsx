"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { invalidateHotelRealtimeQueries } from "@/features/hotel-ops/utils/invalidate-hotel-realtime-queries";
import { staffRoomsRepository } from "@/features/hotel-ops/repositories/staff-rooms-repository";
import { staffRoomsResource } from "@/features/hotel-ops/resources/staff-rooms-resource";
import type {
  HotelArrival,
  HotelRoomSummary,
} from "@/features/hotel-ops/types/hotel-ops-contract";
import { getArrivalStatusDisplay } from "@/features/hotel-ops/utils/hotel-ops-display";
import { GroupCheckInModal } from "@/features/hotel-ops/components/group-check-in-modal";
import { BookingConfirmationModal } from "@/features/hotel-ops/components/booking-confirmation-modal";
import { EditReservationModal } from "@/features/hotel-ops/components/edit-reservation-modal";
import { GroupOperationsDrawer } from "@/features/hotel-ops/components/group-operations-drawer";
import { RoomCheckoutSettlementModal } from "@/features/hotel-ops/components/room-checkout-settlement-modal";
import {
  formatFriendlyCheckInError,
  formatFriendlyHotelOpsError,
} from "@/features/hotel-ops/utils/check-in-error";
import {
  escapeHtml,
  formatRoomAssignmentConfirmHtml,
  SwalVietSage,
  SWAL_CANCEL_BTN_CLASS,
  SWAL_CONFIRM_BTN_CLASS,
  SWAL_DANGER_BTN_CLASS,
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
  canViewBilling?: boolean;
  canCheckoutBilling?: boolean;
  canCheckOutStay?: boolean;
  onCheckIn?: (arrival: HotelArrival) => void;
  triggerElementRef?: React.RefObject<HTMLElement | null>;
};

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
  arrival: suppliedArrival,
  todayYmd: suppliedTodayYmd,
  canCheckInStay = false,
  canManageReservations = false,
  canOperateArrivals = false,
  canViewBilling = false,
  canCheckoutBilling = false,
  canCheckOutStay = false,
  onCheckIn,
  triggerElementRef,
}: FrontDeskArrivalDetailPanelProps) {
  const queryClient = useQueryClient();
  const [settlementTarget, setSettlementTarget] = useState<{
    room: HotelRoomSummary;
    stay: NonNullable<HotelRoomSummary["activeStay"]>;
  } | null>(null);
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
  const [isCheckInModalOpen, setIsCheckInModalOpen] = useState<boolean>(false);
  const [checkInError, setCheckInError] = useState<string | undefined>();
  const [isConfirmationOpen, setIsConfirmationOpen] = useState<boolean>(false);
  const [isGroupDrawerOpen, setIsGroupDrawerOpen] = useState<boolean>(false);
  const [depositMode, setDepositMode] = useState<"AMOUNT" | "PERCENT">("AMOUNT");
  const [depositPercent, setDepositPercent] = useState<string>("50");
  const [depositAmount, setDepositAmount] = useState<string>("");
  const [depositMethod, setDepositMethod] = useState<"CASH" | "BANK_TRANSFER" | "CARD" | "QR">("BANK_TRANSFER");
  const [depositNotes, setDepositNotes] = useState<string>("");
  const [isSubmittingDeposit, setIsSubmittingDeposit] = useState<boolean>(false);
  const [isSubmittingReceivable, setIsSubmittingReceivable] = useState<boolean>(false);
  const [localArrival, setLocalArrival] = useState<HotelArrival | null>(suppliedArrival);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const checkInReservation = useMutation(
    staffRoomsResource.bind({ hotelId }).mutations.checkInReservation.options(),
  );

  // Synchronize state when arrival changes without cascading render effect
  if (suppliedArrival && suppliedArrival.id !== prevArrivalId) {
    setPrevArrivalId(suppliedArrival.id);
    setLocalArrival(suppliedArrival);
    setSelectedRoomId(suppliedArrival.roomId || "");
    setIsAssigningMode(!suppliedArrival.roomId);
    setIsCheckInModalOpen(false);
    setIsEditModalOpen(false);
    setCheckInError(undefined);
    setIsCancelling(false);
    setIsConfirmationOpen(false);
    setIsGroupDrawerOpen(false);
    setDepositMode("AMOUNT");
    setDepositPercent("50");
    setDepositAmount("");
    setDepositNotes("");
  }

  const arrival = suppliedArrival
    ? (localArrival?.id === suppliedArrival.id ? localArrival : suppliedArrival)
    : null;

  // Keyboard navigation and focus trap
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (SwalVietSage.isVisible()) return;
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
  }, [isOpen, onClose]);

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

  // Query all rooms so we know both available rooms and live status/conflict of assigned room
  const canAssignRoom = Boolean(canManageReservations || canOperateArrivals);
  const { data: priorityAlerts, isPending: isLoadingHotelCalendar, isError: isHotelCalendarError } = useQuery({
    ...staffRoomsResource.bind({ hotelId }).queries.priorityAlerts.options(),
    enabled: Boolean(isOpen && hotelId),
    staleTime: 8_000,
  });
  const { data: roomsPage, isPending: isLoadingRooms, isError: isRoomsError } = useQuery({
    ...staffRoomsResource.bind({ hotelId }).queries.allRooms.options(),
    enabled: Boolean(isOpen && hotelId),
    staleTime: 8_000,
  });

  const allHotelRooms = useMemo(() => {
    return roomsPage?.items || [];
  }, [roomsPage?.items]);

  const availableRooms = useMemo(() => {
    const targetTypeId = arrival?.roomTypeId ?? null;
    const targetTypeName = arrival?.room?.type?.trim().toLowerCase() ?? null;
    return allHotelRooms.filter((r) => {
      if (r.id === arrival?.roomId) return true;
      if (r.status !== "AVAILABLE") return false;
      if (targetTypeId && r.roomTypeId !== targetTypeId) return false;
      if (!targetTypeId && targetTypeName && r.type?.trim().toLowerCase() !== targetTypeName) return false;
      return true;
    });
  }, [allHotelRooms, arrival?.roomId, arrival?.roomTypeId, arrival?.room?.type]);

  const assignedRoomLive = allHotelRooms.find((r) => r.id === arrival?.roomId) || null;

  const assignedRoomConflictStay = useMemo(() => {
    const st = assignedRoomLive?.activeStay;
    if (st && st.id && (st.status || "").toUpperCase() !== "CHECKED_OUT") {
      return {
        stayId: st.id,
        guestName: st.guestDisplayName || "Khách đang lưu trú",
        endDate: st.plannedCheckOutAt || null,
        status: st.status || "OCCUPIED",
        phone: st.guestPhone || null,
      };
    }
    return null;
  }, [assignedRoomLive?.activeStay]);

  const assignedRoomLiveStatus = (
    assignedRoomLive?.status ||
    arrival?.room?.status ||
    ""
  ).toUpperCase();

  const isAssignedRoomOccupiedConflict = Boolean(
    arrival?.roomId &&
      (Boolean(assignedRoomConflictStay) ||
        assignedRoomLiveStatus === "OCCUPIED" ||
        assignedRoomLiveStatus === "OVERDUE"),
  );

  const isAssignedRoomCleaningConflict = Boolean(
    arrival?.roomId &&
      !isAssignedRoomOccupiedConflict &&
      (assignedRoomLiveStatus === "PROCESSING" ||
        assignedRoomLiveStatus === "DIRTY" ||
        assignedRoomLiveStatus === "CLEANING"),
  );

  const { data: bookingPaymentsPage, refetch: refetchBookingPayments, isPending: isLoadingBookingPayments, isError: isBookingPaymentsError } = useQuery({
    ...staffRoomsResource.bind({ hotelId }).queries.bookingPayments.options({
      reservationId: arrival?.id,
      groupCode: arrival?.groupCode || undefined,
    }),
    enabled: Boolean(isOpen && arrival?.id),
    staleTime: 10_000,
  });

  const { data: receivablesPage, refetch: refetchReceivables } = useQuery({
    ...staffRoomsResource.bind({ hotelId }).queries.receivables.options({
      reservationId: arrival?.id,
      groupCode: arrival?.groupCode || undefined,
    }),
    enabled: Boolean(isOpen && arrival?.id),
    staleTime: 10_000,
  });

  const bookingPayments = bookingPaymentsPage?.items ?? [];
  const receivables = receivablesPage?.items ?? [];

  if (!isOpen || !arrival) {
    return null;
  }

  const activeArrival = localArrival ?? arrival;
  const hotelTimezone = priorityAlerts?.timezone || "Asia/Ho_Chi_Minh";
  const todayYmd = priorityAlerts?.businessDate || suppliedTodayYmd;
  const hotelDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: hotelTimezone, year: "numeric", month: "2-digit", day: "2-digit",
  });

  function formatDateTime(value?: string | Date | null): string {
    if (!value) return "Chưa xác định";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Chưa xác định";
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: hotelTimezone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    }).format(date);
  }

  const checkInYmd = hotelDate.format(new Date(activeArrival.plannedCheckInAt));
  const checkOutYmd = hotelDate.format(new Date(activeArrival.plannedCheckOutAt));
  const hasActiveStay = Boolean(
    assignedRoomLive?.activeStay &&
      !assignedRoomLive.activeStay.checkedOutAt &&
      assignedRoomLive.activeStay.status !== "CHECKED_OUT" &&
      activeArrival.reservationCode &&
      assignedRoomLive.activeStay.reservationCode === activeArrival.reservationCode,
  );
  const isOverdueUncheckedInArrival =
    !hasActiveStay &&
    ["PENDING", "CONFIRMED", "ARRIVAL_READY", "CHECKED_IN"].includes(activeArrival.status) &&
    checkInYmd < todayYmd;
  const isToday = checkInYmd === todayYmd;
  const isFuture = checkInYmd > todayYmd;
  const nights = calculateNights(activeArrival.plannedCheckInAt, activeArrival.plannedCheckOutAt);
  const roomPriceFallback =
    activeArrival.room?.price ?? activeArrival.room?.basePrice;
  const rateNumber = Number(
    activeArrival.nightlyRateSnapshot ?? activeArrival.rate ?? roomPriceFallback ?? 0,
  );
  const totalEstimated =
    activeArrival.totalAmount != null && Number(activeArrival.totalAmount) > 0
      ? Number(activeArrival.totalAmount)
      : activeArrival.roomSubtotal != null && Number(activeArrival.roomSubtotal) > 0
        ? Number(activeArrival.roomSubtotal)
        : rateNumber * nights;

  const paidDepositsSummary = (() => {
    return bookingPayments.reduce(
      (acc, p) => {
        const val = Number(("receivedAmount" in p && (typeof p.receivedAmount === "number" || typeof p.receivedAmount === "string") ? p.receivedAmount : undefined) ?? p.amount ?? 0);
        acc.total += val;
        const method = (p.paymentMethod || "CASH").toUpperCase();
        if (method === "CASH") acc.cash += val;
        else if (method === "BANK_TRANSFER" || method === "QR") acc.bankTransfer += val;
        else if (method === "CARD") acc.card += val;
        else acc.other += val;
        return acc;
      },
      { total: 0, cash: 0, bankTransfer: 0, card: 0, other: 0 },
    );
  })();

  const remainingBalance = Math.max(0, totalEstimated - paidDepositsSummary.total);
  const depositPaidAmount = paidDepositsSummary.total;

  function reservationResolutionSummaryHtml() {
    return `<dl class="space-y-2 text-left text-sm text-pretty">
      <div><dt class="font-semibold">Đặt phòng</dt><dd class="break-words">${escapeHtml(activeArrival.guestDisplayName)} · #${escapeHtml(activeArrival.reservationCode)}</dd></div>
      <div><dt class="font-semibold">Phòng</dt><dd>${escapeHtml(activeArrival.room?.roomNumber || "Chưa gán phòng")}</dd></div>
      <div><dt class="font-semibold">Lịch lưu trú</dt><dd>${escapeHtml(formatDateTime(activeArrival.plannedCheckInAt))} → ${escapeHtml(formatDateTime(activeArrival.plannedCheckOutAt))}</dd></div>
      ${depositPaidAmount > 0 ? `<div><dt class="font-semibold">Cọc thực nhận</dt><dd>${escapeHtml(formatVnd(depositPaidAmount))}</dd></div>` : ""}
    </dl><p class="mt-3 text-left text-sm text-pretty">Hủy đặt phòng sẽ bỏ giữ phòng.${depositPaidAmount > 0 ? " Tiền cọc được bảo toàn trong báo cáo doanh thu/cọc; không tự hoàn cọc." : ""}</p>`;
  }

  async function requireCurrentStaySchedule() {
    if (checkOutYmd <= todayYmd) {
      await SwalVietSage.fire({
        icon: "warning",
        title: "Lịch lưu trú đã hết hạn",
        text: canAssignRoom
          ? "Điều chỉnh lịch và kiểm tra xung đột phòng trước khi nhận khách."
          : "Cần người có quyền quản lý đặt phòng điều chỉnh lịch và kiểm tra xung đột trước khi nhận khách.",
        confirmButtonText: canAssignRoom ? "Điều chỉnh lịch" : "OK",
        position: "center",
      });
      if (canAssignRoom) setIsEditModalOpen(true);
      return false;
    }
    return true;
  }

  async function handleConfirmCheckIn({ confirmLateCheckIn }: { confirmLateCheckIn: true }) {
    if (!arrival || !canCheckInStay || isCheckingIn) return;
    if (!(await requireCurrentStaySchedule())) return;
    if (!activeArrival.roomId) {
      await showWarningAlert("Chưa gán phòng", "Gán phòng trước khi tiếp tục nhận khách.");
      if (canAssignRoom) setIsEditModalOpen(true);
      return;
    }
    setIsCheckingIn(true);
    try {
      await checkInReservation.mutateAsync({
        reservationId: activeArrival.id,
        payload: {
          expectedRoomId: activeArrival.roomId,
          expectedUpdatedAt: activeArrival.updatedAt,
          confirmLateCheckIn,
        },
      });
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      await showSuccessAlert("Đã nhận phòng", `${activeArrival.guestDisplayName} · Phòng ${activeArrival.room?.roomNumber || "đã gán"}`);
      onClose();
    } catch (err) {
      await showErrorAlert("Không thể nhận phòng", formatFriendlyCheckInError(err));
    } finally {
      setIsCheckingIn(false);
    }
  }

  async function openOverdueResolutionPrompt() {
    if (!isOverdueUncheckedInArrival || !(canManageReservations || canCheckInStay)) return;
    if (isLoadingHotelCalendar || isLoadingBookingPayments) return;
    if (isHotelCalendarError || isBookingPaymentsError) {
      await showErrorAlert("Chưa tải đủ thông tin đặt phòng", "Vui lòng tải lại lịch khách sạn và tiền cọc trước khi xử lý.");
      return;
    }
    const resolution = await SwalVietSage.fire({
      icon: "warning",
      title: "Xử lý đặt phòng quá hạn",
      html: reservationResolutionSummaryHtml(),
      position: "center",
      showDenyButton: canAssignRoom,
      showConfirmButton: canCheckInStay || (canAssignRoom && (checkOutYmd <= todayYmd || !activeArrival.roomId)),
      showCancelButton: true,
      confirmButtonText: "Tiếp tục nhận khách",
      denyButtonText: "Hủy đặt phòng",
      cancelButtonText: "Đóng",
      reverseButtons: false,
      customClass: {
        confirmButton: `${SWAL_CONFIRM_BTN_CLASS} whitespace-nowrap`,
        denyButton: `${SWAL_DANGER_BTN_CLASS} whitespace-nowrap`,
        cancelButton: `${SWAL_CANCEL_BTN_CLASS} whitespace-nowrap`,
      },
    });
    if (resolution.isDenied) {
      await handleUnifiedCancelReservation();
    } else if (resolution.isConfirmed) {
      if (!(await requireCurrentStaySchedule())) return;
      if (!activeArrival.roomId) {
        await showWarningAlert("Chưa gán phòng", "Gán phòng trước khi tiếp tục nhận khách.");
        if (canAssignRoom) setIsEditModalOpen(true);
        return;
      }
      await handleConfirmCheckIn({ confirmLateCheckIn: true });
    }
  }

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
      html: formatRoomAssignmentConfirmHtml({
        guestDisplayName: arrival.guestDisplayName,
        reservationCode: arrival.reservationCode,
        roomName,
        roomTypeName: arrival.room?.type || null,
      }),
      confirmText: "Gán phòng",
      cancelText: "Hủy bỏ",
      reverseButtons: false,
    });

    if (!confirm.isConfirmed) return;

    setIsSubmittingRoom(true);
    try {
      await staffRoomsRepository.assignReservationRoom(hotelId, arrival.id, {
        roomId: selectedRoomId,
      });

      await showSuccessAlert(
        "Gán phòng thành công",
        `Đã gán ${roomName} cho khách ${arrival.guestDisplayName}.`,
      );

      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      setIsAssigningMode(false);
      onClose();

    } catch (err) {
      await showErrorAlert(
        "Không thể gán phòng",
        formatFriendlyHotelOpsError(err),
      );
    } finally {
      setIsSubmittingRoom(false);
    }
  }

  function handleStartCheckIn() {
    if (!arrival) return;
    if (isOverdueUncheckedInArrival) {
      void openOverdueResolutionPrompt();
      return;
    }
    if (!arrival.roomId) {
      void showWarningAlert(
        "Chưa gán phòng",
        "Vui lòng gán phòng cho khách trước khi làm thủ tục nhận phòng.",
      );
      return;
    }
    if (onCheckIn) {
      onClose();
      onCheckIn(arrival);
      return;
    }
    setCheckInError(undefined);
    setIsCheckInModalOpen(true);
  }



  async function handleUnifiedCancelReservation() {
    if (!arrival || !canAssignRoom || hasActiveStay || isCancelling) return;
    if (isLoadingBookingPayments) return;
    if (isBookingPaymentsError) {
      await showErrorAlert("Chưa tải được tiền cọc", "Vui lòng tải lại trước khi hủy đặt phòng.");
      return;
    }
    const confirm = await SwalVietSage.fire({
      icon: "warning",
      title: "Hủy đặt phòng",
      html: `${reservationResolutionSummaryHtml()}
        <label for="${escapeHtml(titleId)}-cancel-reason" class="mt-3 block text-left text-sm font-semibold text-pretty">Chi tiết lý do (tùy chọn)</label>
        <textarea id="${escapeHtml(titleId)}-cancel-reason" data-cancel-reason maxlength="470" class="mt-1 w-full rounded-lg border border-slate-300 p-3 text-base text-pretty" rows="2"></textarea>`,
      input: "select",
      inputLabel: "Lý do hủy",
      inputOptions: {
        NO_SHOW: "Khách không đến (No-show)",
        GUEST_CANCELLED: "Khách báo hủy",
      },
      inputPlaceholder: "Chọn lý do hủy",
      position: "center",
      showCancelButton: true,
      confirmButtonText: "Hủy đặt phòng",
      cancelButtonText: "Giữ đặt phòng",
      reverseButtons: false,
      customClass: {
        confirmButton: `${SWAL_DANGER_BTN_CLASS} whitespace-nowrap`,
        cancelButton: `${SWAL_CANCEL_BTN_CLASS} whitespace-nowrap`,
      },
      preConfirm: (reasonKind: string) => {
        if (reasonKind !== "NO_SHOW" && reasonKind !== "GUEST_CANCELLED") {
          SwalVietSage.showValidationMessage("Chọn lý do hủy đặt phòng.");
          return false;
        }
        const details = SwalVietSage.getPopup()
          ?.querySelector<HTMLTextAreaElement>("[data-cancel-reason]")?.value.trim();
        const label = reasonKind === "NO_SHOW" ? "Khách không đến (No-show)" : "Khách báo hủy";
        const reason = details ? `${label}: ${details}` : label;
        if (reason.length > 500) {
          SwalVietSage.showValidationMessage("Lý do hủy tối đa 500 ký tự.");
          return false;
        }
        return { reasonKind, reason };
      },
    });
    if (!confirm.isConfirmed || !confirm.value) return;
    setIsCancelling(true);
    try {
      const { reasonKind, reason } = confirm.value;
      if (reasonKind === "NO_SHOW") {
        await staffRoomsRepository.markNoShowReservation(hotelId, arrival.id, { reason });
      } else {
        await staffRoomsRepository.cancelReservation(hotelId, arrival.id, { reason });
      }
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      await showSuccessAlert("Đã hủy đặt phòng", "Đã bỏ giữ phòng cho đơn được chọn.");
      onClose();
    } catch (err) {
      await showErrorAlert("Không thể hủy đặt phòng", formatFriendlyHotelOpsError(err));
    } finally {
      setIsCancelling(false);
    }
  }

  async function handleCreateDeposit() {
    if (!arrival) return;
    const numericAmount = depositMode === "AMOUNT" ? Number(depositAmount) : undefined;
    if (depositMode === "AMOUNT" && (!numericAmount || numericAmount <= 0)) {
      await showWarningAlert("Thiếu số tiền", "Vui lòng nhập số tiền cọc hoặc chọn tỷ lệ % hợp lệ.");
      return;
    }
    setIsSubmittingDeposit(true);
    try {
      await staffRoomsRepository.createBookingPayment(hotelId, {
        reservationId: arrival.id,
        groupCode: arrival.groupCode || undefined,
        paymentType: "DEPOSIT",
        inputMode: depositMode,
        percentValue: depositMode === "PERCENT" ? Number(depositPercent) : undefined,
        amount: numericAmount,
        paymentMethod: depositMethod,
        notes: depositNotes.trim() || undefined,
      });

      void refetchBookingPayments();
      setDepositAmount("");
      setDepositNotes("");
      await showSuccessAlert(
        "Đã ghi nhận thanh toán cọc",
        `Đã lưu khoản trả trước cho đơn #${arrival.reservationCode || arrival.id}.`,
      );
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
    } catch (err) {
      await showErrorAlert(
        "Không thể ghi nhận đặt cọc",
        formatFriendlyHotelOpsError(err),
      );
    } finally {
      setIsSubmittingDeposit(false);
    }
  }

  async function handleTransferStayToReceivable(stayId: string) {
    if (!arrival || !stayId) return;
    setIsSubmittingReceivable(true);
    try {
      await staffRoomsRepository.transferStayToReceivable(hotelId, stayId, {
        debtorName: arrival.guestDisplayName,
        contactPhone: arrival.guestPhone || undefined,
        amount: totalEstimated,
      });
      void refetchReceivables();
      await showSuccessAlert(
        "Chuyển công nợ thành công",
        `Đã chuyển khoản phải thu cho khách ${arrival.guestDisplayName}.`,
      );
    } catch (err) {
      await showErrorAlert(
        "Không thể chuyển công nợ",
        formatFriendlyHotelOpsError(err),
      );
    } finally {
      setIsSubmittingReceivable(false);
    }
  }

  async function handleCollectReceivable(receivableId: string, amount: number) {
    if (!receivableId) return;
    setIsSubmittingReceivable(true);
    try {
      await staffRoomsRepository.collectReceivable(hotelId, receivableId, {
        amount,
        paymentMethod: depositMethod,
      });
      void refetchReceivables();
      await showSuccessAlert(
        "Thu hồi công nợ thành công",
        "Đã cập nhật khoản thanh toán công nợ.",
      );
    } catch (err) {
      await showErrorAlert(
        "Không thể thu công nợ",
        formatFriendlyHotelOpsError(err),
      );
    } finally {
      setIsSubmittingReceivable(false);
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
                ) : arrival.status === "CHECKED_IN" ? (
                  <span className="rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 px-3 py-1 text-sm font-black uppercase tracking-wider whitespace-nowrap">
                    Đã nhận phòng
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
                Khách đặt trước · Dự kiến nhận: {formatDateTime(activeArrival.plannedCheckInAt)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isOverdueUncheckedInArrival ? (
                canManageReservations || canCheckInStay ? (
                  <button
                    type="button"
                    disabled={isCheckingIn || isCancelling || isLoadingHotelCalendar || isLoadingBookingPayments}
                    onClick={() => openOverdueResolutionPrompt()}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-amber-700 px-4 py-2 text-base font-bold text-white transition hover:bg-amber-800 disabled:opacity-50 whitespace-nowrap"
                  >
                    <VsIcon name="schedule" className="text-lg" />
                    <span>Xử lý quá hạn</span>
                  </button>
                ) : null
              ) : arrival.status !== "CANCELLED" &&
                arrival.status !== "NO_SHOW" &&
                arrival.status !== "CHECKED_IN" &&
                (arrival.roomId ? (
                  canCheckInStay ? (
                    <button
                      type="button"
                      disabled={isCheckingIn || isCancelling}
                      onClick={() => handleStartCheckIn()}
                      className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white px-3.5 text-xs sm:text-sm font-black shadow-xs transition active:scale-[0.98] cursor-pointer min-h-[40px] shrink-0 whitespace-nowrap"
                    >
                      <VsIcon name="login" className="text-base" />
                      <span>
                        {isCheckingIn
                          ? "Đang nhận..."
                          : isToday
                            ? "Nhận phòng ngay"
                            : "Nhận phòng sớm"}
                      </span>
                    </button>
                  ) : null
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsAssigningMode(true)}
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-3.5 text-xs sm:text-sm font-bold shadow-xs transition active:scale-[0.98] cursor-pointer min-h-[40px] shrink-0 whitespace-nowrap"
                  >
                    <VsIcon name="meeting_room" className="text-base" />
                    <span>Gán phòng ngay</span>
                  </button>
                ))}
              {arrival.groupCode && (
                <button
                  type="button"
                  onClick={() => setIsGroupDrawerOpen(true)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-900 px-3.5 text-xs sm:text-sm font-bold shadow-2xs transition active:scale-[0.98] cursor-pointer min-h-[40px] shrink-0 whitespace-nowrap"
                >
                  <VsIcon name="groups" className="text-base text-purple-700" />
                  <span>Quản lý đoàn</span>
                </button>
              )}
              {canManageReservations && (
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(true)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-900 px-3.5 text-xs sm:text-sm font-bold shadow-2xs transition active:scale-[0.98] cursor-pointer min-h-[40px] shrink-0 whitespace-nowrap"
                >
                  <VsIcon name="edit" className="text-base text-blue-700" />
                  <span>Chỉnh sửa</span>
                </button>
              )}
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label="Quay lại"
                title="Quay lại"
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 px-3.5 text-xs sm:text-sm font-bold shadow-2xs transition active:scale-[0.98] cursor-pointer min-h-[40px] shrink-0 whitespace-nowrap"
              >
                <VsIcon name="arrow_back" className="text-lg text-slate-600" />
                <span>Quay lại</span>
              </button>
            </div>
          </header>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
            {/* Warning banner if room is not yet allocated */}
            {!activeArrival.roomId && (
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
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
                    <div className="flex items-center gap-2">
                      <VsIcon name="person" className="text-slate-600 text-lg" />
                      <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">
                        Thông tin khách đặt phòng
                      </h3>
                    </div>
                    {canManageReservations && (
                      <button
                        type="button"
                        onClick={() => setIsEditModalOpen(true)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-900 transition cursor-pointer"
                      >
                        <VsIcon name="edit" className="text-sm" />
                        <span>Sửa thông tin</span>
                      </button>
                    )}
                  </div>
                  <div className="space-y-3 text-base">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-600">Khách đại diện:</span>
                      <span className="font-black text-slate-900 text-lg">
                        {activeArrival.guestDisplayName || "Chưa rõ"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-600">Số điện thoại:</span>
                      {activeArrival.guestPhone ? (
                        <a
                          href={`tel:${activeArrival.guestPhone}`}
                          className="font-bold text-blue-700 hover:underline inline-flex items-center gap-1"
                        >
                          <VsIcon name="phone" className="text-xs" />
                          <span>{activeArrival.guestPhone}</span>
                        </a>
                      ) : (
                        <span className="text-slate-400 font-medium">Chưa cung cấp</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/70">
                      <span className="text-sm font-semibold text-slate-600">Mã đặt phòng:</span>
                      <span className="font-mono font-bold text-slate-800 bg-slate-200 px-2.5 py-0.5 rounded text-sm">
                        #{activeArrival.reservationCode}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-600">Đoàn / Ghi chú:</span>
                      {activeArrival.groupCode ? (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-purple-700 text-sm font-mono bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                            #{activeArrival.groupCode}
                          </span>
                          <button
                            type="button"
                            onClick={() => setIsGroupDrawerOpen(true)}
                            className="inline-flex items-center gap-1 rounded-lg border border-purple-300 bg-purple-50 px-2.5 py-1 text-xs font-bold text-purple-700 hover:bg-purple-100 hover:text-purple-900 transition-all cursor-pointer whitespace-nowrap shadow-2xs min-h-[32px]"
                          >
                            <VsIcon name="groups" className="h-3.5 w-3.5 text-purple-600" />
                            <span>Mở quản lý đoàn</span>
                          </button>
                        </div>
                      ) : activeArrival.notes ? (
                        <span className="font-semibold text-slate-800 text-sm">
                          {activeArrival.notes}
                        </span>
                      ) : (
                        <span className="font-semibold text-slate-800 text-sm">
                          Khách lẻ (không ghi chú)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-600">Trạng thái:</span>
                      {(() => {
                        const statusDisplay = getArrivalStatusDisplay(activeArrival, todayYmd);
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
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <VsIcon name="calendar_month" className="text-slate-500 text-lg" />
                      <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">
                        Lịch lưu trú & Chi phí dự kiến
                      </h3>
                    </div>
                    {canManageReservations && (
                      <button
                        type="button"
                        onClick={() => setIsEditModalOpen(true)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-900 transition cursor-pointer"
                      >
                        <VsIcon name="edit" className="text-sm" />
                        <span>Sửa ngày / giá</span>
                      </button>
                    )}
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 font-semibold">Nhận phòng dự kiến:</span>
                      <span className="font-bold text-slate-900">
                        {formatDateTime(activeArrival.plannedCheckInAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 font-semibold">Trả phòng dự kiến:</span>
                      <span className="font-bold text-slate-900">
                        {formatDateTime(activeArrival.plannedCheckOutAt)}
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
                    {activeArrival.serviceSubtotal && activeArrival.serviceSubtotal > 0 ? (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 font-semibold">Dịch vụ đặt trước:</span>
                        <span className="font-bold text-slate-900">
                          {formatVnd(activeArrival.serviceSubtotal)}
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
                <div
                  className={`flex flex-col gap-3 rounded-xl border p-4 ${
                    isAssignedRoomOccupiedConflict
                      ? "border-rose-300 bg-rose-50/70"
                      : isAssignedRoomCleaningConflict
                        ? "border-amber-300 bg-amber-50/70"
                        : "border-blue-100 bg-blue-50/50"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-xl text-white font-black text-lg shadow-2xs ${
                          isAssignedRoomOccupiedConflict
                            ? "bg-rose-700"
                            : isAssignedRoomCleaningConflict
                              ? "bg-amber-600"
                              : "bg-blue-600"
                        }`}
                      >
                        {arrival.room?.roomNumber || "OK"}
                      </div>
                      <div>
                        <h4 className="font-black text-slate-900 text-base">
                          Phòng {arrival.room?.roomNumber || arrival.roomId}
                          {assignedRoomLive?.type || arrival.room?.type ? (
                            <span className="text-slate-600 font-normal text-sm ml-2">
                              · {assignedRoomLive?.type || arrival.room?.type}
                            </span>
                          ) : null}
                        </h4>
                        <p className="text-xs text-slate-600 mt-0.5 text-pretty">
                          {isAssignedRoomOccupiedConflict
                            ? `Phòng đang có khách lưu trú${assignedRoomConflictStay?.guestName ? ` (${assignedRoomConflictStay.guestName})` : ""} chưa làm thủ tục trả phòng (Check-out).`
                            : isAssignedRoomCleaningConflict
                              ? "Phòng khách cũ vừa trả, đang ở trạng thái chờ buồng phòng dọn sạch."
                              : `Sức chứa: ${assignedRoomLive?.maxOccupancy ? `${assignedRoomLive.maxOccupancy} khách` : "—"}.`}
                        </p>
                      </div>
                    </div>

                    {isAssignedRoomOccupiedConflict ? (
                      <span className="inline-flex items-center gap-1.5 self-start sm:self-center rounded-full bg-rose-100 border border-rose-300 px-3 py-1 text-xs font-bold text-rose-900 whitespace-nowrap">
                        <span className="h-2 w-2 rounded-full bg-rose-600" />
                        <span>Đang có khách ở (Chưa Check-out)</span>
                      </span>
                    ) : isAssignedRoomCleaningConflict ? (
                      <span className="inline-flex items-center gap-1.5 self-start sm:self-center rounded-full bg-amber-100 border border-amber-300 px-3 py-1 text-xs font-bold text-amber-900 whitespace-nowrap">
                        <span className="h-2 w-2 rounded-full bg-amber-600" />
                        <span>Chờ dọn phòng</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 self-start sm:self-center rounded-full bg-emerald-100 border border-emerald-300 px-3 py-1 text-xs font-bold text-emerald-800 whitespace-nowrap">
                        <span className="h-2 w-2 rounded-full bg-emerald-600" />
                        <span>{isLoadingRooms || isRoomsError || !assignedRoomLive ? "Chưa xác minh trạng thái" : assignedRoomLiveStatus === "AVAILABLE" ? "Đã phân bổ · Sẵn sàng" : "Phòng chưa sẵn sàng"}</span>
                      </span>
                    )}
                  </div>

                  {(isAssignedRoomOccupiedConflict || isAssignedRoomCleaningConflict) && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/70">
                      {isAssignedRoomOccupiedConflict &&
                        assignedRoomConflictStay?.stayId &&
                        canViewBilling &&
                        (canCheckoutBilling || canCheckOutStay) && (
                        <button
                          type="button"
                          onClick={() => {
                            const targetStay: NonNullable<HotelRoomSummary["activeStay"]> =
                              assignedRoomLive?.activeStay?.id === assignedRoomConflictStay.stayId
                                ? assignedRoomLive.activeStay
                                : {
                                    id: assignedRoomConflictStay.stayId,
                                    guestDisplayName: assignedRoomConflictStay.guestName,
                                    guestPhone: assignedRoomConflictStay.phone,
                                    plannedCheckOutAt: assignedRoomConflictStay.endDate,
                                    status: assignedRoomConflictStay.status,
                                  };
                            const targetRoom: HotelRoomSummary = assignedRoomLive ?? {
                              id: arrival.roomId || "",
                              roomNumber: arrival.room?.roomNumber || "",
                              floor: null,
                              type: arrival.room?.type || null,
                            };
                            setSettlementTarget({
                              room: targetRoom,
                              stay: targetStay,
                            });
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-rose-700 hover:bg-rose-800 px-3.5 py-2 text-xs font-black text-white shadow-xs transition cursor-pointer whitespace-nowrap"
                        >
                          <VsIcon name="payments" className="text-sm" />
                          <span>Trả phòng (Check-out) P.{arrival.room?.roomNumber || ""} ngay</span>
                        </button>
                      )}

                      {isAssignedRoomCleaningConflict && arrival.roomId && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!arrival.roomId) return;
                            try {
                              await staffRoomsRepository.markRoomReady(hotelId, arrival.roomId, assignedRoomLive?.updatedAt);
                              await invalidateHotelRealtimeQueries(queryClient, hotelId);
                              await showSuccessAlert(
                                "Phòng đã sẵn sàng!",
                                `Đã xác nhận Phòng ${arrival.room?.roomNumber || ""} sạch và sẵn sàng đón khách.`,
                              );
                            } catch (err) {
                              await showErrorAlert(
                                "Không thể cập nhật trạng thái",
                                formatFriendlyHotelOpsError(err),
                              );
                            }
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-3.5 py-2 text-xs font-black text-white shadow-xs transition cursor-pointer whitespace-nowrap"
                        >
                          <VsIcon name="check_circle" className="text-sm" />
                          <span>Xác nhận P.{arrival.room?.roomNumber || ""} đã dọn sạch</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setIsEditModalOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-900 shadow-2xs transition cursor-pointer whitespace-nowrap"
                      >
                        <VsIcon name="swap_horiz" className="text-sm text-emerald-700" />
                        <span>Đổi sang phòng trống khác (1 chạm)</span>
                      </button>
                    </div>
                  )}
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

            {/* Section 4: Deposit & Prepayments & Receivables */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <VsIcon name="payments" className="text-emerald-600 text-xl" />
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 text-balance">
                    Đặt cọc &amp; Thanh toán trước
                  </h3>
                </div>
                <span className="text-xs font-bold text-slate-600 whitespace-nowrap">
                  Đã ghi nhận: {bookingPayments.length} giao dịch
                </span>
              </div>

              {/* Financial Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-1">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Tổng tiền booking</span>
                  <div className="text-lg font-black text-slate-900 tabular-nums">
                    {formatVnd(totalEstimated)}
                  </div>
                  <span className="text-xs text-slate-500 font-medium block">
                    {nights} đêm {arrival.room?.roomNumber ? `· P.${arrival.room.roomNumber}` : ""}
                  </span>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 space-y-1">
                  <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block">Đã thanh toán / Cọc</span>
                  <div className="text-lg font-black text-emerald-700 tabular-nums">
                    {formatVnd(paidDepositsSummary.total)}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs font-semibold text-emerald-900">
                    <span className="bg-emerald-100/80 px-1.5 py-0.5 rounded text-emerald-800 whitespace-nowrap">
                      TM: {formatVnd(paidDepositsSummary.cash)}
                    </span>
                    <span className="bg-emerald-100/80 px-1.5 py-0.5 rounded text-emerald-800 whitespace-nowrap">
                      CK: {formatVnd(paidDepositsSummary.bankTransfer)}
                    </span>
                    {paidDepositsSummary.card > 0 ? (
                      <span className="bg-emerald-100/80 px-1.5 py-0.5 rounded text-emerald-800 whitespace-nowrap">
                        Thẻ: {formatVnd(paidDepositsSummary.card)}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className={`rounded-xl border p-3.5 space-y-1 ${
                  remainingBalance === 0
                    ? "border-emerald-200 bg-emerald-50/30 text-emerald-900"
                    : "border-amber-200 bg-amber-50/70 text-amber-950"
                }`}>
                  <span className="text-xs font-bold uppercase tracking-wider block opacity-75">Còn lại phải thu</span>
                  <div className={`text-lg font-black tabular-nums ${remainingBalance === 0 ? "text-emerald-700" : "text-amber-800"}`}>
                    {formatVnd(remainingBalance)}
                  </div>
                  <span className="text-xs font-semibold block">
                    {remainingBalance === 0 ? "Đã thu đủ 100%" : "Cần thu khi check-in / check-out"}
                  </span>
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs font-bold text-slate-600">Chọn nhanh:</span>
                <button
                  type="button"
                  onClick={() => {
                    setDepositMode("AMOUNT");
                    setDepositAmount(String(Math.round(totalEstimated * 0.5)));
                  }}
                  className="rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 transition cursor-pointer whitespace-nowrap"
                >
                  Cọc 50% ({formatVnd(Math.round(totalEstimated * 0.5))})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDepositMode("AMOUNT");
                    setDepositAmount(String(remainingBalance > 0 ? remainingBalance : totalEstimated));
                  }}
                  className="rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 transition cursor-pointer whitespace-nowrap"
                >
                  Toàn bộ 100% ({formatVnd(remainingBalance > 0 ? remainingBalance : totalEstimated)})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDepositMode("AMOUNT");
                    setDepositAmount("");
                  }}
                  className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 transition cursor-pointer whitespace-nowrap"
                >
                  Tùy chỉnh số tiền
                </button>
              </div>

              {/* Deposit Entry Form */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end bg-slate-50/60 p-3.5 rounded-xl border border-slate-100">
                <div>
                  <label htmlFor="arrival-deposit-mode" className="block text-xs font-bold text-slate-700 mb-1">
                    Hình thức tính cọc
                  </label>
                  <select
                    id="arrival-deposit-mode"
                    value={depositMode}
                    onChange={(e) => setDepositMode(e.target.value as "AMOUNT" | "PERCENT")}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                  >
                    <option value="AMOUNT">Theo số tiền (VND)</option>
                    <option value="PERCENT">Theo tỷ lệ (%)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="arrival-deposit-value" className="block text-xs font-bold text-slate-700 mb-1">
                    {depositMode === "PERCENT" ? "Tỷ lệ cọc (%)" : "Số tiền cọc (VND)"}
                  </label>
                  {depositMode === "PERCENT" ? (
                    <input
                      id="arrival-deposit-value"
                      type="number"
                      min={1}
                      max={100}
                      value={depositPercent}
                      onChange={(e) => setDepositPercent(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                    />
                  ) : (
                    <input
                      id="arrival-deposit-value"
                      type="number"
                      min={0}
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="VD: 500000"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                    />
                  )}
                </div>

                <div>
                  <label htmlFor="arrival-deposit-method" className="block text-xs font-bold text-slate-700 mb-1">
                    Nguồn tiền đối soát
                  </label>
                  <select
                    id="arrival-deposit-method"
                    value={depositMethod}
                    onChange={(e) => setDepositMethod(e.target.value as "CASH" | "BANK_TRANSFER" | "CARD" | "QR")}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                  >
                    <option value="BANK_TRANSFER">🏦 Chuyển khoản (CK)</option>
                    <option value="CASH">💵 Tiền mặt (TM)</option>
                    <option value="CARD">💳 Quẹt thẻ (POS)</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isSubmittingDeposit || isSubmittingReceivable}
                    onClick={() => void handleCreateDeposit()}
                    className="inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-4 py-2 text-xs font-bold text-white transition cursor-pointer disabled:opacity-50 whitespace-nowrap shadow-xs"
                  >
                    <VsIcon name="add_card" className="text-sm" />
                    <span>{isSubmittingDeposit ? "Đang lưu..." : "Ghi nhận đặt cọc"}</span>
                  </button>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="arrival-deposit-notes" className="block text-xs font-bold text-slate-700 mb-1">
                    Ghi chú người nộp / nội dung
                  </label>
                  <input
                    id="arrival-deposit-notes"
                    type="text"
                    value={depositNotes}
                    onChange={(e) => setDepositNotes(e.target.value)}
                    placeholder="VD: Anh Nam CK cọc phòng 50%"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                  />
                </div>
              </div>

              {/* Transactions History Table */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>Lịch sử các khoản cọc &amp; trả trước đã ghi nhận ({bookingPayments.length})</span>
                  {bookingPayments.length > 0 ? (
                    <span className="text-emerald-700 font-extrabold tabular-nums">
                      Tổng đã thu: {formatVnd(paidDepositsSummary.total)}
                    </span>
                  ) : null}
                </div>

                {bookingPayments.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center text-xs text-slate-500">
                    Chưa có giao dịch đặt cọc hoặc trả trước nào được ghi nhận cho đơn đặt phòng này.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs text-slate-700">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-bold text-xs tracking-wider">
                        <tr>
                          <th className="px-3.5 py-2 whitespace-nowrap">Thời gian</th>
                          <th className="px-3.5 py-2 whitespace-nowrap">Số tiền</th>
                          <th className="px-3.5 py-2 whitespace-nowrap">Nguồn tiền</th>
                          <th className="px-3.5 py-2">Mã GD / Ghi chú</th>
                          <th className="px-3.5 py-2 whitespace-nowrap text-right">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {bookingPayments.map((p) => {
                          const method = (p.paymentMethod || "CASH").toUpperCase();
                          const amount = Number(("receivedAmount" in p && (typeof p.receivedAmount === "number" || typeof p.receivedAmount === "string") ? p.receivedAmount : undefined) ?? p.amount ?? 0);
                          return (
                            <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 font-medium">
                                {formatDateTime(("receivedAt" in p && typeof p.receivedAt === "string" ? p.receivedAt : undefined) || p.createdAt)}
                              </td>
                              <td className="px-3.5 py-2.5 whitespace-nowrap font-bold text-slate-900 tabular-nums">
                                {formatVnd(amount)}
                              </td>
                              <td className="px-3.5 py-2.5 whitespace-nowrap">
                                {method === "BANK_TRANSFER" || method === "QR" ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-800 border border-blue-200">
                                    🏦 Chuyển khoản (CK)
                                  </span>
                                ) : method === "CARD" ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-xs font-bold text-purple-800 border border-purple-200">
                                    💳 Quẹt thẻ (POS)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-200">
                                    💵 Tiền mặt (TM)
                                  </span>
                                )}
                              </td>
                              <td className="px-3.5 py-2.5 text-slate-600">
                                {("transactionReference" in p && typeof p.transactionReference === "string" ? p.transactionReference : undefined) || p.referenceCode ? (
                                  <span className="font-mono font-bold text-slate-800 mr-1.5">
                                    [{("transactionReference" in p && typeof p.transactionReference === "string" ? p.transactionReference : undefined) || p.referenceCode}]
                                  </span>
                                ) : null}
                                <span>{p.notes || "—"}</span>
                              </td>
                              <td className="px-3.5 py-2.5 whitespace-nowrap text-right">
                                <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                                  Thành công
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Receivables Section */}
              {receivables.length > 0 ? (
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <div className="text-xs font-bold text-slate-700">
                    Công nợ liên kết ({receivables.length})
                  </div>
                  <div className="space-y-1.5">
                    {receivables.map((rec) => (
                      <div key={rec.id} className="flex items-center justify-between text-xs text-slate-700 p-2 rounded-lg bg-slate-50 border border-slate-200">
                        <span>
                          <strong>{rec.debtorName}</strong> · Còn lại: <strong className="text-rose-700">{formatVnd(rec.balanceAmount ?? rec.amount)}</strong>
                        </span>
                        {rec.status !== "SETTLED" ? (
                          <button
                            type="button"
                            disabled={isSubmittingReceivable}
                            onClick={() => void handleCollectReceivable(rec.id, Number(rec.balanceAmount ?? rec.amount ?? 0))}
                            className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800 hover:bg-blue-100 cursor-pointer whitespace-nowrap"
                          >
                            <span>Thu công nợ</span>
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-emerald-700">Đã tất toán</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (arrival as { activeStayId?: string | null }).activeStayId ? (
                <div className="pt-2 border-t border-slate-100 flex justify-end">
                  <button
                    type="button"
                    disabled={isSubmittingReceivable}
                    onClick={() =>
                      void handleTransferStayToReceivable(
                        String((arrival as { activeStayId?: string | null }).activeStayId),
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer whitespace-nowrap"
                  >
                    <span>Chuyển vào công nợ phải thu</span>
                  </button>
                </div>
              ) : null}
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

              {canAssignRoom && !hasActiveStay && (arrival.status === "CONFIRMED" || arrival.status === "ARRIVAL_READY") ? (
                  <button
                    type="button"
                    disabled={isCancelling || isCheckingIn || isLoadingBookingPayments}
                    onClick={() => handleUnifiedCancelReservation()}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-white hover:bg-rose-50 px-3.5 py-2 text-rose-700 font-bold text-xs sm:text-sm transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    <VsIcon name="cancel" className="text-base text-rose-600" />
                    <span>{isCancelling ? "Đang hủy..." : "Hủy đặt phòng"}</span>
                  </button>

              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsConfirmationOpen(true)}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-slate-700 font-bold text-xs sm:text-sm shadow-2xs transition-all hover:bg-slate-50 hover:text-slate-900 cursor-pointer whitespace-nowrap"
              >
                <VsIcon name="print" className="text-base text-slate-600" />
                <span>{arrival.groupCode ? "In phiếu đoàn" : "In phiếu xác nhận"}</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-5 py-2.5 text-slate-800 font-bold text-sm transition cursor-pointer min-h-[44px] whitespace-nowrap"
              >
                <span>Đóng</span>
              </button>

              {isOverdueUncheckedInArrival ? (
                canManageReservations || canCheckInStay ? (
                  <button
                    type="button"
                    disabled={isCheckingIn || isCancelling || isLoadingHotelCalendar || isLoadingBookingPayments}
                    onClick={() => openOverdueResolutionPrompt()}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-amber-700 px-5 py-2.5 text-base font-bold text-white transition hover:bg-amber-800 disabled:opacity-50 whitespace-nowrap"
                  >
                    <VsIcon name="schedule" className="text-lg" />
                    <span>Xử lý quá hạn</span>
                  </button>
                ) : null
              ) : arrival.status === "CANCELLED" ? (
                <div className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-rose-50 px-4 py-2 text-rose-800 text-sm font-bold border border-rose-300 whitespace-nowrap">
                  <VsIcon name="cancel" className="text-base text-rose-600" />
                  <span>Đơn đặt phòng đã bị hủy</span>
                </div>
              ) : arrival.status === "NO_SHOW" ? (
                <div className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-slate-100 px-4 py-2 text-slate-800 text-sm font-bold border border-slate-300 whitespace-nowrap">
                  <VsIcon name="person_off" className="text-base text-slate-600" />
                  <span>Vắng mặt (No-show)</span>
                </div>
              ) : arrival.status === "CHECKED_IN" ? (
                <div className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-4 py-2 text-emerald-800 text-sm font-bold border border-emerald-300 whitespace-nowrap">
                  <VsIcon name="check_circle" className="text-base text-emerald-600" />
                  <span>Đã nhận phòng thành công</span>
                </div>
              ) : arrival.roomId ? (
                canCheckInStay ? (
                  <button
                    type="button"
                    disabled={isCheckingIn || isCancelling}
                    onClick={() => handleStartCheckIn()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 px-6 py-2.5 text-white font-black text-sm sm:text-base shadow-md transition active:scale-[0.98] cursor-pointer min-h-[44px] whitespace-nowrap"
                  >
                    <VsIcon name="login" className="text-lg" />
                    <span>
                      {isCheckingIn
                        ? "Đang nhận phòng..."
                        : isToday
                          ? "Nhận phòng ngay"
                          : "Nhận phòng sớm (Check-in)"}
                    </span>
                  </button>
                ) : (
                  <div className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-slate-200/80 px-4 py-2 text-slate-800 text-sm font-bold border border-slate-300 whitespace-nowrap">
                    <VsIcon name="schedule" className="mr-1.5 h-4 w-4 text-slate-600" />
                    <span>Chế độ xem lịch đặt</span>
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

      {isCheckInModalOpen && activeArrival.roomId ? (
        <GroupCheckInModal
          isOpen={isCheckInModalOpen}
          hotelId={hotelId}
          groupCode={
            activeArrival.groupCode ||
            (activeArrival.reservationCode
              ? `RES-${activeArrival.reservationCode}`
              : `ARR-${activeArrival.id.slice(0, 8)}`)
          }
          rooms={
            activeArrival.groupCode
              ? []
              : [
                  {
                    reservationId: activeArrival.id,
                    reservationCode: activeArrival.reservationCode,
                    groupCode:
                      activeArrival.groupCode ||
                      activeArrival.reservationCode ||
                      "DIRECT",
                    roomId: activeArrival.roomId,
                    roomNumber: activeArrival.room?.roomNumber
                      ? String(activeArrival.room.roomNumber)
                      : activeArrival.roomId,
                    floor: assignedRoomLive?.floor ?? null,
                    roomType:
                      assignedRoomLive?.type ||
                      activeArrival.room?.type ||
                      null,
                    guestDisplayName: activeArrival.guestDisplayName || "",
                    guestPhone: activeArrival.guestPhone || null,
                    plannedCheckInAt:
                      activeArrival.plannedCheckInAt ||
                      new Date().toISOString(),
                    plannedCheckOutAt: activeArrival.plannedCheckOutAt || "",
                    rate: null,
                    status: "CONFIRMED",
                    stayId: null,
                    updatedAt: activeArrival.updatedAt ?? null,
                  },
                ]
          }
          initialArrivals={[activeArrival]}
          onClose={() => {
            setIsCheckInModalOpen(false);
            setCheckInError(undefined);
          }}
          onSuccess={async () => {
            setIsCheckInModalOpen(false);
            onClose();
            await invalidateHotelRealtimeQueries(queryClient, hotelId);
          }}
        />
      ) : null}

      {isConfirmationOpen ? (
        <BookingConfirmationModal
          isOpen={isConfirmationOpen}
          onClose={() => setIsConfirmationOpen(false)}
          hotelId={hotelId}
          reservationId={arrival.id}
          groupCode={arrival.groupCode}
          mode={arrival.groupCode ? "group" : "single"}
        />
      ) : null}

      {arrival.groupCode ? (
        <GroupOperationsDrawer
          isOpen={isGroupDrawerOpen}
          onClose={() => setIsGroupDrawerOpen(false)}
          hotelId={hotelId}
          groupCode={arrival.groupCode}
          initialArrivals={[arrival]}
          todayYmd={todayYmd}
          canOperateArrivals={canOperateArrivals}
          canCheckInStay={canCheckInStay}
          canCheckOutStay={Boolean(canManageReservations || canOperateArrivals)}
        />
      ) : null}

      <EditReservationModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        hotelId={hotelId}
        reservation={{
          id: activeArrival.id,
          reservationCode: activeArrival.reservationCode,
          guestDisplayName: activeArrival.guestDisplayName,
          guestPhone: activeArrival.guestPhone,
          guestCount: activeArrival.guestCount,
          notes: activeArrival.notes,
          roomId: activeArrival.roomId,
          roomNumber: activeArrival.room?.roomNumber,
          roomTypeName: activeArrival.room?.type,
          plannedCheckInAt: activeArrival.plannedCheckInAt,
          plannedCheckOutAt: activeArrival.plannedCheckOutAt,
          nightlyRateSnapshot: activeArrival.nightlyRateSnapshot ?? activeArrival.rate,
          roomSubtotal: activeArrival.roomSubtotal,
          totalAmount: activeArrival.totalAmount,
          expectedUpdatedAt: activeArrival.updatedAt,
          status: activeArrival.status,
          groupCode: activeArrival.groupCode,
        }}
        availableRooms={availableRooms}
        conflictingStay={assignedRoomConflictStay}
        onCheckOutConflictingStay={
          assignedRoomConflictStay?.stayId &&
          canViewBilling &&
          (canCheckoutBilling || canCheckOutStay)
            ? (stayId, roomNum) => {
                const matchedRoom =
                  allHotelRooms.find(
                    (r) =>
                      r.activeStay?.id === stayId ||
                      (roomNum && r.roomNumber === roomNum),
                  ) ?? assignedRoomLive;
                const checkoutRoom: HotelRoomSummary = matchedRoom ?? {
                  id: activeArrival.roomId || "",
                  roomNumber: roomNum || activeArrival.room?.roomNumber || "",
                  floor: null,
                  type: activeArrival.room?.type || null,
                };
                const checkoutStay: NonNullable<HotelRoomSummary["activeStay"]> =
                  matchedRoom?.activeStay && matchedRoom.activeStay.id === stayId
                    ? matchedRoom.activeStay
                    : {
                        id: stayId,
                        guestDisplayName: assignedRoomConflictStay.guestName,
                        guestPhone: assignedRoomConflictStay.phone,
                        plannedCheckOutAt: assignedRoomConflictStay.endDate,
                        status: assignedRoomConflictStay.status,
                      };
                setIsEditModalOpen(false);
                setSettlementTarget({
                  room: checkoutRoom,
                  stay: checkoutStay,
                });
              }
            : undefined
        }
        canCheckIn={Boolean(
          activeArrival.roomId &&
            checkOutYmd > todayYmd &&
            canCheckInStay &&
            activeArrival.status !== "CANCELLED" &&
            activeArrival.status !== "NO_SHOW" &&
            activeArrival.status !== "CHECKED_IN",
        )}
        onCheckIn={(updated) => {
          setLocalArrival(updated);
          setIsEditModalOpen(false);
          setCheckInError(undefined);
          setIsCheckInModalOpen(true);
        }}
        onViewDetails={() => setIsEditModalOpen(false)}
        onOpenGroupOperations={
          activeArrival.groupCode
            ? () => {
                setIsEditModalOpen(false);
                setIsGroupDrawerOpen(true);
              }
            : undefined
        }
        onSuccess={async (updated) => {
          let refreshed = updated;
          try {
            refreshed = await staffRoomsRepository.getReservation(hotelId, updated.id);
          } catch {
            // Keep the PATCH response if the follow-up refresh is temporarily unavailable.
          }
          setLocalArrival((prev) => ({ ...(prev || activeArrival), ...refreshed }));
          await invalidateHotelRealtimeQueries(queryClient, hotelId);
        }}
      />

      {settlementTarget && (
        <RoomCheckoutSettlementModal
          isOpen
          onClose={() => setSettlementTarget(null)}
          hotelId={hotelId}
          room={settlementTarget.room}
          stay={settlementTarget.stay}
          onCheckoutSuccess={async () => {
            setSettlementTarget(null);
            await invalidateHotelRealtimeQueries(queryClient, hotelId);
          }}
        />
      )}
    </>
  );
}
