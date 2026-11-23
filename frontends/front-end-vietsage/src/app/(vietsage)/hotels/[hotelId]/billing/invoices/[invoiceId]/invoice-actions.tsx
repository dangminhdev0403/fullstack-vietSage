"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { showErrorAlert, showSuccessAlert, showWarningAlert } from "@/libs/swal";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import { invalidateHotelRealtimeQueries } from "@/features/hotel-ops/utils/invalidate-hotel-realtime-queries";
import { formatMoney } from "@/features/billing/utils/money";
import { PaymentMethodSplitInput } from "@/features/billing/components/payment-method-split-input";
import {
  createPaymentSplitState,
  resolvePaymentSplit,
  type PaymentSplitState,
} from "@/features/billing/utils/payment-split";

type Props = {
  hotelId: string;
  invoiceId: string;
  isPaid: boolean;
  balanceAmount?: number;
  currency?: string;
  showPrint?: boolean;
};

export function InvoiceActions({
  hotelId,
  invoiceId,
  isPaid: initialIsPaid,
  balanceAmount = 0,
  currency = "VND",
  showPrint = true,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [paid, setPaid] = useState(initialIsPaid);
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [paymentSplit, setPaymentSplit] = useState<PaymentSplitState>(() =>
    createPaymentSplitState("CASH"),
  );
  const [note, setNote] = useState("");
  const attemptIdRef = useRef<string | null>(null);

  async function submitPayment() {
    if (saving) return;
    const due = Math.max(0, Number(balanceAmount) || 0);
    const splitCheck = due > 0 ? resolvePaymentSplit(paymentSplit, due, currency) : null;
    if (splitCheck && !splitCheck.ok) {
      await showWarningAlert("Kiểm tra phân bổ thanh toán", splitCheck.error);
      return;
    }

    setSaving(true);
    try {
      attemptIdRef.current ??= `inv-${invoiceId}-${crypto.randomUUID()}`;
      const body =
        due > 0 && splitCheck && splitCheck.ok
          ? {
              method: splitCheck.method === "OTHER" ? "MANUAL" : splitCheck.method,
              amount: due,
              ...(splitCheck.splits ? { splits: splitCheck.splits } : {}),
              note: note.trim() || "Thu tiền hóa đơn tại quầy",
              clientRequestId: attemptIdRef.current,
            }
          : {
              method: "MANUAL" as const,
              note: note.trim() || "Đóng hóa đơn không còn số dư",
              clientRequestId: attemptIdRef.current,
            };

      await requestInternalApiEnvelope(
        `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/billing/invoices/${encodeURIComponent(invoiceId)}/manual-payment`,
        { method: "POST", body },
      );
      attemptIdRef.current = null;
      setPaid(true);
      setIsModalOpen(false);
      await showSuccessAlert(
        "Trả phòng hoàn tất",
        splitCheck && splitCheck.ok
          ? `Đã thu ${formatMoney(due, currency)} (${splitCheck.summaryLabel}) và chuyển phòng sang chờ dọn.`
          : "Hóa đơn đã thanh toán và phòng đang chờ dọn.",
      );
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      router.refresh();
    } catch (error) {
      await showErrorAlert("Không thể xác nhận thanh toán", error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 print:hidden">
        {!paid ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => setIsModalOpen(true)}
            className="rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-bold text-white cursor-pointer disabled:opacity-50"
          >
            {saving ? "Đang xử lý..." : "Xác nhận đã thu tiền"}
          </button>
        ) : (
          <span className="rounded-xl bg-emerald-100 px-4 py-3 text-sm font-bold text-emerald-800 whitespace-nowrap">
            Đã thanh toán và trả phòng
          </span>
        )}
        {showPrint ? (
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl border border-[var(--outline-variant)] bg-white px-4 py-3 text-sm font-bold text-[var(--primary)] cursor-pointer"
          >
            In hóa đơn
          </button>
        ) : null}
      </div>

      {isModalOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-4 sm:p-6 print:hidden"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) setIsModalOpen(false);
          }}
        >
          <div className="my-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
              <div>
                <h2 className="text-lg font-black text-slate-900 text-balance">
                  Xác nhận đã thu tiền
                </h2>
                <p className="mt-0.5 text-xs font-medium text-slate-500 text-pretty">
                  Thao tác này sẽ đóng hóa đơn, hoàn tất trả phòng và chuyển phòng sang chờ dọn.
                </p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => setIsModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 cursor-pointer"
                aria-label="Đóng"
              >
                <VsIcon name="close" className="text-lg" />
              </button>
            </header>

            <div className="space-y-4 p-6">
              <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
                <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
                  Số tiền cần thu
                </span>
                <span className="text-xl font-black text-emerald-700 tabular-nums">
                  {formatMoney(Math.max(0, balanceAmount), currency)}
                </span>
              </div>

              {balanceAmount > 0 ? (
                <PaymentMethodSplitInput
                  label="Phương thức thanh toán"
                  required
                  value={paymentSplit}
                  onChange={(next) => {
                    attemptIdRef.current = null;
                    setPaymentSplit(next);
                  }}
                  totalAmount={balanceAmount}
                  allowedMethods={["CASH", "BANK_TRANSFER", "CARD"]}
                  currency={currency}
                  disabled={saving}
                  idPrefix="invoice-collect-payment"
                />
              ) : null}

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  Ghi chú thanh toán
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="VD: Thu tiền tại quầy lễ tân"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 focus:border-blue-700 focus:outline-hidden"
                />
              </div>
            </div>

            <footer className="flex items-center justify-end gap-2.5 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                disabled={saving}
                onClick={() => setIsModalOpen(false)}
                className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void submitPayment()}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-800 cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <VsIcon name="done_all" className="text-base" />
                <span>{saving ? "Đang xử lý..." : "Xác nhận đã thu đủ tiền"}</span>
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
