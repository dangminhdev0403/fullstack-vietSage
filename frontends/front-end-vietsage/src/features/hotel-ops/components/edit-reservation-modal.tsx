"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { staffRoomsRepository } from "@/features/hotel-ops/repositories/staff-rooms-repository";
import { staffRoomsResource } from "@/features/hotel-ops/resources/staff-rooms-resource";
import type { HotelArrival, UpdateReservationInput } from "@/features/hotel-ops/types/hotel-ops-contract";
import { invalidateHotelRealtimeQueries } from "@/features/hotel-ops/utils/invalidate-hotel-realtime-queries";
import {
  formatVnDateInput,
  toDisplayVnDate,
  toIsoDate,
} from "@/features/local-biometric/components/check-in-workspace";
import { showErrorAlert, showSuccessAlert, showWarningAlert } from "@/libs/swal";

export type EditReservationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  hotelId: string;
  reservation: {
    id: string;
    reservationCode?: string | null;
    guestDisplayName: string;
    guestPhone?: string | null;
    guestCount?: number | null;
    notes?: string | null;
    roomId?: string | null;
    roomNumber?: string | null;
    roomTypeName?: string | null;
    plannedCheckInAt: string;
    plannedCheckOutAt: string;
    nightlyRateSnapshot?: number | string | null;
    rate?: number | string | null;
    roomSubtotal?: number | null;
    totalAmount?: number | null;
    expectedUpdatedAt?: string | null;
    status?: string | null;
    channel?: string | null;
    source?: string | null;
    sourcePartnerName?: string | null;
    groupCode?: string | null;
  } | null;
  availableRooms?: Array<{
    id: string;
    roomNumber?: string | null;
    type?: string | null;
    status?: string | null;
    price?: number | string | null;
    basePrice?: number | string | null;
  }>;
  canCheckIn?: boolean;
  onCheckIn?: () => void | Promise<void>;
  onOpenGroupOperations?: (groupCode: string) => void;
  onSelectReservation?: (res: { id: string; reservationCode?: string | null; roomNumber?: string | null }) => void;
  onSuccess?: (updated: HotelArrival) => void | Promise<void>;
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

function getVnDayOfWeek(isoDateStr?: string): string {
  if (!isoDateStr) return "";
  try {
    const raw = isoDateStr.split("T")[0];
    const parts = raw.split("-");
    if (parts.length !== 3) return "";
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(d.getTime())) return "";
    const days = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
    return days[d.getDay()] || "";
  } catch {
    return "";
  }
}

function addDaysToDate(baseDateStr: string, daysToAdd: number): string {
  if (!baseDateStr) return "";
  const raw = baseDateStr.split("T")[0];
  const parts = raw.split("-");
  if (parts.length !== 3) return "";
  const year = Number(parts[0]);
  const month = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  const d = new Date(year, month, day + daysToAdd);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dt = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dt}`;
}

function toDatetimeLocal(isoString?: string | null): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    const tzOffset = 7 * 60;
    const localMs = d.getTime() + (tzOffset + d.getTimezoneOffset()) * 60000;
    const localDate = new Date(localMs);
    return localDate.toISOString().slice(0, 16);
  } catch {
    return "";
  }
}

function calculateDiffNights(startIso?: string, endIso?: string): number {
  if (!startIso || !endIso) return 1;
  const d1 = new Date(startIso).getTime();
  const d2 = new Date(endIso).getTime();
  if (isNaN(d1) || isNaN(d2) || d2 <= d1) return 1;
  return Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
}

function VnDateTimeInput({
  id,
  label,
  value,
  onChange,
  required,
  defaultTime = "14:00",
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (isoString: string) => void;
  required?: boolean;
  defaultTime?: string;
}) {
  const parseValue = (val: string) => {
    if (!val) return { dateStr: "", timeStr: defaultTime };
    const parts = val.split("T");
    const dateStr = parts[0] || "";
    let timeStr = defaultTime;
    if (parts[1]) {
      timeStr = parts[1].slice(0, 5);
    }
    return { dateStr, timeStr };
  };

  const initial = parseValue(value);
  const [dateText, setDateText] = useState(() => toDisplayVnDate(initial.dateStr));
  const [timeText, setTimeText] = useState(() => initial.timeStr);
  const pickerRef = useRef<HTMLInputElement>(null);

  const [previousValue, setPreviousValue] = useState(value);
  if (previousValue !== value) {
    setPreviousValue(value);
    const { dateStr, timeStr } = parseValue(value);
    setDateText(toDisplayVnDate(dateStr));
    setTimeText(timeStr);
  }

  const emitCombined = (nextDateText: string, nextTime: string) => {
    const isoDate = toIsoDate(nextDateText);
    if (isoDate) {
      const time = nextTime || defaultTime;
      onChange(`${isoDate}T${time}:00+07:00`);
    } else if (!nextDateText.trim()) {
      onChange("");
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatVnDateInput(e.target.value, dateText);
    setDateText(formatted);
    emitCombined(formatted, timeText);
  };

  const handleDateBlur = () => {
    const digitsOnly = dateText.replace(/\D/g, "");
    if (digitsOnly.length === 4 && Number(digitsOnly) >= 1900 && Number(digitsOnly) <= new Date().getFullYear()) {
      const year = Number(digitsOnly);
      const iso = `${year}-01-01`;
      setDateText(`01/01/${year}`);
      emitCombined(`01/01/${year}`, timeText);
      return;
    }
    const iso = toIsoDate(dateText);
    if (iso) {
      const display = toDisplayVnDate(iso);
      setDateText(display);
      emitCombined(display, timeText);
    } else if (!dateText.trim()) {
      setDateText("");
      emitCombined("", timeText);
    }
  };

  const handlePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const iso = e.target.value;
    if (iso) {
      const display = toDisplayVnDate(iso);
      setDateText(display);
      emitCombined(display, timeText);
    }
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextTime = e.target.value;
    setTimeText(nextTime);
    emitCombined(dateText, nextTime);
  };

  const dayOfWeek = getVnDayOfWeek(toIsoDate(dateText));

  return (
    <div className="space-y-1.5 flex-1 min-w-0">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-xs font-bold text-slate-700 block">
          {label} {required && <span className="text-rose-600">*</span>}
        </label>
        {dayOfWeek && (
          <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200/60 px-2 py-0.5 rounded-md whitespace-nowrap">
            {dayOfWeek}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-[130px]">
          <input
            id={id}
            type="text"
            inputMode="numeric"
            maxLength={10}
            required={required}
            value={dateText}
            onChange={handleDateChange}
            onBlur={handleDateBlur}
            placeholder="dd/mm/yyyy"
            className="w-full rounded-xl border border-slate-300 bg-white pl-3 pr-8 py-2 text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-hidden focus:ring-1 focus:ring-blue-700 transition"
          />
          <input
            ref={pickerRef}
            type="date"
            tabIndex={-1}
            value={toIsoDate(dateText) || ""}
            onChange={handlePickerChange}
            className="sr-only"
            aria-hidden="true"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => {
              try {
                pickerRef.current?.showPicker();
              } catch {
                pickerRef.current?.focus();
              }
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-700 transition cursor-pointer p-0.5"
            aria-label="Chọn ngày từ lịch"
            title="Mở lịch chọn ngày"
          >
            <VsIcon name="calendar_today" className="text-sm" />
          </button>
        </div>

        <div className="w-24 shrink-0">
          <input
            type="time"
            value={timeText}
            onChange={handleTimeChange}
            className="w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-xs sm:text-sm font-semibold text-slate-900 focus:border-blue-700 focus:outline-hidden focus:ring-1 focus:ring-blue-700 transition text-center"
            title="Giờ nhận / trả phòng"
          />
        </div>
      </div>
    </div>
  );
}

const QUICK_NIGHT_OPTIONS = [1, 2, 3, 4, 5, 7, 10, 14];
const QUICK_DEPOSIT_PERCENT_OPTIONS = [0, 20, 30, 50, 100];

export function EditReservationModal({
  isOpen,
  onClose,
  hotelId,
  reservation,
  availableRooms: propRooms,
  canCheckIn,
  onCheckIn,
  onOpenGroupOperations,
  onSelectReservation,
  onSuccess,
}: EditReservationModalProps) {
  const queryClient = useQueryClient();
  const titleId = useId();
  const descId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [guestDisplayName, setGuestDisplayName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestCount, setGuestCount] = useState<number>(1);
  const [roomId, setRoomId] = useState<string>("");
  const [plannedCheckInAt, setPlannedCheckInAt] = useState("");
  const [plannedCheckOutAt, setPlannedCheckOutAt] = useState("");
  const [nightlyRate, setNightlyRate] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [depositAmountInput, setDepositAmount] = useState<string | null>(null);
  const [depositPercentInput, setDepositPercent] = useState<string | null>(null);
  const [depositMethod, setDepositMethod] = useState<string>("CASH");
  const [showRoomOverride, setShowRoomOverride] = useState(false);
  const [editScope, setEditScope] = useState<"SINGLE" | "GROUP">("SINGLE");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Query rooms if propRooms not provided
  const { data: roomsPage } = useQuery({
    ...staffRoomsResource.bind({ hotelId }).queries.list.options({
      status: "AVAILABLE",
      limit: 100,
    }),
    enabled: isOpen && !propRooms,
    staleTime: 10_000,
  });

  // Query group arrivals if reservation has groupCode
  const { data: groupArrivalsData } = useQuery({
    ...staffRoomsResource.bind({ hotelId }).queries.groupArrivals.options(reservation?.groupCode ?? ""),
    enabled: Boolean(isOpen && reservation?.groupCode),
    staleTime: 5000,
  });

  const groupReservations = useMemo(() => {
    return groupArrivalsData || [];
  }, [groupArrivalsData]);

  const { data: bookingPaymentsPage } = useQuery({
    ...staffRoomsResource.bind({ hotelId }).queries.bookingPayments.options({
      reservationId: reservation?.id,
    }),
    enabled: Boolean(isOpen && reservation?.id),
    staleTime: 5000,
  });

  const paidDeposits = useMemo(() => {
    const items = bookingPaymentsPage?.items || [];
    return items.reduce(
      (acc, item) => {
        const val = Number(("receivedAmount" in item && (typeof item.receivedAmount === "number" || typeof item.receivedAmount === "string") ? item.receivedAmount : undefined) ?? item.amount ?? 0);
        acc.total += val;
        const method = (item.paymentMethod || "CASH").toUpperCase();
        if (method === "CASH") acc.cash += val;
        else if (method === "BANK_TRANSFER" || method === "QR") acc.bankTransfer += val;
        else if (method === "CARD") acc.card += val;
        return acc;
      },
      { total: 0, cash: 0, bankTransfer: 0, card: 0 },
    );
  }, [bookingPaymentsPage?.items]);

  const roomsList = useMemo(() => {
    if (propRooms && propRooms.length > 0) return propRooms;
    const items = roomsPage?.items || [];
    return items.map((r) => ({
      id: r.id,
      roomNumber: r.roomNumber,
      type: r.type,
      status: r.status,
      price: r.price ?? r.basePrice,
      basePrice: r.basePrice,
    }));
  }, [propRooms, roomsPage?.items]);

  // Selected room base price
  const selectedRoom = useMemo(() => {
    return roomsList.find((r) => r.id === roomId);
  }, [roomsList, roomId]);

  const baseRate = useMemo(() => {
    return Number(
      selectedRoom?.price ??
      selectedRoom?.basePrice ??
      reservation?.nightlyRateSnapshot ??
      reservation?.rate ??
      0
    );
  }, [selectedRoom, reservation]);

  // Sync state whenever reservation opens
  const [previousInput, setPreviousInput] = useState<{ isOpen: boolean; reservation: EditReservationModalProps["reservation"] } | null>(null);
  if (previousInput?.isOpen !== isOpen || previousInput?.reservation !== reservation) {
    setPreviousInput({ isOpen, reservation });
    if (isOpen && reservation) {

    setGuestDisplayName(reservation.guestDisplayName || "");
    setGuestPhone(reservation.guestPhone || "");
    setGuestCount(reservation.guestCount ?? 1);
    setRoomId(reservation.roomId || "");
    setPlannedCheckInAt(toDatetimeLocal(reservation.plannedCheckInAt));
    setPlannedCheckOutAt(toDatetimeLocal(reservation.plannedCheckOutAt));

    const existingRate =
      reservation.nightlyRateSnapshot ??
      reservation.rate ??
      (reservation.roomSubtotal && reservation.plannedCheckInAt && reservation.plannedCheckOutAt
        ? Math.round(
            reservation.roomSubtotal /
              calculateDiffNights(reservation.plannedCheckInAt, reservation.plannedCheckOutAt),
          )
        : "");
    setNightlyRate(existingRate !== "" && existingRate !== null ? String(existingRate) : "");
    setNotes(reservation.notes || "");
    setShowRoomOverride(false);
    setEditScope("SINGLE");
    setIsSubmitting(false);
    setDepositAmount(null);
    setDepositPercent(null);
    }
  }

  const nights = calculateDiffNights(plannedCheckInAt, plannedCheckOutAt);
  const numericRate = nightlyRate ? Number(nightlyRate.replace(/\D/g, "")) : baseRate;
  const estimatedRoomTotal = numericRate * nights;

  const depositAmount = depositAmountInput ?? (paidDeposits.total > 0 ? String(paidDeposits.total) : "");
  const defaultDepositPercent = estimatedRoomTotal > 0 ? Math.round((paidDeposits.total / estimatedRoomTotal) * 100) : 0;
  const depositPercent = depositPercentInput ?? (paidDeposits.total > 0 && defaultDepositPercent <= 100 ? String(defaultDepositPercent) : "");
  const [previousTotal, setPreviousTotal] = useState(estimatedRoomTotal);
  if (previousTotal !== estimatedRoomTotal) {
    setPreviousTotal(estimatedRoomTotal);
    const pct = Number(depositPercent);
    if (estimatedRoomTotal > 0 && depositPercent !== "" && Number.isFinite(pct) && pct >= 0 && pct <= 100) {
      setDepositAmount(String(Math.round(((estimatedRoomTotal * pct) / 100) / 1000) * 1000));
    }
  }
  const numericDeposit = depositAmount ? Number(depositAmount.replace(/\D/g, "")) : paidDeposits.total;
  const remainingDue = Math.max(0, estimatedRoomTotal - numericDeposit);

  // Focus trap and Escape key listener
  useEffect(() => {
    if (!isOpen) return;
    firstInputRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !reservation) return null;

  // Quick nights handler
  const handleApplyQuickNights = (n: number) => {
    if (!plannedCheckInAt) return;
    const inDate = plannedCheckInAt.split("T")[0];
    const newOutDate = addDaysToDate(inDate, n);
    const outTime = plannedCheckOutAt.split("T")[1]?.slice(0, 5) || "12:00";
    if (newOutDate) {
      setPlannedCheckOutAt(`${newOutDate}T${outTime}:00+07:00`);
    }
  };

  // Price adjustment handlers
  const handlePercentRateChange = (percentDelta: number) => {
    const anchor = baseRate > 0 ? baseRate : numericRate;
    if (anchor <= 0) return;
    const factor = 1 + percentDelta / 100;
    const newRate = Math.round((anchor * factor) / 1000) * 1000;
    setNightlyRate(String(Math.max(0, newRate)));
  };

  const handleAmountRateChange = (amountDelta: number) => {
    const cur = numericRate > 0 ? numericRate : baseRate;
    const newRate = Math.max(0, cur + amountDelta);
    setNightlyRate(String(newRate));
  };

  const handleResetBaseRate = () => {
    if (baseRate > 0) {
      setNightlyRate(String(baseRate));
    }
  };

  // Quick deposit percent handlers & auto calculation
  const handleApplyDepositPercent = (pct: number) => {
    setDepositPercent(String(pct));
    if (pct === 0) {
      setDepositAmount("0");
      return;
    }
    if (estimatedRoomTotal <= 0) return;
    const dep = Math.round(((estimatedRoomTotal * pct) / 100) / 1000) * 1000;
    setDepositAmount(String(dep));
  };

  const handleCustomDepositPercentChange = (valStr: string) => {
    setDepositPercent(valStr);
    if (valStr === "") {
      setDepositAmount("");
      return;
    }
    const num = Number(valStr);
    if (!isNaN(num) && num >= 0 && num <= 100) {
      if (num === 0) {
        setDepositAmount("0");
        return;
      }
      if (estimatedRoomTotal > 0) {
        const dep = Math.round(((estimatedRoomTotal * num) / 100) / 1000) * 1000;
        setDepositAmount(String(dep));
      }
    }
  };

  const handleDepositAmountChange = (rawText: string) => {
    const rawDigits = rawText.replace(/\D/g, "");
    setDepositAmount(rawDigits);
    if (estimatedRoomTotal > 0 && rawDigits) {
      const num = Number(rawDigits);
      const pct = Math.round((num / estimatedRoomTotal) * 100);
      setDepositPercent(pct >= 0 && pct <= 100 ? String(pct) : "");
    } else {
      setDepositPercent("");
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reservation) return;

    const trimmedName = guestDisplayName.trim();
    if (!trimmedName) {
      await showWarningAlert("Thiếu thông tin", "Vui lòng nhập họ và tên khách đại diện.");
      firstInputRef.current?.focus();
      return;
    }

    if (!plannedCheckInAt || !plannedCheckOutAt) {
      await showWarningAlert("Thiếu thông tin", "Vui lòng chọn ngày nhận và trả phòng hợp lệ.");
      return;
    }

    const checkInDate = new Date(plannedCheckInAt);
    const checkOutDate = new Date(plannedCheckOutAt);
    if (checkOutDate <= checkInDate) {
      await showWarningAlert("Lịch trình không hợp lệ", "Ngày trả phòng phải sau ngày nhận phòng.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: UpdateReservationInput = {
        guestDisplayName: trimmedName,
        guestPhone: guestPhone.trim() || null,
        guestCount: guestCount > 0 ? guestCount : 1,
        notes: notes.trim() || null,
        roomId: roomId.trim() || null,
        plannedCheckInAt: checkInDate.toISOString(),
        plannedCheckOutAt: checkOutDate.toISOString(),
        startDate: plannedCheckInAt.slice(0, 10),
        endDate: plannedCheckOutAt.slice(0, 10),
        nightlyRateSnapshot: numericRate > 0 ? numericRate : null,
        expectedUpdatedAt: reservation.expectedUpdatedAt || undefined,
      };

      const updated = await staffRoomsRepository.updateReservation(
        hotelId,
        reservation.id,
        payload,
      );

      // If user chose to apply to the entire group
      if (editScope === "GROUP" && reservation.groupCode) {
        try {
          await staffRoomsRepository.updateGroupSharedFields(hotelId, reservation.groupCode, {
            groupName: trimmedName,
            leadGuestName: trimmedName,
            leadGuestPhone: guestPhone.trim() || null,
            notes: notes.trim() || null,
          });
        } catch (grpErr) {
          console.warn("Could not update group shared fields:", grpErr);
        }
      }

      // Record deposit if entered and higher than previously recorded DB deposit
      const enteredDepositNum = depositAmount ? Number(depositAmount.replace(/\D/g, "")) : 0;
      if (enteredDepositNum > paidDeposits.total) {
        const delta = enteredDepositNum - paidDeposits.total;
        try {
          await staffRoomsRepository.createBookingPayment(hotelId, {
            reservationId: reservation.id,
            amount: delta,
            receivedAmount: delta,
            paymentMethod: depositMethod,
            paymentType: "DEPOSIT",
            intent: "DEPOSIT",
            notes: "Ghi nhận tiền cọc khi cập nhật đơn đặt phòng",
          });
        } catch (payErr) {
          console.warn("Could not record deposit payment:", payErr);
        }
      }

      await showSuccessAlert(
        "Cập nhật thành công",
        editScope === "GROUP" && reservation.groupCode
          ? `Đã lưu thay đổi cho toàn bộ đoàn #${reservation.groupCode}.`
          : `Đã lưu thay đổi cho đơn đặt phòng #${reservation.reservationCode || reservation.id}.`,
      );

      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      if (onSuccess) {
        await onSuccess(updated);
      }
      onClose();
    } catch (err) {
      await showErrorAlert(
        "Không thể lưu thay đổi",
        err instanceof Error ? err.message : "Đã có lỗi xảy ra khi cập nhật đơn đặt phòng.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  // Rate difference badge calculation
  const rateDiffPercent =
    baseRate > 0 && numericRate !== baseRate
      ? Math.round(((numericRate - baseRate) / baseRate) * 100)
      : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-5 md:p-6 animate-in fade-in duration-150"
      onClick={() => onClose()}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl xl:max-w-6xl rounded-2xl bg-white shadow-2xl border border-slate-200 text-slate-900 overflow-hidden max-h-[94vh] flex flex-col animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between border-b border-slate-200 px-6 py-3.5 bg-slate-50/90 shrink-0 gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-900 border border-blue-200">
              <VsIcon name="edit_calendar" className="text-xl" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 id={titleId} className="text-base sm:text-lg font-black text-slate-900 text-balance">
                  Chỉnh sửa đơn đặt phòng
                </h2>
                {reservation.reservationCode && (
                  <span className="font-mono text-xs font-bold bg-white text-blue-900 border border-blue-200 px-2 py-0.5 rounded-md shadow-2xs">
                    #{reservation.reservationCode}
                  </span>
                )}
                {reservation.channel && (
                  <span className="text-xs font-bold bg-indigo-50 text-indigo-900 border border-indigo-200 px-2 py-0.5 rounded-md whitespace-nowrap">
                    {reservation.channel}
                  </span>
                )}
                {reservation.groupCode && (
                  <span className="text-xs font-bold bg-purple-50 text-purple-900 border border-purple-200 px-2 py-0.5 rounded-md whitespace-nowrap">
                    Đoàn #{reservation.groupCode}
                  </span>
                )}
              </div>
              <p id={descId} className="text-xs text-slate-500 font-medium mt-0.5">
                {reservation.roomNumber
                  ? `Phòng ${reservation.roomNumber} (${reservation.roomTypeName || "Tiêu chuẩn"})`
                  : "Chưa phân bổ số phòng cụ thể"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
            aria-label="Đóng"
          >
            <VsIcon name="close" className="text-base" />
          </button>
        </header>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Cột 1: Thông tin khách hàng, Phòng lưu trú & Đoàn khách (lg:col-span-5) */}
            <div className="lg:col-span-5 flex flex-col space-y-4">
              {/* Box 1: Khách hàng & Phòng lưu trú */}
              <div className="rounded-xl border border-slate-200/90 bg-slate-50/40 p-4 sm:p-5 space-y-3.5 shadow-2xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <VsIcon name="person" className="text-sm text-blue-700" />
                    <span>{reservation.groupCode ? "Thông tin khách / Trưởng đoàn" : "Thông tin khách đại diện"}</span>
                  </h3>
                  {reservation.status && (
                    <span className="text-xs font-bold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md whitespace-nowrap">
                      {reservation.status === "CONFIRMED"
                        ? "Đã xác nhận"
                        : reservation.status === "PENDING"
                          ? "Chờ xác nhận"
                          : reservation.status}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">
                    {reservation.groupCode ? "Tên đoàn / Trưởng đoàn" : "Họ và tên khách"} <span className="text-rose-600">*</span>
                  </label>
                  <input
                    ref={firstInputRef}
                    type="text"
                    required
                    value={guestDisplayName}
                    onChange={(e) => setGuestDisplayName(e.target.value)}
                    placeholder="VD: Nguyễn Văn An"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-hidden focus:ring-1 focus:ring-blue-700 transition"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">
                      Số điện thoại
                    </label>
                    <input
                      type="tel"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      placeholder="VD: 0901234567"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-hidden focus:ring-1 focus:ring-blue-700 transition"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">
                      Số lượng khách
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={guestCount}
                      onChange={(e) => setGuestCount(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-900 focus:border-blue-700 focus:outline-hidden focus:ring-1 focus:ring-blue-700 transition"
                    />
                  </div>
                </div>

                {/* Phòng lưu trú (Chuẩn tinh gọn: Hiển thị trạng thái + đổi tại check-in) */}
                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <VsIcon name="meeting_room" className="text-sm text-blue-700" />
                      <span>Phòng lưu trú</span>
                    </span>
                    <span className="text-xs font-black text-blue-900 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-md whitespace-nowrap">
                      {reservation.roomNumber
                        ? `Phòng ${reservation.roomNumber} (${reservation.roomTypeName || "Tiêu chuẩn"})`
                        : "Chưa phân bổ cụ thể"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 font-medium pt-1 border-t border-slate-100">
                    <span className="flex items-center gap-1 text-slate-500">
                      <VsIcon name="info" className="text-xs text-blue-600 shrink-0" />
                      <span>Đổi phòng linh hoạt khi Check-in hoặc kéo thả Tape Chart</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowRoomOverride((prev) => !prev)}
                      className="text-xs font-bold text-blue-700 hover:text-blue-900 hover:underline transition cursor-pointer whitespace-nowrap"
                    >
                      {showRoomOverride ? "Ẩn đổi phòng" : "Đổi phòng..."}
                    </button>
                  </div>

                  {showRoomOverride && (
                    <div className="pt-2 border-t border-slate-100 animate-in fade-in duration-150 space-y-1">
                      <label htmlFor="edit-reservation-room-select" className="text-xs font-semibold text-slate-600 block">
                        Chọn phòng khác:
                      </label>
                      <select
                        id="edit-reservation-room-select"
                        value={roomId}
                        onChange={(e) => {
                          const chosenId = e.target.value;
                          setRoomId(chosenId);
                          if (chosenId) {
                            const matched = roomsList.find((r) => r.id === chosenId);
                            if (matched && (matched.price || matched.basePrice)) {
                              setNightlyRate(String(matched.price || matched.basePrice));
                            }
                          }
                        }}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-blue-700 focus:outline-hidden focus:ring-1 focus:ring-blue-700 transition cursor-pointer"
                      >
                        <option value="">— Chưa gán phòng cụ thể —</option>
                        {reservation.roomId && !roomsList.some((r) => r.id === reservation.roomId) ? (
                          <option value={reservation.roomId}>
                            Phòng {reservation.roomNumber || reservation.roomId} (Phòng hiện tại)
                          </option>
                        ) : null}
                        {roomsList.map((room) => (
                          <option key={room.id} value={room.id}>
                            Phòng {room.roomNumber} {room.type ? `· ${room.type}` : ""}{" "}
                            {room.price ? `(${formatVnd(room.price)}/đêm)` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Box 2 (Nếu là đoàn khách): Thông tin đoàn khách */}
              {reservation.groupCode && (
                <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-4 space-y-3 shadow-2xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-purple-200/80">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-200 text-purple-900">
                        <VsIcon name="groups" className="text-base" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-purple-950 flex items-center gap-1.5">
                          <span>Đoàn khách #{reservation.groupCode}</span>
                        </h4>
                        <span className="text-xs font-semibold text-purple-800">
                          {groupReservations.length > 0 ? `${groupReservations.length} phòng trong đoàn` : "Đơn thuộc đoàn khách"}
                        </span>
                      </div>
                    </div>
                    {onOpenGroupOperations && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenGroupOperations(reservation.groupCode!);
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-800 hover:text-purple-950 bg-white border border-purple-300 hover:bg-purple-100 px-3 py-1.5 rounded-lg shadow-2xs transition cursor-pointer whitespace-nowrap"
                      >
                        <VsIcon name="open_in_new" className="text-xs" />
                        <span>Quản lý cả đoàn</span>
                      </button>
                    )}
                  </div>

                  {/* Interactive Room chips in the group */}
                  {groupReservations.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-xs font-bold text-purple-900 block">
                        Các phòng thuộc đoàn (nhấn để chuyển phòng):
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {groupReservations.map((item) => {
                          const isCurrent = item.id === reservation.id;
                          const rNum = item.assignedRoomNumber || item.room?.roomNumber || "Chưa xếp";
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                if (!isCurrent && onSelectReservation) {
                                  onSelectReservation({
                                    id: item.id,
                                    reservationCode: item.reservationCode,
                                    roomNumber: rNum,
                                  });
                                }
                              }}
                              disabled={isCurrent}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                                isCurrent
                                  ? "bg-purple-700 text-white shadow-xs ring-2 ring-purple-300 cursor-default"
                                  : "bg-white hover:bg-purple-100 text-purple-900 border border-purple-200"
                              }`}
                            >
                              P.{rNum} {isCurrent && "★"}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Scope selector */}
                  <div className="space-y-1.5 pt-2 border-t border-purple-200/80">
                    <span className="text-xs font-bold text-purple-900 block">
                      Phạm vi áp dụng khi lưu:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <label
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition ${
                          editScope === "SINGLE"
                            ? "border-purple-600 bg-white shadow-2xs text-purple-950 font-bold"
                            : "border-purple-200/60 bg-purple-50/50 text-slate-700 font-medium"
                        }`}
                      >
                        <input
                          type="radio"
                          name="edit-scope"
                          checked={editScope === "SINGLE"}
                          onChange={() => setEditScope("SINGLE")}
                          className="text-purple-700 focus:ring-purple-700"
                        />
                        <span>Chỉ sửa phòng này (P.{reservation.roomNumber || ""})</span>
                      </label>

                      <label
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition ${
                          editScope === "GROUP"
                            ? "border-purple-600 bg-white shadow-2xs text-purple-950 font-bold"
                            : "border-purple-200/60 bg-purple-50/50 text-slate-700 font-medium"
                        }`}
                      >
                        <input
                          type="radio"
                          name="edit-scope"
                          checked={editScope === "GROUP"}
                          onChange={() => setEditScope("GROUP")}
                          className="text-purple-700 focus:ring-purple-700"
                        />
                        <span>Cập nhật cho cả đoàn ({groupReservations.length} phòng)</span>
                      </label>
                    </div>
                    {editScope === "GROUP" && (
                      <p className="text-xs text-purple-900 font-medium pt-1">
                        💡 Tên trưởng đoàn, SĐT, ghi chú sẽ được đồng bộ cập nhật cho toàn bộ {groupReservations.length} phòng của đoàn.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Box 3 (hoặc Box 2 nếu khách lẻ): Ghi chú & Yêu cầu lưu trú */}
              <div className="rounded-xl border border-slate-200/90 bg-slate-50/40 p-4 sm:p-5 flex-1 flex flex-col space-y-3.5 shadow-2xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <VsIcon name="edit_note" className="text-sm text-blue-700" />
                    <span>Ghi chú / Yêu cầu lưu trú</span>
                  </h3>
                  {reservation.channel && (
                    <span className="text-xs font-bold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md whitespace-nowrap">
                      Kênh: {reservation.channel}
                    </span>
                  )}
                </div>

                <div className="flex-1 flex flex-col space-y-1.5">
                  <textarea
                    rows={4}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="VD: Khách yêu cầu tầng cao, đón khách lúc 15:00, xuất hóa đơn công ty..."
                    className="w-full flex-1 min-h-[110px] rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-hidden focus:ring-1 focus:ring-blue-700 transition resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Cột 2: Lịch trình, Giá phòng & Đặt cọc (lg:col-span-7) */}
            <div className="lg:col-span-7 space-y-4">
              {/* Khối Lịch trình lưu trú */}
              <div className="rounded-xl border border-slate-200/90 bg-slate-50/40 p-4 sm:p-5 space-y-3.5 shadow-2xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <VsIcon name="calendar_month" className="text-sm text-blue-700" />
                    <span>Lịch lưu trú ({nights} đêm)</span>
                  </h3>
                  <span className="text-xs font-bold text-slate-600 bg-white border border-slate-200 px-2.5 py-0.5 rounded-full shadow-2xs">
                    {nights} đêm lưu trú
                  </span>
                </div>

                {/* Nhận phòng & Trả phòng */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <VnDateTimeInput
                    id="edit-res-checkin"
                    label="Nhận phòng dự kiến"
                    required
                    value={plannedCheckInAt}
                    onChange={(iso) => setPlannedCheckInAt(iso)}
                    defaultTime="14:00"
                  />

                  <VnDateTimeInput
                    id="edit-res-checkout"
                    label="Trả phòng dự kiến"
                    required
                    value={plannedCheckOutAt}
                    onChange={(iso) => setPlannedCheckOutAt(iso)}
                    defaultTime="12:00"
                  />
                </div>

                {/* Dải nút chọn nhanh số đêm (Quick Night Pills) */}
                <div className="space-y-1.5 pt-1 border-t border-slate-200/70">
                  <span className="text-xs font-bold text-slate-600 block">
                    Chọn nhanh số đêm tính từ ngày nhận:
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {QUICK_NIGHT_OPTIONS.map((n) => {
                      const isActive = nights === n;
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => handleApplyQuickNights(n)}
                          className={`px-3 py-1 text-xs rounded-lg transition cursor-pointer whitespace-nowrap ${
                            isActive
                              ? "bg-blue-600 text-white font-bold shadow-xs ring-2 ring-blue-200"
                              : "bg-white hover:bg-slate-100 text-slate-700 font-semibold border border-slate-300"
                          }`}
                        >
                          {n} đêm
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Khối Đơn giá phòng & Tùy chọn tăng giảm */}
              <div className="rounded-xl border border-slate-200/90 bg-slate-50/40 p-4 sm:p-5 space-y-3.5 shadow-2xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <VsIcon name="payments" className="text-sm text-blue-700" />
                    <span>Đơn giá phòng mỗi đêm</span>
                  </h3>
                  {baseRate > 0 && (
                    <button
                      type="button"
                      onClick={handleResetBaseRate}
                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-900 bg-white border border-blue-200 hover:bg-blue-50 px-2 py-0.5 rounded-md transition cursor-pointer shadow-2xs"
                    >
                      <VsIcon name="restart_alt" className="text-xs" />
                      <span>Giá gốc: {formatVnd(baseRate)}</span>
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="relative">
                    <input
                      type="text"
                      value={numericRate > 0 ? numericRate.toLocaleString("vi-VN") : ""}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, "");
                        setNightlyRate(raw);
                      }}
                      placeholder="VD: 900.000"
                      className="w-full rounded-xl border border-slate-300 bg-white pl-3.5 pr-10 py-2 text-xs sm:text-sm font-black text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-hidden focus:ring-1 focus:ring-blue-700 transition"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                      ₫/đêm
                    </span>
                  </div>

                  {/* Diff indicator */}
                  {rateDiffPercent !== 0 && (
                    <div className="flex items-center gap-2 pt-0.5 text-xs">
                      {rateDiffPercent < 0 ? (
                        <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                          Giảm {Math.abs(rateDiffPercent)}% (-{formatVnd(baseRate - numericRate)}/đêm so với giá niêm yết)
                        </span>
                      ) : (
                        <span className="font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                          Tăng {rateDiffPercent}% (+{formatVnd(numericRate - baseRate)}/đêm so với giá niêm yết)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Quick adjustment buttons */}
                <div className="space-y-1.5 pt-1 border-t border-slate-200/70">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                    <span>Điều chỉnh nhanh đơn giá:</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handlePercentRateChange(-15)}
                      className="px-2.5 py-1 text-xs rounded-lg bg-white hover:bg-rose-50 text-rose-700 font-bold border border-rose-200 transition cursor-pointer"
                    >
                      -15%
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePercentRateChange(-10)}
                      className="px-2.5 py-1 text-xs rounded-lg bg-white hover:bg-rose-50 text-rose-700 font-bold border border-rose-200 transition cursor-pointer"
                    >
                      -10%
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePercentRateChange(-5)}
                      className="px-2.5 py-1 text-xs rounded-lg bg-white hover:bg-rose-50 text-rose-700 font-bold border border-rose-200 transition cursor-pointer"
                    >
                      -5%
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePercentRateChange(5)}
                      className="px-2.5 py-1 text-xs rounded-lg bg-white hover:bg-blue-50 text-blue-700 font-bold border border-blue-200 transition cursor-pointer"
                    >
                      +5%
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePercentRateChange(10)}
                      className="px-2.5 py-1 text-xs rounded-lg bg-white hover:bg-blue-50 text-blue-700 font-bold border border-blue-200 transition cursor-pointer"
                    >
                      +10%
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => handleAmountRateChange(-50000)}
                      className="px-2.5 py-1 text-xs rounded-lg bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 transition cursor-pointer"
                    >
                      -50.000 ₫
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAmountRateChange(-100000)}
                      className="px-2.5 py-1 text-xs rounded-lg bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 transition cursor-pointer"
                    >
                      -100.000 ₫
                    </button>
                  </div>
                </div>
              </div>

              {/* Khối Tiền đặt cọc (Đã cọc bao nhiêu) */}
              <div className="rounded-xl border border-slate-200/90 bg-slate-50/40 p-4 sm:p-5 space-y-3.5 shadow-2xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <VsIcon name="account_balance_wallet" className="text-sm text-emerald-700" />
                    <span>Tiền đặt cọc của khách</span>
                  </h3>
                  {paidDeposits.total > 0 && (
                    <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md whitespace-nowrap">
                      Đã ghi nhận cọc: {formatVnd(paidDeposits.total)}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">
                      Số tiền đã đặt cọc (₫)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={numericDeposit > 0 ? numericDeposit.toLocaleString("vi-VN") : ""}
                        onChange={(e) => handleDepositAmountChange(e.target.value)}
                        placeholder="VD: 500.000"
                        className="w-full rounded-xl border border-slate-300 bg-white pl-3.5 pr-10 py-2 text-xs sm:text-sm font-bold text-emerald-900 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-hidden focus:ring-1 focus:ring-emerald-700 transition"
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                        ₫
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">
                      Phương thức đặt cọc
                    </label>
                    <select
                      value={depositMethod}
                      onChange={(e) => setDepositMethod(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-semibold text-slate-900 focus:border-blue-700 focus:outline-hidden focus:ring-1 focus:ring-blue-700 transition cursor-pointer"
                    >
                      <option value="CASH">Tiền mặt (Cash)</option>
                      <option value="BANK_TRANSFER">Chuyển khoản (Bank Transfer)</option>
                      <option value="CARD">Thẻ tín dụng / POS</option>
                    </select>
                  </div>
                </div>

                {/* Dải nút chọn nhanh % cọc & ô tuỳ chỉnh % */}
                <div className="space-y-1.5 pt-1 border-t border-slate-200/70">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                    <span>Mức đặt cọc theo %:</span>
                    {numericDeposit > 0 && (
                      <span className="font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md whitespace-nowrap">
                        = {formatVnd(numericDeposit)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {QUICK_DEPOSIT_PERCENT_OPTIONS.map((pct) => {
                      const isActive = depositPercent !== "" && Number(depositPercent) === pct;
                      return (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => handleApplyDepositPercent(pct)}
                          className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer whitespace-nowrap ${
                            isActive
                              ? pct === 0
                                ? "bg-slate-800 text-white shadow-xs ring-2 ring-slate-300"
                                : "bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-200"
                              : pct === 0
                                ? "bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold"
                                : "bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300"
                          }`}
                        >
                          {pct}%
                        </button>
                      );
                    })}

                    {/* Ô nhập % tuỳ chỉnh kèm auto tính toán và fill vào box */}
                    <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs focus-within:border-emerald-600 focus-within:ring-1 focus-within:ring-emerald-600 shadow-2xs">
                      <span className="text-slate-500 font-semibold whitespace-nowrap">Tuỳ chỉnh:</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={depositPercent}
                        onChange={(e) => handleCustomDepositPercentChange(e.target.value)}
                        placeholder="%"
                        className="w-10 text-center font-bold text-emerald-900 outline-hidden [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-slate-500 font-bold">%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Khối Tóm tắt thanh toán trực quan */}
              <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 space-y-2.5 text-xs shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-200/60 pb-2">
                  <div className="flex items-center gap-2">
                    <VsIcon name="receipt_long" className="text-blue-700 text-base" />
                    <span className="text-slate-700 font-medium">
                      Thời gian: <strong className="text-slate-900">{nights} đêm</strong> · Đơn giá:{" "}
                      <strong className="text-slate-900">{formatVnd(numericRate)}/đêm</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600 font-semibold">Tổng tiền phòng:</span>
                    <span className="text-base font-black text-slate-900 tabular-nums">
                      {formatVnd(estimatedRoomTotal)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                  <div className="flex items-center gap-2 font-semibold">
                    <span className="text-emerald-800">
                      Tiền cọc ghi nhận: <strong className="font-bold tabular-nums">{formatVnd(numericDeposit)}</strong>
                    </span>
                    {numericDeposit > 0 ? (
                      <span className="text-slate-500 font-normal">
                        ({depositMethod === "CASH" ? "Tiền mặt" : depositMethod === "BANK_TRANSFER" ? "Chuyển khoản" : "Thẻ/POS"})
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5 font-bold">
                    <span className="text-slate-600">Còn lại phải thu khi nhận phòng:</span>
                    <span
                      className={`text-sm sm:text-base font-black tabular-nums ${
                        remainingDue <= 0 ? "text-emerald-700" : "text-amber-800"
                      }`}
                    >
                      {formatVnd(remainingDue)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3.5 border-t border-slate-200">
            <div>
              {canCheckIn && onCheckIn ? (
                <button
                  type="button"
                  onClick={onCheckIn}
                  disabled={isSubmitting}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-2xs transition active:scale-[0.98] cursor-pointer disabled:opacity-50"
                >
                  <VsIcon name="login" className="text-base" />
                  <span>Nhận phòng (Check-in) ngay</span>
                </button>
              ) : null}
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs sm:text-sm font-bold text-slate-700 transition hover:bg-slate-100 cursor-pointer disabled:opacity-50"
              >
                <span>Hủy bỏ</span>
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-700 hover:bg-blue-800 px-6 py-2 text-xs sm:text-sm font-bold text-white shadow-xs transition active:scale-[0.98] cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                {isSubmitting ? (
                  <>
                    <VsIcon name="progress_activity" className="animate-spin text-base" />
                    <span>Đang lưu...</span>
                  </>
                ) : (
                  <>
                    <VsIcon name="save" className="text-base" />
                    <span>Lưu thay đổi</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
