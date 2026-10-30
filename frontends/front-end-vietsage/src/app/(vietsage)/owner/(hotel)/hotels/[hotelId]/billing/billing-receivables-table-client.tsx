"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { staffRoomsRepository, type ReceivableItem } from "@/features/hotel-ops/repositories/staff-rooms-repository";
import { staffRoomsResource } from "@/features/hotel-ops/resources/staff-rooms-resource";
import { formatDateTime, formatMoney } from "@/features/billing/utils/money";
import { invalidateHotelRealtimeQueries } from "@/features/hotel-ops/utils/invalidate-hotel-realtime-queries";
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

  // Query receivables list
  const { data: receivablesPage, isLoading, refetch } = useQuery({
    ...staffRoomsResource.bind({ hotelId }).queries.receivables.options({
      status: statusFilter !== "ALL" ? statusFilter : undefined,
      debtorType: debtorTypeFilter !== "ALL" ? debtorTypeFilter : undefined,
      q: query.trim() || undefined,
    }),
    staleTime: 10_000,
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
                <option value="OPEN">Đang nợ (OPEN)</option>
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
                <th className="px-4 py-3.5 whitespace-nowrap">Phân loại</th>
                <th className="px-4 py-3.5 whitespace-nowrap">NV theo dõi đòi tiền</th>
                <th className="px-4 py-3.5 whitespace-nowrap text-right">Nợ gốc</th>
                <th className="px-4 py-3.5 whitespace-nowrap text-right">Đã thu</th>
                <th className="px-4 py-3.5 whitespace-nowrap text-right">Còn phải thu</th>
                <th className="px-4 py-3.5 whitespace-nowrap">Hạn thanh toán</th>
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
                const isOverdue = rec.dueDate && new Date(rec.dueDate).getTime() < nowTimestamp && out > 0;

                return (
                  <tr key={rec.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Debtor Name & Notes */}
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-slate-900 text-sm">
                        {rec.debtorName}
                      </div>
                      {rec.notes ? (
                        <div className="text-slate-500 text-xs font-medium mt-0.5 line-clamp-1 max-w-xs">
                          {rec.notes}
                        </div>
                      ) : null}
                    </td>

                    {/* Debtor Type */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {debtorTypeLabels[rec.debtorType || "GUEST"] || rec.debtorType}
                      </span>
                    </td>

                    {/* Assignee Staff */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {rec.assigneeUserId ? (
                        <span className="font-semibold text-slate-800 inline-flex items-center gap-1">
                          <VsIcon name="person" className="text-sm text-slate-400" />
                          <span>{rec.assigneeUserId}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 font-medium">—</span>
                      )}
                    </td>

                    {/* Original Amount */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-right font-medium text-slate-600 tabular-nums">
                      {formatMoney(orig, "VND")}
                    </td>

                    {/* Paid Amount */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-right font-semibold text-emerald-700 tabular-nums">
                      {formatMoney(paid, "VND")}
                    </td>

                    {/* Outstanding Amount */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-right font-black text-rose-700 tabular-nums text-sm">
                      {formatMoney(out, "VND")}
                    </td>

                    {/* Due Date */}
                    <td className="px-4 py-3.5 whitespace-nowrap font-medium">
                      {rec.dueDate ? (
                        <span className={isOverdue ? "text-rose-600 font-bold" : "text-slate-600"}>
                          {formatDateTime(rec.dueDate)}
                          {isOverdue ? " (Quá hạn)" : ""}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-bold ${statusInfo.tone}`}>
                        {statusInfo.label}
                      </span>
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

  const [collectedAmount, setCollectedAmount] = useState<string>(String(outstanding));
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "BANK_TRANSFER" | "CARD">("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const num = Number(collectedAmount);
    if (!num || num <= 0) {
      await showWarningAlert("Thiếu số tiền", "Vui lòng nhập số tiền thu nợ hợp lệ lớn hơn 0.");
      return;
    }
    if (num > outstanding) {
      await showWarningAlert("Số tiền vượt quá", "Số tiền thu không được lớn hơn số tiền nợ còn lại.");
      return;
    }

    setIsSubmitting(true);
    try {
      await staffRoomsRepository.collectReceivable(hotelId, receivable.id, {
        amount: num,
        collectedAmount: num,
        paymentMethod,
        referenceCode: reference.trim() || undefined,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      await showSuccessAlert(
        "Thu công nợ thành công",
        `Đã ghi nhận thu ${formatMoney(num, "VND")} từ đối tượng ${receivable.debtorName}.`,
      );
      await onSuccess();
    } catch (err) {
      await showErrorAlert(
        "Không thể thu công nợ",
        err instanceof Error ? err.message : "Đã có lỗi xảy ra khi ghi nhận thu nợ.",
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
    >
      <div className="my-auto flex flex-col w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 text-slate-900 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50 shrink-0">
          <div>
            <h3 className="text-lg font-black tracking-tight text-slate-900">
              Thu tiền công nợ · {receivable.debtorName}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 font-medium">
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
              <span className="text-slate-600 font-medium">Đối tượng: </span>
              <strong className="text-slate-900">{receivable.debtorName}</strong>
              {receivable.assigneeUserId ? (
                <span className="text-slate-500 block mt-0.5">
                  Nhân viên phụ trách: <strong>{receivable.assigneeUserId}</strong>
                </span>
              ) : null}
            </div>
            <div className="text-right">
              <span className="text-slate-600 block">Số tiền nợ còn lại:</span>
              <strong className="text-base font-black text-rose-700 tabular-nums">
                {formatMoney(outstanding, "VND")}
              </strong>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  className="text-xs text-blue-700 hover:underline font-bold"
                >
                  Thu toàn bộ ({formatMoney(outstanding, "VND")})
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Nguồn tiền thu <span className="text-rose-600">*</span>
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as "CASH" | "BANK_TRANSFER" | "CARD")}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 focus:border-blue-700 focus:outline-hidden"
              >
                <option value="BANK_TRANSFER">🏦 Chuyển khoản ngân hàng (CK)</option>
                <option value="CASH">💵 Tiền mặt (TM)</option>
                <option value="CARD">💳 Quẹt thẻ (POS)</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Mã tham chiếu ngân hàng / Số biên lai
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="VD: FT2429019283 / POS-0091"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 focus:border-blue-700 focus:outline-hidden"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Ghi chú thu nợ
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="VD: Đối tác chuyển khoản thanh toán đợt 1"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 focus:border-blue-700 focus:outline-hidden"
              />
            </div>
          </div>

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
