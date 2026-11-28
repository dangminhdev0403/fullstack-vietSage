"use client";

import { useMemo, useState } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { formatMoney } from "@/features/billing/utils/money";
import { useBillingCashMovements } from "@/features/billing/hooks/use-billing-cash-movements";
import type {
  AccountBalanceSummary,
  CashMovementItem,
} from "@/features/billing/types/billing-contract";

type DailyCashMovementsClientProps = {
  hotelId: string;
};

function currentMonthBounds(): { from: string; to: string } {
  const today = Temporal.Now.plainDateISO("Asia/Ho_Chi_Minh");
  return {
    from: today.with({ day: 1 }).toString(),
    to: today.with({ day: today.daysInMonth }).toString(),
  };
}

function todayBounds(): { from: string; to: string } {
  const today = Temporal.Now.plainDateISO("Asia/Ho_Chi_Minh").toString();
  return { from: today, to: today };
}

function formatIsoDateTimeVi(iso: string): string {
  try {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    return `${hours}:${mins} · ${day}/${month}/${year}`;
  } catch {
    return iso;
  }
}

const methodLabels: Record<string, string> = {
  CASH: "Tiền mặt",
  BANK_TRANSFER: "Chuyển khoản",
  CARD: "Thẻ",
  QR: "Mã QR",
  MANUAL: "Thủ công",
  OTHER: "Hình thức khác",
};

const sourceTypeLabels: Record<string, string> = {
  FRONT_DESK_PAYMENT: "Thanh toán quầy",
  ONLINE_PAYMENT: "Cổng trực tuyến",
  BOOKING_DEPOSIT: "Tiền cọc đặt phòng",
  RECEIVABLE_COLLECTION: "Thu hồi công nợ",
  HOTEL_EXPENSE: "Chi phí vận hành",
  MANUAL_COLLECTION: "Thu doanh thu bổ sung",
  PAYMENT_REFUND: "Hoàn thanh toán",
  RECEIVABLE_REVERSAL: "Đảo khoản thu nợ",
};

export function DailyCashMovementsClient({ hotelId }: DailyCashMovementsClientProps) {
  const initialBounds = useMemo(() => currentMonthBounds(), []);
  const [from, setFrom] = useState(initialBounds.from);
  const [to, setTo] = useState(initialBounds.to);
  const [movementType, setMovementType] = useState<"ALL" | "RECEIPT" | "DISBURSEMENT">("ALL");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [destinationAccount, setDestinationAccount] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMovement, setSelectedMovement] = useState<CashMovementItem | null>(null);

  const queryInput = useMemo(
    () => ({
      from,
      to,
      movementType: movementType !== "ALL" ? movementType : undefined,
      paymentMethod: paymentMethod || undefined,
      destinationAccount: destinationAccount || undefined,
      q: searchQuery.trim() || undefined,
    }),
    [from, to, movementType, paymentMethod, destinationAccount, searchQuery],
  );

  const { data, items, summary, isLoading, isFetching, isError, error, refetch } = useBillingCashMovements({
    hotelId,
    query: queryInput,
  });

  const currency = data?.currency || "VND";
  const undatedExpense = data?.undatedExpensePayments ?? { amount: 0, expenseCount: 0 };

  const accounts: AccountBalanceSummary[] = summary?.byAccount ?? [];

  return (
    <div className="space-y-6">
      {isError && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-300 bg-rose-50 px-5 py-4 text-xs text-rose-900 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-start gap-2.5">
            <VsIcon name="error" className="text-lg text-rose-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-sm text-rose-900">
                Không thể đối soát sổ thu chi
              </div>
              <p className="mt-0.5 text-rose-800 text-pretty">
                {error instanceof Error
                  ? error.message
                  : "Dữ liệu nguồn chưa đầy đủ để chốt sổ thu chi. Vui lòng thử lại hoặc kiểm tra chứng từ."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-xl border border-rose-300 bg-white px-3.5 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100 cursor-pointer whitespace-nowrap"
          >
            Thử lại
          </button>
        </div>
      )}

      {undatedExpense.amount > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/80 px-5 py-3.5 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <VsIcon name="info" className="text-base text-amber-700 shrink-0" />
            <span className="font-semibold text-pretty">
              Có {undatedExpense.expenseCount} khoản chi cũ tổng{" "}
              <strong className="tabular-nums">{formatMoney(undatedExpense.amount, currency)}</strong>{" "}
              chưa có ngày thực chi cụ thể, được tách riêng khỏi tổng thực chi đã xác minh theo ngày.
            </span>
          </div>
        </div>
      )}
      {/* Top 4 Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Total Cash In */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-800 uppercase tracking-wider">
            <span>Tổng thực thu</span>
            <VsIcon name="arrow_downward" className="text-lg text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-800 tabular-nums">
            +{formatMoney(summary?.totalCashIn ?? 0, currency)}
          </div>
          <span className="mt-1 text-xs text-emerald-700 font-semibold block">
            {summary?.receiptCount ?? 0} lượt thu thực tế
          </span>
        </div>

        {/* Metric 2: Total Cash Out */}
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-rose-800 uppercase tracking-wider">
            <span>Tổng thực chi</span>
            <VsIcon name="arrow_upward" className="text-lg text-rose-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-rose-800 tabular-nums">
            -{formatMoney(summary?.totalCashOut ?? 0, currency)}
          </div>
          <span className="mt-1 text-xs text-rose-700 font-semibold block">
            {summary?.disbursementCount ?? 0} khoản chi đã trả (chi chưa trả: 0 đ)
          </span>
        </div>

        {/* Metric 3: Net Cash Flow */}
        <div
          className={`rounded-2xl border p-4.5 shadow-2xs ${
            (summary?.netCashFlow ?? 0) >= 0
              ? "border-emerald-300 bg-emerald-50/40"
              : "border-rose-300 bg-rose-50/40"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-700 uppercase tracking-wider">
            <span>Dòng tiền ròng (Net)</span>
            <VsIcon name="account_balance_wallet" className="text-lg text-slate-500" />
          </div>
          <div
            className={`mt-2 text-2xl font-black tabular-nums ${
              (summary?.netCashFlow ?? 0) >= 0 ? "text-emerald-800" : "text-rose-700"
            }`}
          >
            {(summary?.netCashFlow ?? 0) >= 0 ? "+" : ""}
            {formatMoney(summary?.netCashFlow ?? 0, currency)}
          </div>
          <span className="mt-1 text-xs text-slate-600 font-medium block">
            Thực thu trừ thực chi trong kỳ
          </span>
        </div>

        {/* Metric 4: Total Movements Count */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600 uppercase tracking-wider">
            <span>Tổng lượt luân chuyển</span>
            <VsIcon name="receipt_long" className="text-lg text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900 tabular-nums">
            {summary?.entryCount ?? 0} giao dịch
          </div>
          <span className="mt-1 text-xs text-slate-500 font-medium block">
            {accounts.length} tài khoản ghi nhận
          </span>
        </div>
      </div>

      {/* Account Balances Strip */}
      {accounts.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <VsIcon name="account_balance" className="text-base text-slate-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 text-balance">
                Phân bổ dòng tiền theo tài khoản đích
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              Không tự gán tài khoản cho chứng từ thiếu thông tin
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {accounts.map((acc) => (
              <button
                key={acc.accountName}
                type="button"
                onClick={() =>
                  setDestinationAccount(
                    destinationAccount === acc.accountName
                      ? ""
                      : acc.isLegacy
                        ? "legacy"
                        : acc.accountName,
                  )
                }
                className={`text-left rounded-xl p-3 border transition cursor-pointer ${
                  destinationAccount === acc.accountName ||
                  (acc.isLegacy && destinationAccount === "legacy")
                    ? "border-emerald-600 bg-emerald-50/80 ring-2 ring-emerald-500/30"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-xs font-bold truncate ${
                      acc.isLegacy ? "text-amber-800" : "text-slate-800"
                    }`}
                  >
                    {acc.accountName}
                  </span>
                  {acc.isLegacy && (
                    <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 whitespace-nowrap">
                      Chưa rõ TK
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-baseline justify-between text-xs">
                  <span className="text-emerald-700 font-bold tabular-nums">
                    +{formatMoney(acc.cashIn, currency)}
                  </span>
                  <span className="text-rose-700 font-bold tabular-nums">
                    -{formatMoney(acc.cashOut, currency)}
                  </span>
                </div>
                <div className="mt-1 pt-1 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Ròng:</span>
                  <span
                    className={`font-black tabular-nums ${
                      acc.netCash >= 0 ? "text-emerald-800" : "text-rose-700"
                    }`}
                  >
                    {acc.netCash >= 0 ? "+" : ""}
                    {formatMoney(acc.netCash, currency)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Main Ledger Table Card */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        {/* Controls & Filters Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 p-4">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Quick date presets */}
            <button
              type="button"
              onClick={() => {
                const b = todayBounds();
                setFrom(b.from);
                setTo(b.to);
              }}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                from === to && from === Temporal.Now.plainDateISO("Asia/Ho_Chi_Minh").toString()
                  ? "bg-[#25483f] text-white"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              Hôm nay
            </button>
            <button
              type="button"
              onClick={() => {
                const b = currentMonthBounds();
                setFrom(b.from);
                setTo(b.to);
              }}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                from === initialBounds.from && to === initialBounds.to
                  ? "bg-[#25483f] text-white"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              Tháng này
            </button>

            {/* Custom Date Inputs */}
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-emerald-600"
              />
              <span>—</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-emerald-600"
              />
            </div>

            {/* Movement Type Filter */}
            <select
              value={movementType}
              onChange={(e) => setMovementType(e.target.value as "ALL" | "RECEIPT" | "DISBURSEMENT")}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-emerald-600 cursor-pointer"
            >
              <option value="ALL">Tất cả luân chuyển</option>
              <option value="RECEIPT">Chỉ thực thu (+)</option>
              <option value="DISBURSEMENT">Chỉ thực chi (-)</option>
            </select>

            {/* Payment Method Filter */}
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-emerald-600 cursor-pointer"
            >
              <option value="">Tất cả phương thức</option>
              <option value="CASH">Tiền mặt</option>
              <option value="BANK_TRANSFER">Chuyển khoản</option>
              <option value="CARD">Thẻ</option>
              <option value="OTHER">Khác</option>
            </select>

            {/* Destination Account Filter */}
            {destinationAccount && (
              <button
                type="button"
                onClick={() => setDestinationAccount("")}
                className="inline-flex items-center gap-1 rounded-xl bg-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-300 transition"
              >
                <span>TK: {destinationAccount}</span>
                <VsIcon name="close" className="text-xs" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo nội dung, con nợ, mã đặt phòng..."
              className="w-full sm:w-64 rounded-xl border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-emerald-600"
            />
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3.5 py-1.5 text-xs font-bold text-slate-700 transition cursor-pointer whitespace-nowrap"
            >
              <VsIcon name="refresh" className={`text-sm ${isFetching ? "animate-spin" : ""}`} />
              <span>Làm mới</span>
            </button>
          </div>
        </div>

        {/* Movements Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-bold tracking-wider">
              <tr>
                <th className="px-5 py-3.5 whitespace-nowrap">Thời điểm</th>
                <th className="px-4 py-3.5 whitespace-nowrap text-center">Loại</th>
                <th className="px-4 py-3.5 whitespace-nowrap">Nội dung &amp; Nguồn gốc</th>
                <th className="px-4 py-3.5 whitespace-nowrap">Đối tượng</th>
                <th className="px-4 py-3.5 whitespace-nowrap">Phương thức &amp; Tài khoản</th>
                <th className="px-5 py-3.5 whitespace-nowrap text-right">Số tiền</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {items.map((item) => {
                const isReceipt = item.movementType === "RECEIPT";

                return (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedMovement(item)}
                    className="hover:bg-emerald-50/40 transition-colors cursor-pointer"
                  >
                    {/* Time */}
                    <td className="px-5 py-3.5 whitespace-nowrap font-medium text-slate-600">
                      {formatIsoDateTimeVi(item.transactionDate)}
                    </td>

                    {/* Type Badge */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-center">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold whitespace-nowrap ${
                          isReceipt
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : "bg-rose-50 text-rose-800 border-rose-200"
                        }`}
                      >
                        {isReceipt ? "Thực thu (+)" : "Thực chi (-)"}
                      </span>
                    </td>

                    {/* Description & Reference */}
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-slate-900 line-clamp-1">
                        {item.description}
                      </div>
                      <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
                        <span>{sourceTypeLabels[item.sourceType] || item.sourceType}</span>
                        {item.referenceCode && (
                          <span className="font-mono text-slate-600">#{item.referenceCode}</span>
                        )}
                        {item.roomNumber && (
                          <span className="font-semibold text-slate-700">· P.{item.roomNumber}</span>
                        )}
                        {item.bookingCode && (
                          <span className="rounded bg-slate-100 px-1 py-0.2 font-mono text-xs font-bold text-slate-700">
                            {item.bookingCode}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Payer or Payee */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="font-semibold text-slate-800">
                        {item.payerOrPayee || "—"}
                      </span>
                    </td>

                    {/* Method & Destination Account */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="font-bold text-slate-800">
                        {methodLabels[item.paymentMethod] || item.paymentMethod}
                      </div>
                      <div className="text-xs mt-0.5">
                        {item.destinationAccount ? (
                          <span className="font-medium text-emerald-700">
                            {item.destinationAccount}
                          </span>
                        ) : (
                          <span className="inline-flex rounded bg-amber-50 border border-amber-200 px-1.5 py-0.2 text-xs font-bold text-amber-800 whitespace-nowrap">
                            Chưa xác định TK
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Amount */}
                    <td className="px-5 py-3.5 whitespace-nowrap text-right">
                      <div
                        className={`text-sm font-black tabular-nums ${
                          isReceipt ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {isReceipt ? "+" : "-"}
                        {formatMoney(item.amount, item.currency)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {items.length === 0 && !isLoading && (
            <div className="p-12 text-center text-xs text-slate-500 space-y-2">
              <VsIcon name="account_balance_wallet" className="text-3xl text-slate-300" />
              <div className="font-semibold text-slate-600 text-balance">
                Không phát sinh luân chuyển tiền mặt hoặc chuyển khoản nào trong khoảng thời gian đã chọn.
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Movement Detail Box Ngang Modal */}
      {selectedMovement && (
        <CashMovementDetailModal
          movement={selectedMovement}
          onClose={() => setSelectedMovement(null)}
        />
      )}
    </div>
  );
}

// Centered Horizontal Box Ngang Modal for Cash Movement Traceability
function CashMovementDetailModal({
  movement,
  onClose,
}: {
  movement: CashMovementItem;
  onClose: () => void;
}) {
  const isReceipt = movement.movementType === "RECEIPT";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="my-auto flex flex-col w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 text-slate-900 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div
              className={`grid h-9 w-9 place-items-center rounded-xl ${
                isReceipt ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
              }`}
            >
              <VsIcon name={isReceipt ? "arrow_downward" : "arrow_upward"} className="text-xl" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 text-balance">
                Chi tiết giao dịch {isReceipt ? "Thực thu" : "Thực chi"}
              </h3>
              <p className="text-xs text-slate-500 text-pretty">
                Truy vết chứng từ &amp; tài khoản nhận tiền thực tế
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition cursor-pointer"
          >
            <VsIcon name="close" className="text-lg" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-5 text-xs text-slate-700">
          {/* Main Amount Card */}
          <div
            className={`rounded-2xl p-5 border text-center ${
              isReceipt
                ? "border-emerald-200 bg-emerald-50/60"
                : "border-rose-200 bg-rose-50/60"
            }`}
          >
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Số tiền giao dịch thực tế
            </div>
            <div
              className={`mt-1.5 text-3xl font-black tabular-nums ${
                isReceipt ? "text-emerald-800" : "text-rose-800"
              }`}
            >
              {isReceipt ? "+" : "-"}
              {formatMoney(movement.amount, movement.currency)}
            </div>
            <div className="mt-1 text-xs font-semibold text-slate-600">
              {formatIsoDateTimeVi(movement.transactionDate)}
            </div>
          </div>

          {/* Traceability Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/50">
              <span className="text-xs font-semibold text-slate-500 block">Nguồn phát sinh:</span>
              <span className="text-xs font-bold text-slate-900 mt-0.5 block">
                {sourceTypeLabels[movement.sourceType] || movement.sourceType}
              </span>
            </div>

            <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/50">
              <span className="text-xs font-semibold text-slate-500 block">Phương thức thanh toán:</span>
              <span className="text-xs font-bold text-slate-900 mt-0.5 block">
                {methodLabels[movement.paymentMethod] || movement.paymentMethod}
              </span>
            </div>

            <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/50">
              <span className="text-xs font-semibold text-slate-500 block">Tài khoản đích / Ngân hàng:</span>
              <div className="mt-0.5">
                {movement.destinationAccount ? (
                  <span className="text-xs font-bold text-emerald-700">
                    {movement.destinationAccount}
                  </span>
                ) : (
                  <span className="inline-flex rounded bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-bold text-amber-800 whitespace-nowrap">
                    Chưa xác định tài khoản
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/50">
              <span className="text-xs font-semibold text-slate-500 block">Đối tượng giao dịch:</span>
              <span className="text-xs font-bold text-slate-900 mt-0.5 block">
                {movement.payerOrPayee || "—"}
              </span>
            </div>

            {movement.bookingCode && (
              <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/50">
                <span className="text-xs font-semibold text-slate-500 block">Mã đặt phòng:</span>
                <span className="font-mono text-xs font-bold text-blue-700 mt-0.5 block">
                  {movement.bookingCode}
                </span>
              </div>
            )}

            {movement.roomNumber && (
              <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/50">
                <span className="text-xs font-semibold text-slate-500 block">Phòng liên quan:</span>
                <span className="text-xs font-bold text-slate-900 mt-0.5 block">
                  Phòng {movement.roomNumber}
                </span>
              </div>
            )}

            {movement.referenceCode && (
              <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/50">
                <span className="text-xs font-semibold text-slate-500 block">Mã chứng từ / Tham chiếu:</span>
                <span className="font-mono text-xs font-bold text-slate-800 mt-0.5 block">
                  {movement.referenceCode}
                </span>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="rounded-xl border border-slate-200 p-3.5 bg-slate-50/30">
            <span className="text-xs font-semibold text-slate-500 block">Nội dung ghi nhận:</span>
            <p className="text-xs font-medium text-slate-800 mt-1 text-pretty">
              {movement.description}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-3.5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 bg-white px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
