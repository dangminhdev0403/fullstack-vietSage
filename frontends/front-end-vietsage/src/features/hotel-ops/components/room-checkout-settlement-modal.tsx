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
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";

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

export function RoomCheckoutSettlementModal({
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

  // Form states for Payment
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "BANK_TRANSFER" | "CARD">("BANK_TRANSFER");
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");

  // Form states for Receivable
  const [debtorType, setDebtorType] = useState<"GUEST" | "PARTNER" | "COMPANY">("GUEST");
  const [debtorName, setDebtorName] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [assigneeStaff, setAssigneeStaff] = useState("");
  const [receivableDueDate, setReceivableDueDate] = useState("");
  const [receivableNotes, setReceivableNotes] = useState("");

  // Option to auto-mark room as clean/ready after checkout to immediately receive next guest
  const [autoMarkReady, setAutoMarkReady] = useState(true);

  // Auto-fetch folioContext if not passed in as prop (e.g. from Group Check-In Modal or deep links)
  const stayId = stay?.id || "";
  const { data: fetchedFolioContext, isLoading: isFolioLoading } = useQuery({
    ...staffRoomsResource.bind({ hotelId }).queries.stayFolio.options(stayId),
    enabled: Boolean(isOpen && Boolean(stayId) && !folioContext),
    staleTime: 5000,
  });
  const effectiveFolioContext = folioContext ?? fetchedFolioContext;

  // Query prior booking payments / deposits for this reservation or stay
  const { data: bookingPaymentsPage } = useQuery({
    ...staffRoomsResource.bind({ hotelId }).queries.bookingPayments.options({
      reservationId: stay.reservationId || undefined,
      stayId: stay.id,
    }),
    enabled: Boolean(isOpen && (stay.reservationId || stay.id)),
    staleTime: 5000,
  });

  const bookingPayments = bookingPaymentsPage?.items ?? [];

  // Calculate deposit summary breakdown
  const paidDepositsSummary = useMemo(() => {
    return bookingPayments.reduce(
      (acc, p) => {
        const val = Number((p as any).receivedAmount ?? (p as any).amount ?? 0);
        acc.total += val;
        const method = ((p as any).paymentMethod || "CASH").toUpperCase();
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

  // Initialize defaults on open
  useEffect(() => {
    if (!isOpen) return;
    setDebtorName(stay.guestDisplayName || "");
    setAssigneeStaff("");
    setPaymentReference("");
    setPaymentNote("");
    setReceivableNotes("");
    setPaymentAmount(remainingDue > 0 ? String(remainingDue) : "0");
    const today = new Date();
    today.setDate(today.getDate() + 7);
    setReceivableDueDate(today.toISOString().slice(0, 10));
  }, [isOpen, stay, remainingDue]);

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
    setIsSubmitting(true);
    try {
      const folioId = effectiveFolioContext?.folio?.id;
      const apiBase = `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/billing`;

      if (remainingDue > 0 && folioId) {
        // 1. Issue Invoice
        const invoiceRes = await requestInternalApiEnvelope<{ id: string; balanceAmount?: number }>(
          `${apiBase}/folios/${encodeURIComponent(folioId)}/invoice`,
          {
            method: "POST",
            body: {},
          },
        );
        const invoice = invoiceRes.data;

        // 2. Confirm Payment
        const numPay = Number(paymentAmount) || remainingDue;
        await requestInternalApiEnvelope(
          `${apiBase}/invoices/${encodeURIComponent(invoice.id)}/manual-payment`,
          {
            method: "POST",
            body: {
              method: paymentMethod,
              note: [
                paymentNote.trim(),
                paymentReference.trim() ? `Mã GD: ${paymentReference.trim()}` : "",
              ].filter(Boolean).join(" - ") || "Thanh toán trả phòng tại quầy",
              amount: numPay,
              cashReceived: numPay,
              clientRequestId: `checkout-${stay.id}-${Date.now()}`,
            },
          },
        );
      } else {
        // Zero balance checkout: If stay is active, check out stay directly
        if (!stay.status || stay.status === "ACTIVE" || stay.status === "CHECKED_IN") {
          try {
            await staffRoomsRepository.checkOutStay(hotelId, stay.id, {
              nextRoomStatus: "PROCESSING",
            });
          } catch {
            // Stay may have already been checked out in a prior session
          }
        }
        // If folio exists and is open, issue zero-balance invoice to close it
        if (folioId) {
          try {
            await requestInternalApiEnvelope(
              `${apiBase}/folios/${encodeURIComponent(folioId)}/invoice`,
              {
                method: "POST",
                body: {},
              },
            );
          } catch {
            // Non-fatal if already invoiced or closed
          }
        }
      }

      if (autoMarkReady) {
        try {
          await requestInternalApiEnvelope(
            `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/rooms/${encodeURIComponent(room.id)}/ready`,
            {
              method: "PATCH",
              body: { expectedUpdatedAt: room.updatedAt },
            },
          );
        } catch {
          // Non-fatal, status may already be updated or handled
        }
      }

      await showSuccessAlert(
        "Trả phòng thành công",
        autoMarkReady
          ? `Đã hoàn tất thanh toán và chuyển phòng ${room.roomNumber} sang trạng thái SẴN SÀNG đón khách mới.`
          : `Đã hoàn tất thanh toán và chuyển phòng ${room.roomNumber} sang trạng thái chờ dọn.`,
      );

      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      if (onCheckoutSuccess) {
        await onCheckoutSuccess();
      }
      onClose();
    } catch (err) {
      await showErrorAlert(
        "Không thể hoàn tất trả phòng",
        err instanceof Error ? err.message : "Đã có lỗi xảy ra khi xử lý thanh toán và trả phòng.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  // Handler for Option 2: Chuyển sang công nợ & Trả phòng
  async function handleTransferToReceivableAndCheckout() {
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

    setIsSubmitting(true);
    try {
      await staffRoomsRepository.transferStayToReceivable(hotelId, stay.id, {
        debtorName: finalDebtorName,
        debtorType: debtorType,
        assigneeUserId: assigneeStaff.trim() || undefined,
        amount: remainingDue,
        dueDate: receivableDueDate ? new Date(receivableDueDate).toISOString() : undefined,
        notes: [
          debtorType === "PARTNER" && partnerName ? `Đối tác/Đại lý: ${partnerName.trim()}` : "",
          assigneeStaff ? `Nhân viên theo dõi đòi tiền: ${assigneeStaff.trim()}` : "",
          receivableNotes.trim(),
        ].filter(Boolean).join(" - ") || undefined,
      });

      if (autoMarkReady) {
        try {
          await requestInternalApiEnvelope(
            `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/rooms/${encodeURIComponent(room.id)}/ready`,
            {
              method: "PATCH",
              body: { expectedUpdatedAt: room.updatedAt },
            },
          );
        } catch {
          // Non-fatal
        }
      }

      await showSuccessAlert(
        "Đã chuyển công nợ thành công",
        autoMarkReady
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
        err instanceof Error ? err.message : "Đã có lỗi xảy ra khi chuyển công nợ.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
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
                      <p className="font-semibold text-slate-800 truncate">{item.name}</p>
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
                      min={0}
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
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
                    Nhân viên theo dõi đòi tiền <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={assigneeStaff}
                    onChange={(e) => setAssigneeStaff(e.target.value)}
                    placeholder="VD: Lễ tân Linh, Sale Hùng..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-hidden"
                  />
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
        <footer className="border-t border-slate-200 px-6 py-4 bg-slate-50 shrink-0 flex flex-wrap items-center justify-between gap-3">
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
                disabled={isSubmitting}
                onClick={() => void handleSettlePaymentAndCheckout()}
                className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-6 py-2 text-xs sm:text-sm font-bold text-white shadow-md transition active:scale-[0.98] cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <VsIcon name="done_all" className="text-base" />
                <span>{isSubmitting ? "Đang xử lý..." : remainingDue === 0 ? "Hoàn tất trả phòng" : "Xác nhận thu nốt & Trả phòng"}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isSubmitting}
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
