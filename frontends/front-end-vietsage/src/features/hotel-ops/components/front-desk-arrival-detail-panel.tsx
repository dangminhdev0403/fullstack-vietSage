"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { invalidateHotelRealtimeQueries } from "@/features/hotel-ops/utils/invalidate-hotel-realtime-queries";
import { staffRoomsRepository } from "@/features/hotel-ops/repositories/staff-rooms-repository";
import { staffRoomsResource } from "@/features/hotel-ops/resources/staff-rooms-resource";
import type { HotelArrival } from "@/features/hotel-ops/types/hotel-ops-contract";
import { getArrivalStatusDisplay } from "@/features/hotel-ops/utils/hotel-ops-display";
import { CheckInWorkspace } from "@/features/local-biometric/components/check-in-workspace";
import type { CheckInStayFields } from "@/features/local-biometric/types/check-in-workspace";
import { BookingConfirmationModal } from "@/features/hotel-ops/components/booking-confirmation-modal";
import { EditReservationModal } from "@/features/hotel-ops/components/edit-reservation-modal";
import { GroupOperationsDrawer } from "@/features/hotel-ops/components/group-operations-drawer";
import {
  formatFriendlyCheckInError,
  isEarlyCheckInError,
  isLateCheckInError,
} from "@/features/hotel-ops/utils/check-in-error";
import {
  escapeHtml,
  formatCancelReservationConfirmHtml,
  formatEarlyCheckInConfirmHtml,
  formatNoShowConfirmHtml,
  formatRoomAssignmentConfirmHtml,
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
  const [isConfirmationOpen, setIsConfirmationOpen] = useState<boolean>(false);
  const [isGroupDrawerOpen, setIsGroupDrawerOpen] = useState<boolean>(false);
  const [depositMode, setDepositMode] = useState<"AMOUNT" | "PERCENT">("AMOUNT");
  const [depositPercent, setDepositPercent] = useState<string>("50");
  const [depositAmount, setDepositAmount] = useState<string>("");
  const [depositMethod, setDepositMethod] = useState<"CASH" | "BANK_TRANSFER" | "CARD" | "QR">("BANK_TRANSFER");
  const [depositReference, setDepositReference] = useState<string>("");
  const [depositNotes, setDepositNotes] = useState<string>("");
  const [isSubmittingDeposit, setIsSubmittingDeposit] = useState<boolean>(false);
  const [isSubmittingReceivable, setIsSubmittingReceivable] = useState<boolean>(false);
  const [localArrival, setLocalArrival] = useState<HotelArrival | null>(arrival);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);

  // Synchronize state when arrival changes without cascading render effect
  if (arrival && arrival.id !== prevArrivalId) {
    setPrevArrivalId(arrival.id);
    setLocalArrival(arrival);
    setSelectedRoomId(arrival.roomId || "");
    setIsAssigningMode(!arrival.roomId);
    setIsCheckInWorkspaceOpen(false);
    setIsEditModalOpen(false);
    setCheckInError(undefined);
    setIsCancelling(false);
    setIsMarkingNoShow(false);
    setIsConfirmationOpen(false);
    setIsGroupDrawerOpen(false);
    setDepositMode("AMOUNT");
    setDepositPercent("50");
    setDepositAmount("");
    setDepositReference("");
    setDepositNotes("");
  }

  // Keyboard navigation and focus trap
  useEffect(() => {
    if (!isOpen) return;

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

  // Query available rooms for assignment
  const canAssignRoom = Boolean(canManageReservations || canOperateArrivals);
  const { data: roomsPage, isLoading: isLoadingRooms } = useQuery({
    ...staffRoomsResource.bind({ hotelId }).queries.list.options({
      status: "AVAILABLE",
      limit: 100,
    }),
    enabled: Boolean(isOpen && isAssigningMode && canAssignRoom),
    staleTime: 10_000,
  });

  const availableRooms = useMemo(() => {
    const items = roomsPage?.items || [];
    return items.filter((r) => r.status === "AVAILABLE" || r.id === arrival?.roomId);
  }, [roomsPage?.items, arrival?.roomId]);

  const { data: bookingPaymentsPage, refetch: refetchBookingPayments } = useQuery({
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

  const checkInYmd = activeArrival.plannedCheckInAt.slice(0, 10);
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

    setIsCheckingIn(true);
    setCheckInError(undefined);

    const basePayload = {
      guestDisplayName: fields.guestDisplayName?.trim() || arrival.guestDisplayName,
      ...(fields.guestPhone?.trim() ? { guestPhone: fields.guestPhone.trim() } : {}),
      ...(fields.guestIdentityNumber?.trim() ? { guestIdentityNumber: fields.guestIdentityNumber.trim() } : {}),
      ...(fields.guestDateOfBirth?.trim() ? { guestDateOfBirth: fields.guestDateOfBirth.trim() } : {}),
      ...(fields.guestGender?.trim() ? { guestGender: fields.guestGender.trim() } : {}),
      ...(fields.guestNationality?.trim() ? { guestNationality: fields.guestNationality.trim() } : {}),
      ...(fields.guestResidencePlace?.trim() ? { guestResidencePlace: fields.guestResidencePlace.trim() } : {}),
      ...(fields.plannedCheckOutAt ? { plannedCheckOutAt: fields.plannedCheckOutAt } : {}),
      ...(fields.occupants?.length ? { occupants: fields.occupants } : {}),
      expectedRoomId: arrival.roomId,
      ...(arrival.updatedAt ? { expectedUpdatedAt: arrival.updatedAt } : {}),
    };

    const assignedRoom = availableRooms.find((r) => r.id === arrival.roomId);
    const roomLabel = arrival.room?.roomNumber
      ? `Phòng ${arrival.room.roomNumber}`
      : (assignedRoom?.roomNumber ? `Phòng ${assignedRoom.roomNumber}` : (arrival.roomId ? `Phòng ${arrival.roomId}` : "Chưa rõ"));
    const roomType = assignedRoom?.type || arrival.room?.type || "Tiêu chuẩn";
    const maxOccupancy = assignedRoom?.maxOccupancy ?? arrival.room?.maxOccupancy;
    const capacityLabel = maxOccupancy ? `${maxOccupancy} khách` : "Chưa thiết lập";
    const scheduleLabel = `${formatDateTime(arrival.plannedCheckInAt)} – ${formatDateTime(fields.plannedCheckOutAt || arrival.plannedCheckOutAt)} (${nights} đêm)`;
    const partyCount = 1 + (fields.occupants?.length || 0);
    const partyLabel = `${partyCount} khách (1 khách chính${fields.occupants?.length ? ` + ${fields.occupants.length} khách đi cùng` : ""})`;
    const notesLabel = arrival.notes || (arrival.groupCode ? `Mã đoàn: ${arrival.groupCode}` : "Không có ghi chú");

    const formatSuccessSummary = (isReplay: boolean, accessCode?: string) => {
      return [
        isReplay
          ? `Đơn đặt phòng #${arrival.reservationCode} đã được hoàn tất nhận phòng trước đó (phản hồi trùng lặp). Dữ liệu lưu trú đã được đồng bộ an toàn.`
          : `Đã hoàn tất nhận phòng thành công cho đơn đặt #${arrival.reservationCode}.`,
        `• Khách đại diện: ${fields.guestDisplayName || arrival.guestDisplayName}`,
        `• Mã đặt phòng: #${arrival.reservationCode}`,
        `• Phòng: ${roomLabel}`,
        `• Hạng phòng: ${roomType}`,
        `• Sức chứa: ${capacityLabel}`,
        `• Lịch trình: ${scheduleLabel}`,
        `• Đoàn lưu trú: ${partyLabel}`,
        `• Ghi chú: ${notesLabel}`,
        accessCode ? `• Mã GuestOS: ${accessCode}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    };

    try {
      // First request NEVER sends early/late override
      const resData = await staffRoomsRepository.checkInReservation(
        hotelId,
        arrival.id,
        basePayload,
      );

      setIsCheckInWorkspaceOpen(false);

      if (resData?.idempotent) {
        await showSuccessAlert(
          "Đã nhận phòng trước đó",
          formatSuccessSummary(true, resData?.accessCode),
        );
      } else {
        await showSuccessAlert(
          "Nhận phòng thành công",
          formatSuccessSummary(false, resData?.accessCode),
        );
      }

      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      onClose();

    } catch (err) {
      if (isEarlyCheckInError(err) || isLateCheckInError(err)) {
        const isEarly = isEarlyCheckInError(err);
        const warningConfirm = await showConfirmDialog({
          icon: "warning",
          title: isEarly ? "Xác nhận nhận phòng sớm?" : "Xác nhận nhận phòng quá hạn?",
          html: formatEarlyCheckInConfirmHtml({
            guestName: arrival.guestDisplayName,
            roomNumber: arrival.room?.roomNumber || "Chưa gán",
            scheduledDate: arrival.plannedCheckInAt ? arrival.plannedCheckInAt.slice(0, 10) : "Theo lịch hẹn",
            reservationCode: arrival.reservationCode,
            isEarly,
          }),
          confirmText: isEarly ? "Đồng ý nhận phòng sớm" : "Đồng ý nhận phòng trễ",
          cancelText: "Hủy bỏ",
          reverseButtons: false,
        });

        if (warningConfirm.isConfirmed) {
          setIsCheckingIn(true);
          try {
            // Only explicit warning confirmation retries with matching flag
            const retryData = await staffRoomsRepository.checkInReservation(
              hotelId,
              arrival.id,
              {
                ...basePayload,
                ...(isEarly
                  ? { confirmEarlyCheckIn: true }
                  : { confirmLateCheckIn: true }),
              },
            );

            setIsCheckInWorkspaceOpen(false);

            if (retryData?.idempotent) {
              await showSuccessAlert(
                "Đã nhận phòng trước đó",
                formatSuccessSummary(true, retryData?.accessCode),
              );
            } else {
              await showSuccessAlert(
                "Nhận phòng thành công",
                formatSuccessSummary(false, retryData?.accessCode),
              );
            }

            await invalidateHotelRealtimeQueries(queryClient, hotelId);
            onClose();

            return;
          } catch (retryErr) {
            await invalidateHotelRealtimeQueries(queryClient, hotelId);
            const retryMsg = formatFriendlyCheckInError(retryErr);
            setCheckInError(retryMsg);
            await showErrorAlert("Không thể nhận phòng", retryMsg);
            return;
          } finally {
            setIsCheckingIn(false);
          }
        } else {
          return;
        }
      }

      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      const msg = formatFriendlyCheckInError(err);
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
      html: formatCancelReservationConfirmHtml({
        guestName: arrival.guestDisplayName,
        reservationCode: arrival.reservationCode,
        roomNumber: arrival.room?.roomNumber || null,
      }),
      confirmText: "Hủy đặt phòng",
      cancelText: "Giữ lại",
      reverseButtons: false,
      confirmVariant: "danger",
    });

    if (!confirm.isConfirmed) return;

    setIsCancelling(true);
    try {
      await staffRoomsRepository.cancelReservation(hotelId, arrival.id, {});

      await showSuccessAlert(
        "Hủy đặt phòng thành công",
        `Đã hủy đơn đặt phòng #${arrival.reservationCode} của khách ${arrival.guestDisplayName} và giải phóng phòng thành công.`,
      );

      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      onClose();

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
      html: formatNoShowConfirmHtml({
        guestName: arrival.guestDisplayName,
        reservationCode: arrival.reservationCode,
        roomNumber: arrival.room?.roomNumber || null,
      }),
      confirmText: "Báo vắng mặt",
      cancelText: "Hủy bỏ",
      reverseButtons: false,
    });

    if (!confirm.isConfirmed) return;

    setIsMarkingNoShow(true);
    try {
      await staffRoomsRepository.markNoShowReservation(hotelId, arrival.id, {});

      await showSuccessAlert(
        "Ghi nhận vắng mặt thành công",
        `Đã chuyển đơn đặt phòng #${arrival.reservationCode} của khách ${arrival.guestDisplayName} sang trạng thái vắng mặt (No-show).`,
      );

      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      onClose();

    } catch (err) {
      await showErrorAlert(
        "Không thể ghi nhận vắng mặt",
        err instanceof Error ? err.message : "Đã có lỗi xảy ra khi báo vắng mặt.",
      );
    } finally {
      setIsMarkingNoShow(false);
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
        referenceCode: depositReference.trim() || undefined,
        notes: depositNotes.trim() || undefined,
      });

      void refetchBookingPayments();
      setDepositAmount("");
      setDepositReference("");
      setDepositNotes("");
      await showSuccessAlert(
        "Đã ghi nhận thanh toán cọc",
        `Đã lưu khoản trả trước cho đơn #${arrival.reservationCode || arrival.id}.`,
      );
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
    } catch (err) {
      await showErrorAlert(
        "Không thể ghi nhận đặt cọc",
        err instanceof Error ? err.message : "Đã có lỗi xảy ra khi lưu khoản đặt cọc.",
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
        err instanceof Error ? err.message : "Đã có lỗi xảy ra khi chuyển công nợ.",
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
        err instanceof Error ? err.message : "Đã có lỗi xảy ra khi thu công nợ.",
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
            <div className="flex items-center gap-2">
              {canManageReservations && (
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(true)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-900 px-3.5 text-xs sm:text-sm font-bold shadow-2xs transition active:scale-[0.98] cursor-pointer min-h-[40px] shrink-0"
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
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 px-3.5 text-xs sm:text-sm font-bold shadow-2xs transition active:scale-[0.98] cursor-pointer min-h-[40px] shrink-0"
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white font-black text-lg shadow-2xs">
                      {arrival.room?.roomNumber || "OK"}
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 text-base">
                        Phòng {arrival.room?.roomNumber || arrival.roomId}
                        {availableRooms.find((r) => r.id === arrival.roomId)?.type ? (
                          <span className="text-slate-600 font-normal text-sm ml-2">
                            · {availableRooms.find((r) => r.id === arrival.roomId)?.type}
                          </span>
                        ) : null}
                      </h4>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Sức chứa: {availableRooms.find((r) => r.id === arrival.roomId)?.maxOccupancy
                          ? `${availableRooms.find((r) => r.id === arrival.roomId)?.maxOccupancy} khách`
                          : "—"} · Phòng đã sẵn sàng tiếp đón khi khách đến.
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
                  <label htmlFor="arrival-deposit-ref" className="block text-xs font-bold text-slate-700 mb-1">
                    Mã tham chiếu / Số chuẩn chi ngân hàng
                  </label>
                  <input
                    id="arrival-deposit-ref"
                    type="text"
                    value={depositReference}
                    onChange={(e) => setDepositReference(e.target.value)}
                    placeholder="Mã GD ngân hàng / số bill POS"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                  />
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

              {arrival.status === "CANCELLED" ? (
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
            maxOccupancy: availableRooms.find((r) => r.id === arrival.roomId)?.maxOccupancy ?? arrival.room?.maxOccupancy ?? null,
          }}
          canManageStays={Boolean(canCheckInStay || canOperateArrivals)}
          initialStayFields={{
            guestDisplayName: arrival.guestDisplayName,
            guestPhone: arrival.guestPhone || "",
            plannedCheckOutAt: arrival.plannedCheckOutAt,
            reservationCode: arrival.reservationCode,
            plannedCheckInAt: arrival.plannedCheckInAt,
            notes: arrival.groupCode ? `Mã đoàn: ${arrival.groupCode}` : undefined,
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
        }}
        availableRooms={availableRooms}
        onSuccess={async (updated) => {
          setLocalArrival((prev) => ({
            ...(prev || activeArrival),
            ...updated,
          }));
          await invalidateHotelRealtimeQueries(queryClient, hotelId);
        }}
      />
    </>
  );
}
