"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Temporal } from "@js-temporal/polyfill";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { staffRoomsRepository, type ReceivableItem } from "@/features/hotel-ops/repositories/staff-rooms-repository";
import { useBillingReceivables } from "@/features/billing/hooks/use-billing-receivables";
import { formatDateTime, formatMoney } from "@/features/billing/utils/money";
import { invalidateHotelRealtimeQueries } from "@/features/hotel-ops/utils/invalidate-hotel-realtime-queries";
import { PaymentMethodSplitInput } from "@/features/billing/components/payment-method-split-input";
import {
  createPaymentSplitState,
  resolvePaymentSplit,
  type PaymentSplitState,
} from "@/features/billing/utils/payment-split";
import { generateReceivableCollectionIdempotencyKey } from "@/features/billing/utils/idempotency";
import { showErrorAlert, showSuccessAlert, showWarningAlert } from "@/libs/swal";

type BillingReceivablesTableClientProps = {
  hotelId: string;
};

const statusLabels: Record<string, { label: string; tone: string }> = {
  OPEN: { label: "Đang nợ", tone: "bg-amber-50 text-amber-800 border-amber-200" },
  PARTIALLY_COLLECTED: { label: "Thu một phần", tone: "bg-blue-50 text-blue-800 border-blue-200" },
  PARTIALLY_PAID: { label: "Thu một phần", tone: "bg-blue-50 text-blue-800 border-blue-200" },
  SETTLED: { label: "Đã tất toán", tone: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  WRITTEN_OFF: { label: "Đã xóa sổ", tone: "bg-slate-100 text-slate-600 border-slate-200" },
};

const debtorTypeLabels: Record<string, string> = {
  GUEST: "👤 Khách lẻ",
  INDIVIDUAL: "👤 Khách lẻ",
  PARTNER: "🏢 Đối tác / Đại lý",
  AGENT: "🏢 Đối tác / Đại lý",
  COMPANY: "🏬 Doanh nghiệp",
  GROUP: "👥 Đoàn khách",
};

export function BillingReceivablesTableClient({ hotelId }: BillingReceivablesTableClientProps) {
  const queryClient = useQueryClient();
  const [nowTimestamp] = useState(() => Date.now());
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [debtorTypeFilter, setDebtorTypeFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [collectingReceivable, setCollectingReceivable] = useState<ReceivableItem | null>(null);

  // Query receivables list via feature hook
  const { receivablesPage, isLoading, refetch } = useBillingReceivables({
    hotelId,
    query: {
      status: statusFilter !== "ALL" ? statusFilter : undefined,
      debtorType: debtorTypeFilter !== "ALL" ? debtorTypeFilter : undefined,
      q: query.trim() || undefined,
    },
  });

  const receivables: ReceivableItem[] = receivablesPage?.items ?? [];

  // Filtered receivables for client-side search
  const filteredReceivables = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return receivables;
    return receivables.filter((rec) => {
      const matchText = [
        rec.debtorName,
        rec.debtorType,
        rec.assigneeUserId,
        rec.contactPhone,
        rec.notes,
        rec.id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchText.includes(q);
    });
  }, [receivables, query]);

  // Overall financial totals
  const totals = useMemo(() => {
    return receivables.reduce(
      (acc, rec) => {
        const orig = Number(rec.originalAmount ?? rec.amount ?? 0);
        const paid = Number(rec.paidAmount ?? 0);
        const out = Number(rec.outstandingAmount ?? rec.balanceAmount ?? (orig - paid));
        acc.original += orig;
        acc.paid += paid;
        acc.outstanding += out;
        if (rec.status === "OPEN" || rec.status === "PARTIALLY_COLLECTED" || rec.status === "PARTIALLY_PAID") {
          acc.openCount += 1;
        }
        return acc;
      },
      { original: 0, paid: 0, outstanding: 0, openCount: 0 },
    );
  }, [receivables]);

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Tổng công nợ gốc</span>
            <VsIcon name="account_balance_wallet" className="text-lg text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900 tabular-nums">
            {formatMoney(totals.original, "VND")}
          </div>
          <span className="mt-1 text-xs text-slate-500 font-medium block">
            Từ các lượt khách &amp; đối tác
          </span>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-800 uppercase tracking-wider">
            <span>Đã thu hồi nợ</span>
            <VsIcon name="payments" className="text-lg text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-700 tabular-nums">
            {formatMoney(totals.paid, "VND")}
          </div>
          <span className="mt-1 text-xs text-emerald-700 font-medium block">
            Kế toán đã ghi nhận thu
          </span>
        </div>

        <div className="rounded-2xl border border-amber-300 bg-amber-50/70 p-4.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-amber-900 uppercase tracking-wider">
            <span>Còn phải thu (Dư nợ)</span>
            <VsIcon name="pending_actions" className="text-lg text-amber-700" />
          </div>
          <div className="mt-2 text-2xl font-black text-amber-800 tabular-nums">
            {formatMoney(totals.outstanding, "VND")}
          </div>
          <span className="mt-1 text-xs text-amber-800 font-semibold block">
            {totals.openCount} khoản đang theo dõi thu hồi
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Khoản nợ đang mở</span>
            <VsIcon name="assignment" className="text-lg text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900 tabular-nums">
            {totals.openCount} khoản
          </div>
          <span className="mt-1 text-xs text-slate-500 font-medium block">
            Chưa tất toán công nợ
          </span>
        </div>
      </div>

      {/* Main Ledger Section */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        {/* Controls Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/60 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm khách, đối tác, nhân viên đòi nợ..."
                className="w-64 sm:w-72 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:border-blue-600 focus:outline-hidden"
              />
            </div>

            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-hidden cursor-pointer"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="OPEN">Chưa tất toán</option>
                <option value="PARTIALLY_COLLECTED">Thu một phần</option>
                <option value="SETTLED">Đã tất toán</option>
              </select>
            </div>

            <div>
              <select
                value={debtorTypeFilter}
                onChange={(e) => setDebtorTypeFilter(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-hidden cursor-pointer"
              >
                <option value="ALL">Tất cả đối tượng</option>
                <option value="GUEST">Khách lẻ</option>
                <option value="PARTNER">Đối tác / Đại lý</option>
                <option value="COMPANY">Doanh nghiệp</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 transition cursor-pointer"
            >
              <VsIcon name="refresh" className="text-sm" />
              <span>Làm mới</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-bold tracking-wider">
              <tr>
                <th className="px-5 py-3.5 whitespace-nowrap">Đối tượng nợ</th>
                <th className="px-4 py-3.5 whitespace-nowrap">Đặt phòng &amp; Phòng</th>
                <th className="px-4 py-3.5 whitespace-nowrap">Lưu trú</th>
                <th className="px-4 py-3.5 whitespace-nowrap text-right">Nợ gốc</th>
                <th className="px-4 py-3.5 whitespace-nowrap text-right">Còn phải thu</th>
                <th className="px-4 py-3.5 whitespace-nowrap text-center">Trạng thái</th>
                <th className="px-5 py-3.5 whitespace-nowrap text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredReceivables.map((rec) => {
                const orig = Number(rec.originalAmount ?? rec.amount ?? 0);
                const paid = Number(rec.paidAmount ?? 0);
                const out = Number(rec.outstandingAmount ?? rec.balanceAmount ?? (orig - paid));
                const statusInfo = statusLabels[rec.status] || { label: rec.status, tone: "bg-slate-100 text-slate-700 border-slate-200" };
                const checkInStr = rec.stayDates?.checkIn ? rec.stayDates.checkIn.slice(0, 10) : "";
                const checkOutStr = rec.stayDates?.checkOut ? rec.stayDates.checkOut.slice(0, 10) : "";
                const collectionsCount = rec.collections?.length ?? 0;

                return (
                  <tr key={rec.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Debtor Name & Partner */}
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-slate-900 text-sm text-balance">
                        {rec.debtorName}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 whitespace-nowrap">
                          {debtorTypeLabels[rec.debtorType || "GUEST"] || rec.debtorType}
                        </span>
                        {rec.debtorPartnerName ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-semibold text-blue-800 whitespace-nowrap">
                            <VsIcon name="corporate_fare" className="text-xs" />
                            <span>{rec.debtorPartnerName}</span>
                          </span>
                        ) : null}
                      </div>
                    </td>

                    {/* Booking Code & Room */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        {rec.bookingCode ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-xs font-bold text-indigo-700 whitespace-nowrap">
                            <VsIcon name="confirmation_number" className="text-xs" />
                            <span>{rec.bookingCode}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">-</span>
                        )}
                        {rec.roomNumber ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
                            <VsIcon name="meeting_room" className="text-xs text-slate-400" />
                            <span>Phòng {rec.roomNumber}</span>
                          </span>
                        ) : null}
                      </div>
                    </td>

                    {/* Stay Dates */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {checkInStr || checkOutStr ? (
                        <div className="text-xs text-slate-600 font-medium">
                          <div>{checkInStr || "..."}</div>
                          <div className="text-slate-400">đến {checkOutStr || "..."}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium">-</span>
                      )}
                    </td>

                    {/* Original Amount */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-right font-medium text-slate-600 tabular-nums">
                      {formatMoney(orig, "VND")}
                    </td>

                    {/* Outstanding Amount */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-right font-black text-rose-700 tabular-nums text-sm">
                      {formatMoney(out, "VND")}
                    </td>

                    {/* Status Badge & History count */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${statusInfo.tone}`}>
                          {statusInfo.label}
                        </span>
                        {collectionsCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 whitespace-nowrap">
                            <VsIcon name="history" className="text-xs" />
                            <span>Đã thu {collectionsCount} đợt</span>
                          </span>
                        ) : null}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5 whitespace-nowrap text-right">
                      {rec.status !== "SETTLED" && out > 0 ? (
                        <button
                          type="button"
                          onClick={() => setCollectingReceivable(rec)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white px-3.5 py-1.5 text-xs font-bold transition shadow-2xs cursor-pointer whitespace-nowrap"
                        >
                          <VsIcon name="add_card" className="text-sm" />
                          <span>Thu nợ</span>
                        </button>
                      ) : (
                        <span className="text-xs font-bold text-emerald-700">Đã xong</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredReceivables.length === 0 && (
            <div className="p-12 text-center text-xs text-slate-500 space-y-2">
              <VsIcon name="search_off" className="text-3xl text-slate-300" />
              <div className="font-semibold text-slate-600">Không tìm thấy khoản công nợ nào phù hợp.</div>
            </div>
          )}
        </div>
      </section>

      {/* Accountant Collect Receivable Modal */}
      {collectingReceivable && (
        <CollectReceivableModal
          hotelId={hotelId}
          receivable={collectingReceivable}
          onClose={() => setCollectingReceivable(null)}
          onSuccess={async () => {
            setCollectingReceivable(null);
            await refetch();
            await invalidateHotelRealtimeQueries(queryClient, hotelId);
          }}
        />
      )}
    </div>
  );
}

// Centered Horizontal Box Ngang Modal for Accountant Debt Collection
function CollectReceivableModal({
  hotelId,
  receivable,
  onClose,
  onSuccess,
}: {
  hotelId: string;
  receivable: ReceivableItem;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const orig = Number(receivable.originalAmount ?? receivable.amount ?? 0);
  const paid = Number(receivable.paidAmount ?? 0);
  const outstanding = Number(receivable.outstandingAmount ?? receivable.balanceAmount ?? (orig - paid));

  const todayStr = useMemo(() => {
    try {
      return Temporal.Now.plainDateISO("Asia/Ho_Chi_Minh").toString();
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }, []);

  const [collectedAmount, setCollectedAmount] = useState<string>(String(outstanding));
  const [collectionDate, setCollectionDate] = useState<string>(todayStr);
  const [destinationAccount, setDestinationAccount] = useState<string>("");
  const [isUnknownAccount, setIsUnknownAccount] = useState<boolean>(false);
  const [splitCashAccount, setSplitCashAccount] = useState<string>("Két tiền mặt lễ tân");
  const [splitCashUnknown, setSplitCashUnknown] = useState<boolean>(false);
  const [splitBankAccount, setSplitBankAccount] = useState<string>("");
  const [splitBankUnknown, setSplitBankUnknown] = useState<boolean>(false);
  const [paymentSplit, setPaymentSplit] = useState<PaymentSplitState>(() =>
    createPaymentSplitState("BANK_TRANSFER"),
  );
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [idempotencySalt, setIdempotencySalt] = useState<string>("");
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const num = Number(collectedAmount) || 0;
  const splitCheck = resolvePaymentSplit(paymentSplit, num, "VND");

  // Stable per-operation idempotency key directly tied to actual payload and dates
  const idempotencyKey = useMemo(() => {
    const effectiveMethod = splitCheck.ok
      ? splitCheck.isMixed
        ? "MIXED"
        : splitCheck.method
      : "MANUAL";
    const effectiveAccount = isUnknownAccount ? null : destinationAccount.trim() || null;
    const effectiveSplits =
      splitCheck.ok && splitCheck.splits
        ? splitCheck.splits.map((s) => ({
            method: s.method,
            amount: s.amount,
            receivingAccount:
              s.method === "CASH"
                ? splitCashUnknown
                  ? null
                  : splitCashAccount.trim() || null
                : splitBankUnknown
                  ? null
                  : splitBankAccount.trim() || null,
          }))
        : null;

    return generateReceivableCollectionIdempotencyKey({
      receivableId: receivable.id,
      amount: num,
      collectedAtDate: collectionDate,
      method: effectiveMethod,
      destinationAccount: effectiveAccount,
      splits: effectiveSplits,
      salt: idempotencySalt || undefined,
    });
  }, [
    receivable.id,
    num,
    collectionDate,
    splitCheck,
    destinationAccount,
    isUnknownAccount,
    splitCashAccount,
    splitCashUnknown,
    splitBankAccount,
    splitBankUnknown,
    idempotencySalt,
  ]);

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setSubmissionError(null);

    if (!num || num <= 0) {
      await showWarningAlert("Thiếu số tiền", "Vui lòng nhập số tiền thu nợ hợp lệ lớn hơn 0.");
      return;
    }
    if (num > outstanding) {
      await showWarningAlert("Số tiền vượt quá", "Số tiền thu không được lớn hơn số tiền nợ còn lại.");
      return;
    }
    if (!collectionDate || !/^\d{4}-\d{2}-\d{2}$/.test(collectionDate)) {
      await showWarningAlert("Ngày thu nợ chưa hợp lệ", "Vui lòng chọn ngày thu tiền hợp lệ định dạng YYYY-MM-DD.");
      return;
    }
    if (!splitCheck.ok) {
      await showWarningAlert("Kiểm tra phân bổ thanh toán", splitCheck.error);
      return;
    }

    // Require either explicit account, or explicit unknown checkbox if bank transfer is selected
    if (splitCheck.method === "BANK_TRANSFER" && !splitCheck.isMixed && !isUnknownAccount && !destinationAccount.trim()) {
      await showWarningAlert(
        "Chưa chọn tài khoản nhận",
        "Vui lòng nhập tài khoản ngân hàng nhận tiền hoặc chọn 'Chưa xác định tài khoản' để đối soát sau.",
      );
      return;
    }

    if (splitCheck.isMixed && !splitBankUnknown && !splitBankAccount.trim()) {
      await showWarningAlert(
        "Chưa chọn tài khoản ngân hàng",
        "Thanh toán kết hợp có phần Chuyển khoản. Vui lòng nhập tài khoản nhận tiền hoặc chọn 'Chưa xác định tài khoản ngân hàng'.",
      );
      return;
    }

    const effectiveDestinationAccount = isUnknownAccount
      ? undefined
      : destinationAccount.trim() || undefined;

    const resolvedSplits = splitCheck.isMixed && splitCheck.splits
      ? splitCheck.splits.map((s) => {
          const legAccount =
            s.method === "CASH"
              ? splitCashUnknown
                ? undefined
                : splitCashAccount.trim() || undefined
              : splitBankUnknown
                ? undefined
                : splitBankAccount.trim() || undefined;
          return {
            method: s.method,
            amount: s.amount,
            ...(legAccount ? { destinationAccount: legAccount } : {}),
          };
        })
      : undefined;

    setIsSubmitting(true);
    try {
      await staffRoomsRepository.collectReceivable(hotelId, receivable.id, {
        amount: num,
        collectedAmount: num,
        collectedAt: `${collectionDate}T12:00:00+07:00`,
        paymentMethod: splitCheck.method === "OTHER" ? "MANUAL" : splitCheck.method,
        ...(resolvedSplits && resolvedSplits.length > 1
          ? { splits: resolvedSplits }
          : {
              ...(effectiveDestinationAccount ? { destinationAccount: effectiveDestinationAccount } : {}),
              ...(resolvedSplits ? { splits: resolvedSplits } : {}),
            }),
        idempotencyKey,
        notes: notes.trim() || undefined,
      });

      const accountLabel = isUnknownAccount
        ? "Chưa xác định tài khoản (Chờ đối soát)"
        : effectiveDestinationAccount || "Quỹ tiền mặt / Mặc định";

      await showSuccessAlert(
        "Thu công nợ thành công",
        `Đã ghi nhận thu ${formatMoney(num, "VND")} (${splitCheck.summaryLabel}) ngày ${collectionDate} vào ${accountLabel} từ ${receivable.debtorName}.`,
      );
      await onSuccess();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Đã có lỗi xảy ra khi ghi nhận thu nợ.";
      setSubmissionError(errMsg);
      await showErrorAlert("Không thể thu công nợ", errMsg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="my-auto flex flex-col w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 text-slate-900 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50 shrink-0">
          <div>
            <h3 className="text-lg font-black tracking-tight text-slate-900 text-balance">
              Thu tiền công nợ · {receivable.debtorName}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 font-medium text-pretty">
              Kế toán ghi nhận thu tiền công nợ vào phần mềm và đối soát nguồn tiền
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition cursor-pointer"
          >
            <VsIcon name="close" className="text-lg" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Debt Summary Pill */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <span className="text-slate-600 font-medium">Đối tượng nợ: </span>
              <strong className="text-slate-900">{receivable.debtorName}</strong>
            </div>
            <div className="text-right">
              <span className="text-slate-600 block">Số tiền nợ còn lại:</span>
              <strong className="text-base font-black text-rose-700 tabular-nums">
                {formatMoney(outstanding, "VND")}
              </strong>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Amount input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Số tiền thu đợt này (VND) <span className="text-rose-600">*</span>
              </label>
              <input
                type="number"
                required
                min={1}
                max={outstanding}
                value={collectedAmount}
                onChange={(e) => setCollectedAmount(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 focus:border-blue-700 focus:outline-hidden"
              />
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCollectedAmount(String(outstanding))}
                  className="text-xs text-blue-700 hover:underline font-bold cursor-pointer"
                >
                  Thu toàn bộ ({formatMoney(outstanding, "VND")})
                </button>
              </div>
            </div>

            {/* Collection Date input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Ngày tiền về / Đối soát <span className="text-rose-600">*</span>
              </label>
              <input
                type="date"
                required
                value={collectionDate}
                onChange={(e) => setCollectionDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 focus:border-blue-700 focus:outline-hidden"
              />
              <p className="mt-1 text-xs text-slate-400 font-medium">
                Khớp với ngày tiền thực tế vào tài khoản / két
              </p>
            </div>

            {/* Payment Method Split Input */}
            <div className="sm:col-span-2">
              <PaymentMethodSplitInput
                label="Nguồn tiền thu"
                required
                value={paymentSplit}
                onChange={setPaymentSplit}
                totalAmount={num}
                allowedMethods={["CASH", "BANK_TRANSFER", "CARD"]}
                disabled={isSubmitting}
                idPrefix="collect-receivable-payment"
              />
            </div>

            {/* Account receiving section: Single method vs Mixed legs */}
            {!(splitCheck.ok && splitCheck.isMixed) ? (
              <div className="sm:col-span-2 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">
                    Tài khoản / Nơi nhận tiền
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isUnknownAccount}
                      onChange={(e) => {
                        setIsUnknownAccount(e.target.checked);
                        if (e.target.checked) setDestinationAccount("");
                      }}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-800"
                    />
                    <span>Chưa xác định tài khoản (Chờ đối soát)</span>
                  </label>
                </div>

                {!isUnknownAccount ? (
                  <>
                    <input
                      type="text"
                      value={destinationAccount}
                      onChange={(e) => setDestinationAccount(e.target.value)}
                      placeholder={
                        paymentSplit.mode === "CASH"
                          ? "VD: Két tiền mặt lễ tân, Quỹ tiền mặt ca 1..."
                          : "VD: Vietcombank - 1012345678, Techcombank, ACB..."
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 focus:border-blue-700 focus:outline-hidden"
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-slate-400 font-medium">Gợi ý nhanh:</span>
                      {(paymentSplit.mode === "CASH"
                        ? ["Két tiền mặt lễ tân", "Quỹ tiền mặt quản lý"]
                        : ["Vietcombank", "Techcombank", "ACB", "BIDV"]
                      ).map((acc) => (
                        <button
                          key={acc}
                          type="button"
                          onClick={() => setDestinationAccount(acc)}
                          className={`rounded-md border px-2 py-0.5 text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                            destinationAccount === acc
                              ? "bg-blue-50 border-blue-300 text-blue-800"
                              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          {acc}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-2.5 text-xs text-amber-800 flex items-center gap-2">
                    <VsIcon name="info" className="text-sm shrink-0 text-amber-600" />
                    <span>Khoản thu sẽ được ghi nhận với trạng thái tài khoản &ldquo;Chưa xác định&rdquo; để kế toán phân loại sau.</span>
                  </div>
                )}
              </div>
            ) : (
              /* Mixed Payment: Specific accounts per leg */
              <div className="sm:col-span-2 space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                <div className="text-xs font-bold text-slate-800">
                  Tài khoản nhận theo từng phương thức kết hợp
                </div>

                {/* Cash leg */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">1. Phần Tiền mặt</span>
                    <label className="inline-flex items-center gap-1 text-slate-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={splitCashUnknown}
                        onChange={(e) => {
                          setSplitCashUnknown(e.target.checked);
                          if (e.target.checked) setSplitCashAccount("");
                        }}
                        className="h-3 w-3 rounded border-slate-300 text-blue-800"
                      />
                      <span>Chưa xác định két</span>
                    </label>
                  </div>
                  {!splitCashUnknown && (
                    <input
                      type="text"
                      value={splitCashAccount}
                      onChange={(e) => setSplitCashAccount(e.target.value)}
                      placeholder="VD: Két tiền mặt lễ tân"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900"
                    />
                  )}
                </div>

                {/* Bank leg */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">2. Phần Chuyển khoản</span>
                    <label className="inline-flex items-center gap-1 text-slate-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={splitBankUnknown}
                        onChange={(e) => {
                          setSplitBankUnknown(e.target.checked);
                          if (e.target.checked) setSplitBankAccount("");
                        }}
                        className="h-3 w-3 rounded border-slate-300 text-blue-800"
                      />
                      <span>Chưa xác định tài khoản ngân hàng</span>
                    </label>
                  </div>
                  {!splitBankUnknown && (
                    <>
                      <input
                        type="text"
                        value={splitBankAccount}
                        onChange={(e) => setSplitBankAccount(e.target.value)}
                        placeholder="VD: Vietcombank, Techcombank..."
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900"
                      />
                      <div className="flex flex-wrap items-center gap-1">
                        {["Vietcombank", "Techcombank", "ACB"].map((acc) => (
                          <button
                            key={acc}
                            type="button"
                            onClick={() => setSplitBankAccount(acc)}
                            className={`rounded border px-1.5 py-0.5 text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                              splitBankAccount === acc
                                ? "bg-blue-50 border-blue-300 text-blue-800"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                            }`}
                          >
                            {acc}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Ghi chú thu nợ
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="VD: Đối tác chuyển khoản đợt 1, thanh toán qua Agoda"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 focus:border-blue-700 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Idempotency Key Indicator */}
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-1.5 truncate">
              <VsIcon name="lock" className="text-sm shrink-0 text-slate-400" />
              <span className="font-medium text-slate-600">Khóa chống trùng:</span>
              <code className="font-mono text-slate-700 truncate">{idempotencyKey}</code>
            </div>
            <button
              type="button"
              onClick={() => setIdempotencySalt(Math.random().toString(36).slice(2, 7))}
              title="Tạo mã muối mới cho giao dịch độc lập"
              className="text-blue-700 hover:underline font-bold whitespace-nowrap ml-2 cursor-pointer"
            >
              Làm mới
            </button>
          </div>

          {/* Error / Retry Controls Banner */}
          {submissionError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <VsIcon name="error" className="text-base text-rose-600 shrink-0" />
                <span>Không thể hoàn tất thu nợ: {submissionError}</span>
              </div>
              <p className="text-slate-600 text-pretty">
                Giao dịch chưa được ghi nhận hoặc gặp sự cố mạng. Bạn có thể thử lại an toàn với cùng khóa chống trùng lặp để tránh trùng phiếu, hoặc tạo mã mới.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={isSubmitting}
                  className="rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-bold px-3 py-1.5 text-xs cursor-pointer disabled:opacity-50"
                >
                  Thử lại với cùng khóa chống trùng
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIdempotencySalt(Math.random().toString(36).slice(2, 7));
                    setSubmissionError(null);
                  }}
                  className="rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold px-3 py-1.5 text-xs cursor-pointer"
                >
                  Tạo mã giao dịch mới
                </button>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="inline-flex min-h-[38px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 cursor-pointer disabled:opacity-50"
            >
              <span>Hủy</span>
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl bg-blue-900 hover:bg-blue-800 px-5 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <VsIcon name="check" className="text-sm" />
              <span>{isSubmitting ? "Đang xử lý..." : "Xác nhận thu nợ"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
