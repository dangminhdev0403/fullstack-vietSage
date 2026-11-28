"use client";

import { Fragment, useMemo, useState } from "react";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { useRevenueBookCustomStore } from "../store/revenue-book-custom-store";
import type { RevenueBook } from "../types/revenue-book-contract";
import {
  addMoney,
  buildActivities,
  declarationLabels,
  localParts,
  type Activity,
} from "../utils/revenue-book-export";

function money(amount: number, currency = "VND"): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "VND" ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function dateLabel(value: string): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

interface RevenueBookSpreadsheetProps {
  book: RevenueBook;
  currency: string;
  filter: string;
  canManage: boolean;
  onSelectEntry: (id: string) => void;
  onUpdateNote?: (
    accountKey: string,
    notes: string,
    roomId?: string | null,
    expectedPriorNote?: string | null,
  ) => Promise<void>;
}

type DayGroup = {
  date: string;
  activities: Activity[];
  subtotal: {
    roomRevenue: number;
    channelRevenue: number;
    laundryRevenue: number;
    otherRevenue: number;
    revenueTotal: number;
    cash: number;
    bank: number;
    otherPayment: number;
    paidTotal: number;
    closingBalance: number;
    hasClosing: boolean;
  };
};

function resolveActivityAmounts(act: Activity, showChannelRevenue: boolean) {
  const { revenue, collection, payment } = act;
  const rawRoomRevenue = revenue?.roomRevenue ?? 0;
  const rawChannelRevenue = revenue?.channelRevenue ?? 0;
  const roomRevenue = showChannelRevenue
    ? rawRoomRevenue
    : addMoney(rawRoomRevenue, rawChannelRevenue);
  const channelRevenue = showChannelRevenue ? rawChannelRevenue : 0;
  const laundryRevenue = revenue?.laundryRevenue ?? 0;
  // Fold minibar/beverage service charges into "Dịch vụ khác" so row totals always reconcile with backend revenueTotal.
  const otherRevenue = addMoney(
    revenue?.otherRevenue ?? 0,
    revenue?.minibarRevenue ?? 0,
  );
  const revenueTotal = revenue?.revenueTotal ?? 0;

  const paidTotal = payment?.totalAmount ?? collection?.amount ?? 0;
  const cash = payment
    ? payment.cashAmount
    : collection?.method === "CASH"
      ? paidTotal
      : 0;
  const bank = payment
    ? payment.bankTransferAmount
    : collection?.method === "BANK_TRANSFER"
      ? paidTotal
      : 0;
  const otherPayment = payment
    ? payment.otherAmount
    : collection &&
        collection.method !== "CASH" &&
        collection.method !== "BANK_TRANSFER"
      ? paidTotal
      : 0;

  return {
    roomRevenue,
    channelRevenue,
    laundryRevenue,
    otherRevenue,
    revenueTotal,
    cash,
    bank,
    otherPayment,
    paidTotal,
  };
}

export function RevenueBookSpreadsheet({
  book,
  currency,
  filter,
  canManage,
  onSelectEntry,
  onUpdateNote,
}: RevenueBookSpreadsheetProps) {
  const showChannelRevenue = useRevenueBookCustomStore((state) =>
    Boolean(state.showChannelRevenueByHotel[book.hotelId]),
  );
  const setShowChannelRevenue = useRevenueBookCustomStore(
    (state) => state.setShowChannelRevenue,
  );
  const [visibleColumns, setVisibleColumns] = useState({
    docNumber: true,
    laundry: true,
    otherRevenue: true,
    otherPayment: true,
    declaration: false,
  });

  // Active inline editor state for durable notes only.
  const [activeNoteKey, setActiveNoteKey] = useState<string | null>(null);
  const [tempNoteInput, setTempNoteInput] = useState("");
  const [savingNoteKey, setSavingNoteKey] = useState<string | null>(null);

  const allActivities = useMemo(() => buildActivities(book), [book]);

  const filteredActivities = useMemo(() => {
    if (!filter.trim()) return allActivities;
    const lower = filter.trim().toLocaleLowerCase("vi");
    return allActivities.filter((act) => {
      const { entry } = act;
      const text =
        `${entry.description} ${entry.roomNumber ?? ""} ${entry.documentNumber ?? ""} ${entry.notes ?? ""} ${act.date}`.toLocaleLowerCase(
          "vi",
        );
      return text.includes(lower);
    });
  }, [allActivities, filter]);

  const dayGroups = useMemo<DayGroup[]>(() => {
    const groups: DayGroup[] = [];
    let currentGroup: DayGroup | null = null;

    for (const act of filteredActivities) {
      if (!currentGroup || currentGroup.date !== act.date) {
        currentGroup = {
          date: act.date,
          activities: [],
          subtotal: {
            roomRevenue: 0,
            channelRevenue: 0,
            laundryRevenue: 0,
            otherRevenue: 0,
            revenueTotal: 0,
            cash: 0,
            bank: 0,
            otherPayment: 0,
            paidTotal: 0,
            closingBalance: 0,
            hasClosing: false,
          },
        };
        groups.push(currentGroup);
      }
      currentGroup.activities.push(act);

      const amounts = resolveActivityAmounts(act, showChannelRevenue);
      currentGroup.subtotal.roomRevenue = addMoney(
        currentGroup.subtotal.roomRevenue,
        amounts.roomRevenue,
      );
      currentGroup.subtotal.channelRevenue = addMoney(
        currentGroup.subtotal.channelRevenue,
        amounts.channelRevenue,
      );
      currentGroup.subtotal.laundryRevenue = addMoney(
        currentGroup.subtotal.laundryRevenue,
        amounts.laundryRevenue,
      );
      currentGroup.subtotal.otherRevenue = addMoney(
        currentGroup.subtotal.otherRevenue,
        amounts.otherRevenue,
      );
      currentGroup.subtotal.revenueTotal = addMoney(
        currentGroup.subtotal.revenueTotal,
        amounts.revenueTotal,
      );
      currentGroup.subtotal.cash = addMoney(
        currentGroup.subtotal.cash,
        amounts.cash,
      );
      currentGroup.subtotal.bank = addMoney(
        currentGroup.subtotal.bank,
        amounts.bank,
      );
      currentGroup.subtotal.otherPayment = addMoney(
        currentGroup.subtotal.otherPayment,
        amounts.otherPayment,
      );
      currentGroup.subtotal.paidTotal = addMoney(
        currentGroup.subtotal.paidTotal,
        amounts.paidTotal,
      );
      if (act.closing !== undefined) {
        currentGroup.subtotal.hasClosing = true;
        currentGroup.subtotal.closingBalance = addMoney(
          currentGroup.subtotal.closingBalance,
          act.closing,
        );
      }
    }
    return groups;
  }, [filteredActivities, showChannelRevenue]);

  // Period totals: authoritative backend summary when unfiltered; exact filtered sum when searching.
  const grandTotals = useMemo(() => {
    if (!filter.trim()) {
      const s = book.summary;
      return {
        roomRevenue: showChannelRevenue
          ? s.roomRevenue
          : addMoney(s.roomRevenue, s.channelRevenue),
        channelRevenue: showChannelRevenue ? s.channelRevenue : 0,
        laundryRevenue: s.laundryRevenue,
        otherRevenue: addMoney(s.otherRevenue, s.minibarRevenue),
        revenueTotal: s.revenueTotal,
        cashTotal: s.cashTotal,
        bankTotal: s.bankTransferTotal,
        paidTotal: s.collectedTotal,
        otherPaidTotal: s.otherCollectedTotal,
        closingBalance: s.closingBalance,
      };
    }

    let roomRevenue = 0;
    let channelRevenue = 0;
    let laundryRevenue = 0;
    let otherRevenue = 0;
    let revenueTotal = 0;
    let cashTotal = 0;
    let bankTotal = 0;
    let paidTotal = 0;
    let otherPaidTotal = 0;
    let closingBalance = 0;

    for (const group of dayGroups) {
      roomRevenue = addMoney(roomRevenue, group.subtotal.roomRevenue);
      channelRevenue = addMoney(channelRevenue, group.subtotal.channelRevenue);
      laundryRevenue = addMoney(laundryRevenue, group.subtotal.laundryRevenue);
      otherRevenue = addMoney(otherRevenue, group.subtotal.otherRevenue);
      revenueTotal = addMoney(revenueTotal, group.subtotal.revenueTotal);
      cashTotal = addMoney(cashTotal, group.subtotal.cash);
      bankTotal = addMoney(bankTotal, group.subtotal.bank);
      paidTotal = addMoney(paidTotal, group.subtotal.paidTotal);
      otherPaidTotal = addMoney(otherPaidTotal, group.subtotal.otherPayment);
      closingBalance = addMoney(closingBalance, group.subtotal.closingBalance);
    }

    return {
      roomRevenue,
      channelRevenue,
      laundryRevenue,
      otherRevenue,
      revenueTotal,
      cashTotal,
      bankTotal,
      paidTotal,
      otherPaidTotal,
      closingBalance,
    };
  }, [filter, book.summary, dayGroups, showChannelRevenue]);

  const revenueColSpan =
    1 +
    (showChannelRevenue ? 1 : 0) +
    (visibleColumns.laundry ? 1 : 0) +
    (visibleColumns.otherRevenue ? 1 : 0) +
    1;

  const totalCols =
    3 +
    (visibleColumns.docNumber ? 1 : 0) +
    1 +
    revenueColSpan +
    4 +
    1 +
    (visibleColumns.otherPayment ? 1 : 0) +
    1 +
    (visibleColumns.declaration ? 1 : 0) +
    1;

  function startEditingNote(accountKey: string, currentNote: string) {
    if (!canManage) return;
    setActiveNoteKey(accountKey);
    setTempNoteInput(currentNote);
  }

  async function commitNoteCell(
    accountKey: string,
    baseNote: string,
    roomId?: string | null,
  ) {
    const trimmed = tempNoteInput.trim();
    setActiveNoteKey(null);
    if (trimmed === (baseNote || "")) return;
    if (onUpdateNote) {
      try {
        setSavingNoteKey(accountKey);
        await onUpdateNote(accountKey, trimmed, roomId, baseNote || null);
      } finally {
        setSavingNoteKey(null);
      }
    }
  }

  function renderReadOnlyMoney(amount: number) {
    if (amount === 0) {
      return <span className="text-slate-300 font-normal">—</span>;
    }
    return (
      <span
        className={`tabular-nums ${
          amount < 0 ? "font-semibold text-rose-600" : "font-medium text-slate-800"
        }`}
      >
        {money(amount, currency)}
      </span>
    );
  }

  function renderEditableNoteCell(
    accountKey: string,
    currentNote: string,
    roomId?: string | null,
  ) {
    const isEditing = activeNoteKey === accountKey;
    const isSaving = savingNoteKey === accountKey;

    if (isEditing) {
      return (
        <input
          type="text"
          autoFocus
          value={tempNoteInput}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setTempNoteInput(e.target.value)}
          onBlur={() => commitNoteCell(accountKey, currentNote, roomId)}
          onKeyDown={(e) => {
            if (e.key === "Enter")
              commitNoteCell(accountKey, currentNote, roomId);
            if (e.key === "Escape") setActiveNoteKey(null);
          }}
          placeholder="Nhập ghi chú giao ca..."
          className="w-full min-w-[140px] rounded border border-amber-500 bg-white px-1.5 py-0.5 text-xs text-slate-900 shadow-xs outline-none ring-2 ring-amber-300"
        />
      );
    }

    if (isSaving) {
      return (
        <span className="text-xs text-amber-700 italic animate-pulse">
          Đang lưu...
        </span>
      );
    }

    return (
      <button
        type="button"
        onClick={() => startEditingNote(accountKey, currentNote)}
        className={`group w-full rounded px-1.5 py-0.5 text-left text-xs transition-colors focus-visible:outline-none ${
          canManage ? "hover:bg-amber-100/60 cursor-pointer" : "cursor-default"
        }`}
        title={
          canManage
            ? "Click để sửa ghi chú cho dòng này (lưu chung mọi ca/thiết bị)"
            : undefined
        }
      >
        {currentNote ? (
          <span
            className="block truncate max-w-xs text-slate-700 font-medium"
            title={currentNote}
          >
            {currentNote}
          </span>
        ) : (
          <span className="text-slate-300 group-hover:text-amber-700 font-normal">
            —
          </span>
        )}
      </button>
    );
  }

  let runningSequence = 0;

  return (
    <div className="space-y-3">
      {/* Column Visibility Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-3.5 shadow-xs print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--on-surface-variant)] uppercase tracking-wide whitespace-nowrap">
            Hiển thị cột:
          </span>

          <button
            type="button"
            onClick={() =>
              setShowChannelRevenue(book.hotelId, !showChannelRevenue)
            }
            className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
              showChannelRevenue
                ? "bg-sky-50 text-sky-800 border border-sky-200 shadow-xs"
                : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
            }`}
            title="Bật/Tắt cột Doanh thu kênh bán (OTA, Đại lý)"
          >
            <span>{showChannelRevenue ? "✓" : "+"}</span>
            <span>Doanh thu kênh bán</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setVisibleColumns((p) => ({ ...p, laundry: !p.laundry }))
            }
            className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
              visibleColumns.laundry
                ? "bg-sky-50 text-sky-800 border border-sky-200 shadow-xs"
                : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            <span>{visibleColumns.laundry ? "✓" : "+"}</span>
            <span>Giặt ủi</span>
          </button>
          <button
            type="button"
            onClick={() =>
              setVisibleColumns((p) => ({
                ...p,
                otherRevenue: !p.otherRevenue,
              }))
            }
            className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
              visibleColumns.otherRevenue
                ? "bg-sky-50 text-sky-800 border border-sky-200 shadow-xs"
                : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            <span>{visibleColumns.otherRevenue ? "✓" : "+"}</span>
            <span>Dịch vụ khác</span>
          </button>

          <div className="h-4 w-px bg-slate-300 mx-1" />

          <button
            type="button"
            onClick={() =>
              setVisibleColumns((p) => ({ ...p, docNumber: !p.docNumber }))
            }
            className={`inline-flex items-center gap-1 rounded-xl px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
              visibleColumns.docNumber
                ? "bg-slate-200 text-slate-800 border border-slate-300 shadow-xs"
                : "bg-white text-slate-400 border border-slate-200 line-through"
            }`}
            title="Bật/Tắt cột Số chứng từ"
          >
            <span>Số chứng từ</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setVisibleColumns((p) => ({
                ...p,
                otherPayment: !p.otherPayment,
              }))
            }
            className={`inline-flex items-center gap-1 rounded-xl px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
              visibleColumns.otherPayment
                ? "bg-slate-200 text-slate-800 border border-slate-300 shadow-xs"
                : "bg-white text-slate-400 border border-slate-200 line-through"
            }`}
            title="Bật/Tắt cột Thanh toán khác"
          >
            <span>TT khác</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setVisibleColumns((p) => ({ ...p, declaration: !p.declaration }))
            }
            className={`inline-flex items-center gap-1 rounded-xl px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
              visibleColumns.declaration
                ? "bg-amber-100 text-amber-900 border border-amber-300 font-semibold shadow-xs"
                : "bg-white text-slate-400 border border-slate-200 line-through"
            }`}
            title="Bật/Tắt cột Khai báo tạm trú"
          >
            <span>Khai báo tạm trú</span>
          </button>
        </div>

        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 whitespace-nowrap">
          <VsIcon name="lock" className="text-sm" />
          Số liệu tiền tệ tự động đồng bộ
        </span>
      </div>

      {/* Spreadsheet Grid Container */}
      <div className="overflow-x-auto rounded-2xl border border-slate-300 bg-white shadow-xs max-h-[75vh]">
        <table className="w-full min-w-[1200px] border-collapse text-xs text-left">
          {/* Header 4 Tiers */}
          <thead className="sticky top-0 z-20 bg-slate-100 text-slate-800 shadow-xs">
            {/* Tier 1 */}
            <tr className="border-b border-slate-300 font-semibold text-center divide-x divide-slate-300">
              <th rowSpan={4} className="px-2 py-2 w-12 bg-slate-100 text-center">
                TT
              </th>
              <th rowSpan={4} className="px-2 py-2 w-24 bg-slate-100">
                Ngày/Tháng
              </th>
              <th rowSpan={4} className="px-2 py-2 w-20 bg-slate-100">
                Số phòng
              </th>
              {visibleColumns.docNumber && (
                <th rowSpan={4} className="px-2 py-2 w-32 bg-slate-100">
                  Số chứng từ (Hóa đơn/Phiếu thu)
                </th>
              )}
              <th rowSpan={4} className="px-3 py-2 min-w-[180px] bg-slate-100">
                Diễn giải
              </th>
              <th
                colSpan={revenueColSpan}
                className="px-2 py-1.5 bg-sky-100/90 text-sky-950 font-bold border-b border-sky-300"
              >
                Doanh thu dịch vụ
              </th>
              <th
                colSpan={4}
                className="px-2 py-1.5 bg-emerald-100/90 text-emerald-950 font-bold border-b border-emerald-300"
              >
                Khách hàng thanh toán
              </th>
              <th
                rowSpan={4}
                className="px-2 py-2 w-28 bg-emerald-50 text-emerald-900 font-bold"
              >
                Tổng thanh toán
              </th>
              {visibleColumns.otherPayment && (
                <th rowSpan={4} className="px-2 py-2 w-24 bg-slate-100">
                  Thanh toán khác
                </th>
              )}
              <th
                rowSpan={4}
                className="px-2 py-2 w-28 bg-amber-100/70 text-amber-950 font-bold"
              >
                Còn nợ
              </th>
              {visibleColumns.declaration && (
                <th rowSpan={4} className="px-2 py-2 w-24 bg-slate-100">
                  Khai báo
                </th>
              )}
              <th rowSpan={4} className="px-2 py-2 min-w-[140px] bg-slate-100">
                Ghi chú
              </th>
            </tr>

            {/* Tier 2 */}
            <tr className="border-b border-slate-300 font-semibold text-center divide-x divide-slate-300">
              <th
                rowSpan={3}
                className="px-2 py-1.5 w-24 bg-sky-50/90 text-sky-900"
              >
                Tiền phòng
              </th>
              {showChannelRevenue && (
                <th
                  rowSpan={3}
                  className="px-2 py-1.5 w-28 bg-sky-50/90 text-sky-900"
                >
                  Doanh thu kênh bán
                </th>
              )}
              {visibleColumns.laundry && (
                <th
                  rowSpan={3}
                  className="px-2 py-1.5 w-24 bg-sky-50/90 text-sky-900"
                >
                  Giặt ủi
                </th>
              )}
              {visibleColumns.otherRevenue && (
                <th
                  rowSpan={3}
                  className="px-2 py-1.5 w-24 bg-sky-50/90 text-sky-900"
                >
                  Dịch vụ khác
                </th>
              )}
              <th
                rowSpan={3}
                className="px-2 py-1.5 w-28 bg-sky-200/80 font-bold text-sky-950"
              >
                Tổng doanh thu
              </th>
              <th
                rowSpan={3}
                className="px-2 py-1.5 w-24 bg-emerald-50/70 text-emerald-950"
              >
                Ngày thanh toán
              </th>
              <th
                colSpan={3}
                className="px-2 py-1 bg-emerald-100/70 font-semibold border-b border-emerald-200 text-emerald-950"
              >
                Số tiền
              </th>
            </tr>

            {/* Tier 3 */}
            <tr className="border-b border-slate-300 font-semibold text-center divide-x divide-slate-300">
              <th
                rowSpan={2}
                className="px-2 py-1.5 w-24 bg-emerald-50/70 text-emerald-950"
              >
                Tiền mặt
              </th>
              <th
                colSpan={2}
                className="px-2 py-1 bg-emerald-100/60 font-semibold border-b border-emerald-200 text-emerald-950"
              >
                Chuyển khoản
              </th>
            </tr>

            {/* Tier 4 */}
            <tr className="border-b border-slate-300 font-semibold text-center divide-x divide-slate-300">
              <th className="px-2 py-1 w-16 bg-emerald-50/50 text-emerald-950 font-mono">
                Giờ CK
              </th>
              <th className="px-2 py-1 w-24 bg-emerald-50/50 text-emerald-950 font-semibold">
                Số tiền
              </th>
            </tr>

            {/* Balance Adjustment Row */}
            {book.summary.balanceAdjustment !== 0 && (
              <tr className="bg-amber-50/50 text-amber-900 border-b border-amber-200 text-xs">
                <td
                  colSpan={3 + (visibleColumns.docNumber ? 1 : 0) + 1}
                  className="px-3 py-1"
                >
                  Điều chỉnh công nợ không qua thu tiền
                </td>
                <td
                  colSpan={revenueColSpan + 4}
                  className="px-3 py-1 text-right text-amber-700"
                >
                  Phân bổ đặt cọc / cấn trừ công nợ:
                </td>
                <td
                  colSpan={visibleColumns.otherPayment ? 2 : 1}
                  className="px-2 py-1 text-right tabular-nums"
                >
                  —
                </td>
                <td className="px-2 py-1 text-right font-semibold tabular-nums">
                  {money(book.summary.balanceAdjustment, currency)}
                </td>
                <td
                  colSpan={1 + (visibleColumns.declaration ? 1 : 0)}
                  className="px-2 py-1 text-xs text-amber-800 text-right"
                >
                  —
                </td>
              </tr>
            )}
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-200 bg-white">
            {dayGroups.length === 0 ? (
              <tr>
                <td
                  colSpan={totalCols}
                  className="px-4 py-12 text-center text-slate-500 text-sm"
                >
                  {filter
                    ? "Không có bản ghi nào phù hợp với bộ lọc."
                    : "Chưa có phát sinh trong kỳ này."}
                </td>
              </tr>
            ) : (
              dayGroups.map((group) => {
                const sub = group.subtotal;

                return (
                  <Fragment key={`day-${group.date || "none"}`}>
                    {group.activities.map((act) => {
                      runningSequence++;
                      const seq = runningSequence;
                      const { entry, collection, payment } = act;
                      const local = payment
                        ? localParts(payment.receivedAt, book.timeZone)
                        : collection
                          ? localParts(collection.receivedAt, book.timeZone)
                          : null;

                      const amounts = resolveActivityAmounts(
                        act,
                        showChannelRevenue,
                      );

                      const bankLocal = payment?.bankTransferAt
                        ? localParts(payment.bankTransferAt, book.timeZone)
                        : amounts.bank !== 0 && local
                          ? local
                          : null;
                      const paymentDateText = local ? dateLabel(local.date) : "";
                      const bankTimeText =
                        amounts.bank !== 0 && bankLocal ? bankLocal.time : "";

                      return (
                        <tr
                          key={`act-${entry.id}-${act.date}-${payment?.id ?? collection?.id ?? "rev"}-${seq}`}
                          className="hover:bg-sky-50/30 transition-colors divide-x divide-slate-100"
                        >
                          <td className="px-2 py-2 text-center text-slate-500 font-mono">
                            {seq}
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap text-slate-700 font-mono text-center">
                            {act.date ? dateLabel(act.date) : "—"}
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap text-center font-medium text-slate-800">
                            {entry.roomNumber ? (
                              `P.${entry.roomNumber}`
                            ) : (
                              <span className="text-slate-300 font-normal">
                                —
                              </span>
                            )}
                          </td>
                          {visibleColumns.docNumber && (
                            <td className="px-2 py-2 text-slate-600 font-mono text-center">
                              {entry.documentNumber || (
                                <span className="text-slate-300 font-normal">
                                  —
                                </span>
                              )}
                            </td>
                          )}
                          <td className="px-2 py-2 font-medium">
                            <div className="group/desc flex items-center justify-between gap-1 w-full">
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                <span
                                  className="text-slate-800 truncate"
                                  title={entry.description}
                                >
                                  {entry.description || "—"}
                                </span>
                                {entry.source === "MANUAL" && (
                                  <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 whitespace-nowrap">
                                    {entry.voidedAt ? "Đã hủy" : "Bổ sung"}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-0.5 opacity-0 group-hover/desc:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectEntry(entry.id);
                                  }}
                                  className="p-1 text-slate-400 hover:text-[var(--primary)] hover:bg-slate-100 rounded transition-all cursor-pointer"
                                  title="Xem chi tiết khoản phát sinh"
                                >
                                  <VsIcon name="visibility" className="text-sm" />
                                </button>
                              </div>
                            </div>
                          </td>

                          {/* Doanh thu Tiền phòng (Read-only system value) */}
                          <td className="px-2 py-2 text-right tabular-nums text-slate-800">
                            {renderReadOnlyMoney(amounts.roomRevenue)}
                          </td>

                          {/* Doanh thu Kênh bán (OTA / Đại lý) */}
                          {showChannelRevenue && (
                            <td className="px-2 py-2 text-right tabular-nums text-slate-800">
                              {renderReadOnlyMoney(amounts.channelRevenue)}
                            </td>
                          )}

                          {/* Doanh thu Giặt ủi (Read-only system value) */}
                          {visibleColumns.laundry && (
                            <td className="px-2 py-2 text-right tabular-nums text-slate-800">
                              {renderReadOnlyMoney(amounts.laundryRevenue)}
                            </td>
                          )}

                          {/* Doanh thu Dịch vụ khác (Read-only system value) */}
                          {visibleColumns.otherRevenue && (
                            <td className="px-2 py-2 text-right tabular-nums text-slate-800">
                              {renderReadOnlyMoney(amounts.otherRevenue)}
                            </td>
                          )}

                          {/* Tổng doanh thu (Read-only system calculated) */}
                          <td
                            className={`px-2 py-2 text-right tabular-nums font-semibold bg-sky-50/60 ${
                              amounts.revenueTotal < 0
                                ? "text-rose-600"
                                : "text-sky-950"
                            }`}
                          >
                            {amounts.revenueTotal !== 0
                              ? money(amounts.revenueTotal, currency)
                              : "—"}
                          </td>

                          {/* Ngày tháng thanh toán (Read-only system value) */}
                          <td className="px-2 py-2 text-center font-mono whitespace-nowrap text-slate-700">
                            {paymentDateText || (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>

                          {/* Tiền mặt (Read-only system value) */}
                          <td className="px-2 py-2 text-right tabular-nums">
                            {renderReadOnlyMoney(amounts.cash)}
                          </td>

                          {/* Giờ CK (Read-only system value) */}
                          <td className="px-2 py-2 text-center font-mono whitespace-nowrap text-slate-700">
                            {bankTimeText || (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>

                          {/* Số tiền CK (Read-only system value) */}
                          <td className="px-2 py-2 text-right tabular-nums">
                            {renderReadOnlyMoney(amounts.bank)}
                          </td>

                          {/* Tổng tiền thanh toán (Read-only system calculated) */}
                          <td
                            className={`px-2 py-2 text-right tabular-nums font-bold bg-emerald-50/40 ${
                              amounts.paidTotal < 0
                                ? "text-rose-600"
                                : "text-emerald-900"
                            }`}
                          >
                            {amounts.paidTotal !== 0
                              ? money(amounts.paidTotal, currency)
                              : "—"}
                          </td>

                          {/* Thanh toán khác (Read-only system value) */}
                          {visibleColumns.otherPayment && (
                            <td className="px-2 py-2 text-right tabular-nums">
                              {renderReadOnlyMoney(amounts.otherPayment)}
                            </td>
                          )}

                          {/* Còn nợ (Read-only system calculated) */}
                          <td
                            className={`px-2 py-2 text-right tabular-nums font-semibold ${
                              (act.closing ?? 0) < 0
                                ? "text-rose-600 font-bold"
                                : "text-slate-900"
                            }`}
                          >
                            {act.closing !== undefined
                              ? money(act.closing, currency)
                              : "—"}
                          </td>

                          {/* Khai báo (BCA) */}
                          {visibleColumns.declaration && (
                            <td className="px-2 py-2 text-center whitespace-nowrap">
                              {entry.declarationStatus ? (
                                <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 whitespace-nowrap">
                                  {declarationLabels[entry.declarationStatus] ??
                                    "Chưa xác định"}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                          )}

                          {/* Ghi chú (Durable inline editable note) */}
                          <td className="px-2 py-1 text-slate-700 text-xs max-w-xs">
                            {renderEditableNoteCell(
                              entry.id,
                              entry.notes ?? "",
                              entry.roomId,
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Subtotal Row for this Day (Cộng ngày) */}
                    {group.date && (
                      <tr className="bg-slate-100/90 font-bold border-y-2 border-slate-300 text-slate-900 divide-x divide-slate-300">
                        <td
                          colSpan={3 + (visibleColumns.docNumber ? 1 : 0) + 1}
                          className="px-3 py-1.5 text-left text-slate-800"
                        >
                          Cộng ngày {dateLabel(group.date)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {money(sub.roomRevenue, currency)}
                        </td>
                        {showChannelRevenue && (
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {money(sub.channelRevenue, currency)}
                          </td>
                        )}
                        {visibleColumns.laundry && (
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {money(sub.laundryRevenue, currency)}
                          </td>
                        )}
                        {visibleColumns.otherRevenue && (
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {money(sub.otherRevenue, currency)}
                          </td>
                        )}
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-950 font-extrabold bg-sky-200/60">
                          {money(sub.revenueTotal, currency)}
                        </td>
                        <td className="px-2 py-1.5 text-center text-slate-400">
                          —
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {money(sub.cash, currency)}
                        </td>
                        <td className="px-2 py-1.5 text-center text-slate-400">
                          —
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {money(sub.bank, currency)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-emerald-900 font-extrabold">
                          {money(sub.paidTotal, currency)}
                        </td>
                        {visibleColumns.otherPayment && (
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {money(sub.otherPayment, currency)}
                          </td>
                        )}
                        <td
                          className={`px-2 py-1.5 text-right tabular-nums font-extrabold ${
                            sub.hasClosing && sub.closingBalance < 0
                              ? "text-rose-600"
                              : ""
                          }`}
                        >
                          {sub.hasClosing
                            ? money(sub.closingBalance, currency)
                            : "—"}
                        </td>
                        {visibleColumns.declaration && (
                          <td className="px-2 py-1.5 text-center text-slate-400">
                            —
                          </td>
                        )}
                        <td className="px-2 py-1.5 text-slate-500 font-normal text-right text-xs">
                          Tổng ngày {dateLabel(group.date)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}

            {/* Grand Total Row (TỔNG KỲ) */}
            <tr className="bg-slate-200 font-bold border-t-2 border-slate-400 text-slate-950 divide-x divide-slate-300 text-sm">
              <td
                colSpan={3 + (visibleColumns.docNumber ? 1 : 0) + 1}
                className="px-3 py-2.5 text-left uppercase tracking-wider font-extrabold"
              >
                TỔNG KỲ
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">
                {money(grandTotals.roomRevenue, currency)}
              </td>
              {showChannelRevenue && (
                <td className="px-2 py-2.5 text-right tabular-nums">
                  {money(grandTotals.channelRevenue, currency)}
                </td>
              )}
              {visibleColumns.laundry && (
                <td className="px-2 py-2.5 text-right tabular-nums">
                  {money(grandTotals.laundryRevenue, currency)}
                </td>
              )}
              {visibleColumns.otherRevenue && (
                <td className="px-2 py-2.5 text-right tabular-nums">
                  {money(grandTotals.otherRevenue, currency)}
                </td>
              )}
              <td className="px-2 py-2.5 text-right tabular-nums font-black bg-sky-300/80 text-sky-950">
                {money(grandTotals.revenueTotal, currency)}
              </td>
              <td className="px-2 py-2.5 text-center text-slate-400 font-normal">
                —
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">
                {money(grandTotals.cashTotal, currency)}
              </td>
              <td className="px-2 py-2.5 text-center text-slate-400 font-normal">
                —
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">
                {money(grandTotals.bankTotal, currency)}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums font-black text-emerald-950">
                {money(grandTotals.paidTotal, currency)}
              </td>
              {visibleColumns.otherPayment && (
                <td className="px-2 py-2.5 text-right tabular-nums">
                  {money(grandTotals.otherPaidTotal, currency)}
                </td>
              )}
              <td
                className={`px-2 py-2.5 text-right tabular-nums font-black ${
                  grandTotals.closingBalance < 0
                    ? "text-rose-600"
                    : "text-slate-950"
                }`}
              >
                {money(grandTotals.closingBalance, currency)}
              </td>
              {visibleColumns.declaration && (
                <td className="px-2 py-2.5 text-center text-slate-400 font-normal">
                  —
                </td>
              )}
              <td className="px-2 py-2.5 text-right text-xs text-slate-600 font-normal">
                {book.currency}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
