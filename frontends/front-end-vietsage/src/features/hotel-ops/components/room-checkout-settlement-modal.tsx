"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { staffRoomsRepository } from "@/features/hotel-ops/repositories/staff-rooms-repository";
import { staffRoomsResource } from "@/features/hotel-ops/resources/staff-rooms-resource";
import type {
  HotelRoomSummary,
  StayFolioContext,
} from "@/features/hotel-ops/types/hotel-ops-contract";
import { invalidateHotelRealtimeQueries } from "@/features/hotel-ops/utils/invalidate-hotel-realtime-queries";
import { showConfirmDialog, showErrorAlert, showSuccessAlert, showWarningAlert } from "@/libs/swal";
import { settleCheckout, checkoutErrorMessage } from "@/features/hotel-ops/utils/checkout-settlement";

export type RoomCheckoutSettlementModalProps = {
  isOpen: boolean;
  onClose: () => void;
  hotelId: string;
  room: HotelRoomSummary;
  stay: NonNullable<HotelRoomSummary["activeStay"]>;
  folioContext?: StayFolioContext | null;
  onCheckoutSuccess?: () => void | Promise<void>;
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

export function RoomCheckoutSettlementModal(props: RoomCheckoutSettlementModalProps) {
  return props.isOpen ? <CheckoutSettlementForm key={props.stay.id} {...props} /> : null;
}

function CheckoutSettlementForm({
  isOpen,
  onClose,
  hotelId,
  room,
  stay,
  folioContext,
  onCheckoutSuccess,
}: RoomCheckoutSettlementModalProps) {
  const queryClient = useQueryClient();
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  // Mode: "PAYMENT" (Thu nốt tiền khách) vs "RECEIVABLE" (Chuyển sang công nợ)
  const [settlementMode, setSettlementMode] = useState<"PAYMENT" | "RECEIVABLE">("PAYMENT");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const paymentAttempt = useRef<string | null>(null);

  // Form states for Payment
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "BANK_TRANSFER" | "CARD">("BANK_TRANSFER");
  const [paymentAmount, setPaymentAmount] = useState<string | undefined>(undefined);
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");

  // Form states for Receivable
  const [debtorType, setDebtorType] = useState<"GUEST" | "PARTNER" | "COMPANY">("GUEST");
  const [debtorName, setDebtorName] = useState(stay.guestDisplayName || "");
  const [partnerName, setPartnerName] = useState("");
  const [assigneeStaff, setAssigneeStaff] = useState("");
  const [receivableDueDate, setReceivableDueDate] = useState(() => {
    const date = new Date(); date.setDate(date.getDate() + 7); return date.toISOString().slice(0, 10);
  });
  const [receivableNotes, setReceivableNotes] = useState("");

  // Option to auto-mark room as clean/ready after checkout to immediately receive next guest
  const [autoMarkReady, setAutoMarkReady] = useState(true);

  // Auto-fetch folioContext if not passed in as prop (e.g. from Group Check-In Modal or deep links)
  const stayId = stay?.id || "";
  const { data: fetchedFolioContext, isLoading: isFolioLoading, isError: isFolioError } = useQuery({
    ...staffRoomsResource.bind({ hotelId }).queries.stayFolio.options(stayId),
    enabled: Boolean(isOpen && Boolean(stayId) && !folioContext),
    staleTime: 5000,
  });
  const effectiveFolioContext = folioContext ?? fetchedFolioContext;

  const staffQuery = useQuery({
    ...staffRoomsResource.bind({ hotelId }).queries.staffAssignments.options(undefined),
    enabled: isOpen && settlementMode === "RECEIVABLE",
  });
  const staffOptions = Array.from(new Map((staffQuery.data ?? [])
    .filter((assignment) => assignment.status === "ACTIVE")
    .map((assignment) => [assignment.userId, assignment])).values());

  // Query prior booking payments / deposits for this reservation or stay
  const reservationId = "reservationId" in stay && typeof stay.reservationId === "string" ? stay.reservationId : undefined;
  const { data: bookingPaymentsPage } = useQuery({
    ...staffRoomsResource.bind({ hotelId }).queries.bookingPayments.options({
      reservationId,
    }),
    enabled: Boolean(isOpen && reservationId),
    staleTime: 5000,
  });

  const bookingPayments = bookingPaymentsPage?.items ?? [];

  // Calculate deposit summary breakdown
  const paidDepositsSummary = useMemo(() => {
    return bookingPayments.reduce(
      (acc, p) => {
        const val = Number(p.receivedAmount ?? p.amount ?? 0);
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
  }, [bookingPayments]);

  // Total charges from folio
  const folioTotal = useMemo(() => {
    if (effectiveFolioContext?.summary?.total != null) {
      return Number(effectiveFolioContext.summary.total);
    }
    if (effectiveFolioContext?.items && effectiveFolioContext.items.length > 0) {
      return effectiveFolioContext.items.reduce((sum, item) => sum + Number(item.totalSnapshot || 0), 0);
    }
    return Number(stay.nightlyRateSnapshot || 0);
  }, [effectiveFolioContext, stay]);

  // Remaining balance
  const remainingDue = Math.max(0, folioTotal - paidDepositsSummary.total);

  // Focus trap and Escape key listener
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Handler for Option 1: Thu nốt tiền khách & Trả phòng
  async function handleSettlePaymentAndCheckout() {
    if (submittingRef.current || isFolioLoading || isFolioError || !effectiveFolioContext) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      paymentAttempt.current ??= `checkout-${stay.id}-${crypto.randomUUID()}`;
      const result = await settleCheckout({
        folioId: effectiveFolioContext.folio?.id,
        amount: Number(paymentAmount ?? remainingDue),
        autoMarkReady,
        issueInvoice: () => staffRoomsRepository.issueCheckoutInvoice(hotelId, effectiveFolioContext.folio!.id),
        confirmPayment: (invoiceId, amount) => staffRoomsRepository.confirmCheckoutPayment(hotelId, invoiceId, {
          method: paymentMethod, amount, cashReceived: amount,
          note: [paymentNote.trim(), paymentReference.trim()].filter(Boolean).join(" - ") || "Thanh toán trả phòng tại quầy",
          clientRequestId: paymentAttempt.current!,
        }),
        checkOutStay: () => stay.status === "CHECKED_OUT" ? Promise.resolve() :
          staffRoomsRepository.checkOutStay(hotelId, stay.id, { nextRoomStatus: "PROCESSING" }),
        markRoomReady: () => staffRoomsRepository.markRoomReady(hotelId, room.id, room.updatedAt),
      });
      await showSuccessAlert("Trả phòng thành công", result.roomReady
        ? `Phòng ${room.roomNumber} đã sẵn sàng đón khách mới.`
        : autoMarkReady ? "Đã trả phòng. Chưa thể xác nhận phòng sẵn sàng; vui lòng kiểm tra trạng thái phòng."
        : `Phòng ${room.roomNumber} đang chờ dọn.`);
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      await onCheckoutSuccess?.();
      onClose();
    } catch (error) {
      await showErrorAlert("Không thể hoàn tất trả phòng", checkoutErrorMessage(error));
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  // Handler for Option 2: Chuyển sang công nợ & Trả phòng
  async function handleTransferToReceivableAndCheckout() {
    if (submittingRef.current || isFolioLoading || isFolioError || !effectiveFolioContext) return;
    const finalDebtorName =
      debtorType === "PARTNER"
        ? partnerName.trim() || debtorName.trim()
        : debtorName.trim() || stay.guestDisplayName || "Khách lưu trú";

    if (!finalDebtorName) {
      await showWarningAlert("Thiếu thông tin", "Vui lòng nhập tên đối tượng ghi nhận công nợ.");
      return;
    }

    const confirm = await showConfirmDialog({
      icon: "warning",
      title: "Chuyển số dư vào sổ công nợ?",
      text: `Ghi nhận công nợ ${formatVnd(remainingDue)} cho ${finalDebtorName}. Phòng ${room.roomNumber} sẽ được trả và chuyển sang chờ dọn.`,
      confirmText: "Xác nhận chuyển nợ",
      cancelText: "Quay lại",
    });
    if (!confirm.isConfirmed) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const assignedStaffMember = staffOptions.find((s) => s.userId === assigneeStaff);
      await staffRoomsRepository.transferStayToReceivable(hotelId, stay.id, {
        debtorName: finalDebtorName,
        debtorType: debtorType,
        assigneeUserId: assigneeStaff.trim() || undefined,
        dueDate: receivableDueDate ? new Date(receivableDueDate).toISOString() : undefined,
        notes: [
          debtorType === "PARTNER" && partnerName ? `Đối tác/Đại lý: ${partnerName.trim()}` : "",
          assignedStaffMember ? `Nhân viên theo dõi đòi tiền: ${assignedStaffMember.user.fullName}` : "",
          receivableNotes.trim(),
        ].filter(Boolean).join(" - ") || undefined,
      });

      let roomReady = false;
      if (autoMarkReady) {
        try {
          await staffRoomsRepository.markRoomReady(hotelId, room.id, room.updatedAt);
          roomReady = true;
        } catch { /* The debt transfer completed; readiness is independently unconfirmed. */ }
      }

      await showSuccessAlert(
        "Đã chuyển công nợ thành công",
        roomReady
          ? `Đã chuyển ${formatVnd(remainingDue)} sang sổ công nợ của ${finalDebtorName}. Phòng ${room.roomNumber} đã chuyển sang SẴN SÀNG.`
          : `Đã chuyển ${formatVnd(remainingDue)} sang sổ công nợ của ${finalDebtorName}. Phòng ${room.roomNumber} đã hoàn tất trả phòng.`,
      );

      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      if (onCheckoutSuccess) {
        await onCheckoutSuccess();
      }
      onClose();
    } catch (err) {
      await showErrorAlert(
        "Không thể chuyển công nợ",
        checkoutErrorMessage(err),
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-3 sm:p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 pointer-events-auto"
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
        ref={modalRef}
        className="my-auto flex flex-col w-full max-w-4xl lg:max-w-5xl rounded-2xl bg-white shadow-2xl border border-slate-200 text-slate-900 overflow-hidden max-h-[92vh] animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50 shrink-0">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1 rounded-lg bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-900 uppercase tracking-wide">
                Phòng {room.roomNumber}
              </span>
              <h2 id={titleId} className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 text-balance">
                Quyết toán trả phòng · {stay.guestDisplayName}
              </h2>
            </div>
            <p id={descId} className="mt-1 text-xs text-slate-500 font-medium text-pretty">
              Nhận phòng: {formatDateTime(stay.checkedInAt || stay.plannedCheckInAt)} → Trả phòng dự kiến: {formatDateTime(stay.plannedCheckOutAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition cursor-pointer"
            aria-label="Đóng"
          >
            <VsIcon name="close" className="text-xl" />
          </button>
        </header>

        {isFolioError ? <p role="alert" className="px-6 py-3 text-red-700">Không thể tải thông tin thanh toán. Vui lòng đóng và mở lại để thử lại.</p> : null}
        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* 3 Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Tổng tiền phòng &amp; Dịch vụ
              </span>
              <div className="text-2xl font-black text-slate-900 tabular-nums">
                {formatVnd(folioTotal)}
              </div>
              <span className="text-xs text-slate-500 font-medium block">
                {effectiveFolioContext?.items?.length ?? 1} khoản phí phát sinh
              </span>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-1">
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block">
                Đã đặt cọc / Trả trước
              </span>
              <div className="text-2xl font-black text-emerald-700 tabular-nums">
                {formatVnd(paidDepositsSummary.total)}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs font-semibold text-emerald-900">
                <span className="bg-emerald-100/90 px-2 py-0.5 rounded text-emerald-800 whitespace-nowrap">
                  TM: {formatVnd(paidDepositsSummary.cash)}
                </span>
                <span className="bg-emerald-100/90 px-2 py-0.5 rounded text-emerald-800 whitespace-nowrap">
                  CK: {formatVnd(paidDepositsSummary.bankTransfer)}
                </span>
                {paidDepositsSummary.card > 0 ? (
                  <span className="bg-emerald-100/90 px-2 py-0.5 rounded text-emerald-800 whitespace-nowrap">
                    Thẻ: {formatVnd(paidDepositsSummary.card)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className={`rounded-2xl border p-4 space-y-1 ${
              remainingDue === 0
                ? "border-emerald-200 bg-emerald-50/40 text-emerald-950"
                : "border-amber-300 bg-amber-50/80 text-amber-950"
            }`}>
              <span className="text-xs font-bold uppercase tracking-wider block opacity-75">
                Còn nợ phải thu (Số dư)
              </span>
              <div className={`text-2xl font-black tabular-nums ${remainingDue === 0 ? "text-emerald-700" : "text-amber-800"}`}>
                {formatVnd(remainingDue)}
              </div>
              <span className="text-xs font-bold block">
                {remainingDue === 0 ? "✓ Đã thanh toán đủ 100%" : "⚠ Cần thu khách hoặc chuyển công nợ"}
              </span>
            </div>
          </div>

          {/* Bảng rà soát chi tiết bảng kê tiền phòng & dịch vụ */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <VsIcon name="receipt_long" className="text-base text-slate-600" />
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Rà soát bảng kê chi phí
                </span>
                {effectiveFolioContext?.folio?.folioNumber && (
                  <span className="rounded-md bg-slate-200/80 px-2 py-0.5 text-xs font-mono font-bold text-slate-700 whitespace-nowrap">
                    Folio: {effectiveFolioContext.folio.folioNumber}
                  </span>
                )}
              </div>
              {effectiveFolioContext?.summary?.discount ? (
                <span className="rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 text-xs font-bold text-rose-700 whitespace-nowrap">
                  Giảm trừ: -{formatVnd(effectiveFolioContext.summary.discount)}
                </span>
              ) : null}
            </div>

            <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
              {isFolioLoading ? (
                <div className="py-4 text-center text-xs text-slate-500 font-medium">
                  Đang tải chi tiết bảng kê chi phí...
                </div>
              ) : effectiveFolioContext?.items && effectiveFolioContext.items.length > 0 ? (
                effectiveFolioContext.items.map((item, idx) => (
                  <div key={item.id || idx} className="flex items-center justify-between px-4 py-2 text-xs">
                    <div className="min-w-0 pr-3">
                      <p className="font-semibold text-slate-800 truncate">{item.nameSnapshot || "Dịch vụ"}</p>
                      <p className="text-slate-400 text-xs">
                        Số lượng: {item.quantity} · Đơn giá: {formatVnd(item.unitPriceSnapshot)}
                      </p>
                    </div>
                    <div className="font-bold text-slate-900 tabular-nums shrink-0">
                      {formatVnd(item.totalSnapshot)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <div>
                    <p className="font-semibold text-slate-800">Tiền phòng lưu trú</p>
                    <p className="text-slate-400 text-xs">Giá niêm yết theo lượt đặt phòng</p>
                  </div>
                  <div className="font-bold text-slate-900 tabular-nums">
                    {formatVnd(folioTotal)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="border-b border-slate-200 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSettlementMode("PAYMENT")}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer ${
                  settlementMode === "PAYMENT"
                    ? "border-blue-700 text-blue-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <VsIcon name="payments" className="text-base" />
                <span>Phương án 1: Thu nốt tiền khách</span>
              </button>

              <button
                type="button"
                onClick={() => setSettlementMode("RECEIVABLE")}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer ${
                  settlementMode === "RECEIVABLE"
                    ? "border-amber-600 text-amber-800"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <VsIcon name="account_balance_wallet" className="text-base" />
                <span>Phương án 2: Chuyển sang công nợ (City Ledger)</span>
              </button>
            </div>
          </div>

          {/* Tab 1: Thu nốt tiền khách */}
          {settlementMode === "PAYMENT" ? (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-5">
              {remainingDue === 0 ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 flex items-center gap-2">
                  <VsIcon name="check_circle" className="text-lg text-emerald-600" />
                  <span>Khách đã thanh toán đủ 100% tiền cọc/trả trước. Không còn số dư nợ cần thu thêm.</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nguồn tiền thu <span className="text-rose-600">*</span>
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as "CASH" | "BANK_TRANSFER" | "CARD")}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-hidden"
                    >
                      <option value="BANK_TRANSFER">🏦 Chuyển khoản (CK)</option>
                      <option value="CASH">💵 Tiền mặt (TM)</option>
                      <option value="CARD">💳 Quẹt thẻ (POS)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Số tiền thực thu (VND) <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={paymentAmount ?? (remainingDue > 0 ? String(remainingDue) : "0")}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder={remainingDue > 0 ? String(remainingDue) : "0"}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Mã tham chiếu GD (CK / POS)
                    </label>
                    <input
                      type="text"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="Mã ngân hàng / bill POS"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-hidden"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Ghi chú thanh toán
                    </label>
                    <input
                      type="text"
                      value={paymentNote}
                      onChange={(e) => setPaymentNote(e.target.value)}
                      placeholder="VD: Khách thanh toán nốt bằng chuyển khoản"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-hidden"
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Tab 2: Chuyển sang công nợ */
            <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/40 p-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Đối tượng nợ <span className="text-rose-600">*</span>
                  </label>
                  <select
                    value={debtorType}
                    onChange={(e) => setDebtorType(e.target.value as "GUEST" | "PARTNER" | "COMPANY")}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-hidden"
                  >
                    <option value="GUEST">👤 Khách lẻ</option>
                    <option value="PARTNER">🏢 Đối tác / Đại lý / OTA</option>
                    <option value="COMPANY">🏬 Doanh nghiệp</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {debtorType === "PARTNER" ? "Tên đối tác / Đại lý *" : "Tên đối tượng nợ *"}
                  </label>
                  {debtorType === "PARTNER" ? (
                    <input
                      type="text"
                      value={partnerName}
                      onChange={(e) => setPartnerName(e.target.value)}
                      placeholder="VD: Agoda, Vietravel, Cty ABC..."
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-hidden"
                    />
                  ) : (
                    <input
                      type="text"
                      value={debtorName}
                      onChange={(e) => setDebtorName(e.target.value)}
                      placeholder="Tên khách hàng nợ"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-hidden"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nhân viên theo dõi công nợ
                  </label>
                  <select
                    value={assigneeStaff}
                    onChange={(event) => setAssigneeStaff(event.target.value)}
                    aria-label="Nhân viên theo dõi công nợ"
                    disabled={staffQuery.isLoading}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-hidden"
                  >
                    <option value="">Chưa phân công</option>
                    {staffOptions.map((assignment) => (
                      <option key={assignment.id} value={assignment.userId}>
                        {assignment.user?.fullName || assignment.userId}
                      </option>
                    ))}
                  </select>
                  {staffQuery.isError ? (
                    <p className="mt-1 text-xs text-amber-700" role="alert">
                      Không thể tải danh sách nhân viên. Có thể để trống để phân công sau.
                    </p>
                  ) : null}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Hạn thanh toán công nợ
                  </label>
                  <input
                    type="date"
                    value={receivableDueDate}
                    onChange={(e) => setReceivableDueDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-hidden"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Ghi chú / Cam kết thanh toán
                  </label>
                  <input
                    type="text"
                    value={receivableNotes}
                    onChange={(e) => setReceivableNotes(e.target.value)}
                    placeholder="VD: Hợp đồng số 12/2026, đối tác hẹn chuyển khoản ngày 05/11"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="border-t border-slate-200 px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4 bg-slate-50 shrink-0 flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={autoMarkReady}
              onChange={(e) => setAutoMarkReady(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Đánh dấu phòng sạch &amp; sẵn sàng đón khách mới ngay</span>
          </label>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs sm:text-sm font-bold text-slate-700 transition hover:bg-slate-100 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <span>Hủy bỏ</span>
            </button>

            {settlementMode === "PAYMENT" ? (
              <button
                type="button"
                disabled={isSubmitting || isFolioLoading || isFolioError || !effectiveFolioContext}
                onClick={() => void handleSettlePaymentAndCheckout()}
                className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-6 py-2 text-xs sm:text-sm font-bold text-white shadow-md transition active:scale-[0.98] cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <VsIcon name="done_all" className="text-base" />
                <span>{isSubmitting ? "Đang xử lý..." : remainingDue === 0 ? "Hoàn tất trả phòng" : "Xác nhận thu nốt & Trả phòng"}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isSubmitting || isFolioLoading || isFolioError || !effectiveFolioContext}
                onClick={() => void handleTransferToReceivableAndCheckout()}
                className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-amber-700 hover:bg-amber-800 px-6 py-2 text-xs sm:text-sm font-bold text-white shadow-md transition active:scale-[0.98] cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <VsIcon name="account_balance_wallet" className="text-base" />
                <span>{isSubmitting ? "Đang lưu..." : "Xác nhận chuyển công nợ & Trả phòng"}</span>
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
