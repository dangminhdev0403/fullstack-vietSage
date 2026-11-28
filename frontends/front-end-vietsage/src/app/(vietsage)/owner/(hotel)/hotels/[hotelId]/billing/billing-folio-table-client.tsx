"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { showConfirmDialog } from "@/libs/swal";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import type { BillingPage, FolioListItem } from "@/features/billing/types/billing-contract";
import { formatDateTime, formatMoney } from "@/features/billing/utils/money";

type BillingFolioTableClientProps = {
  hotelId: string;
  foliosPage: BillingPage<FolioListItem>;
  apiBasePath?: string;
  invoiceBasePath?: string;
};

const statusLabels: Record<string, string> = {
  OPEN: "Đang mở",
  CHECKOUT_PENDING: "Chờ thanh toán",
  CLOSED: "Đã thanh toán",
  VOID: "Đã hủy",
};

function toDisplayStatus(status?: string) {
  return status === "OPEN" ? "OPEN" : "CLOSED";
}

function formatShortDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

function getFolioInvoiceId(folio: FolioListItem): string | null {
  return folio.invoiceId ?? folio.billId ?? folio.invoice?.id ?? null;
}

export function BillingFolioTableClient({
  hotelId,
  foliosPage,
  invoiceBasePath: _invoiceBasePath,
}: BillingFolioTableClientProps) {
  const folios = foliosPage.items;
  const page = foliosPage.page;
  const totalItems = foliosPage.total;
  const totalPages = Math.max(1, Math.ceil(totalItems / foliosPage.limit));

  const [selectedFolio, setSelectedFolio] = useState<FolioListItem | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [query, setQuery] = useState("");

  const filteredFolios = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return folios.filter((folio) => {
      const matchesStatus = statusFilter === "ALL" || toDisplayStatus(folio.status) === statusFilter;
      const searchText = [folio.folioNumber, folio.room?.roomNumber, folio.stay?.guestNameSnapshot, folio.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesStatus && (!normalizedQuery || searchText.includes(normalizedQuery));
    });
  }, [folios, query, statusFilter]);

  const totals = useMemo(() => {
    const serverSummary = foliosPage.summary;
    if (serverSummary) {
      return {
        totalFolios: serverSummary.totalFolios,
        openFolios: serverSummary.openFolios,
        closedFolios: serverSummary.closedFolios,
        totalValue: serverSummary.totalValue,
        collectedAmount: serverSummary.collectedAmount,
        outstandingAmount: serverSummary.outstandingAmount,
      };
    }
    return folios.reduce(
      (acc, folio) => {
        const val = Number(folio.total ?? 0);
        const paid = Number(folio.paidAmount ?? folio.invoice?.paidAmount ?? 0);
        const balance = Number(folio.balanceAmount ?? folio.invoice?.balanceAmount ?? Math.max(0, val - paid));
        acc.totalFolios += 1;
        acc.totalValue += val;
        acc.collectedAmount += paid;
        acc.outstandingAmount += balance;
        acc.openFolios += folio.status === "OPEN" ? 1 : 0;
        acc.closedFolios += toDisplayStatus(folio.status) === "CLOSED" ? 1 : 0;
        return acc;
      },
      {
        totalFolios: totalItems,
        openFolios: 0,
        closedFolios: 0,
        totalValue: 0,
        collectedAmount: 0,
        outstandingAmount: 0,
      },
    );
  }, [folios, foliosPage.summary, totalItems]);
  const summaryCurrency = folios[0]?.currency || "VND";

  function openFolio(folio: FolioListItem) {
    setSelectedFolio(folio);
  }

  function openFolioDetail(folio: FolioListItem) {
    openFolio(folio);
  }

  async function exportOrder(folio: FolioListItem) {
    const confirmation = await showConfirmDialog({
      icon: "question",
      title: "Xuất phiếu thanh toán?",
      text: `Xuất phiếu thanh toán cho hóa đơn ${folio.folioNumber ?? folio.id}.`,
      confirmText: "Đồng ý xuất",
      cancelText: "Hủy",
    });

    if (!confirmation.isConfirmed) return;

    openFolio(folio);
    window.requestAnimationFrame(() => {
      window.print();
    });
  }

  return (
    <>
      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-200/80 bg-gradient-to-br from-emerald-50/90 via-teal-50/40 to-slate-50 p-6 sm:p-7">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Metric label="Tổng giá trị hóa đơn" value={formatMoney(totals.totalValue, summaryCurrency)} icon="payments" />
            <Metric label="Đã thực thu" value={formatMoney(totals.collectedAmount, summaryCurrency)} tone="emerald" icon="account_balance_wallet" />
            <Metric label="Đang mở / Chưa thu" value={formatMoney(totals.outstandingAmount, summaryCurrency)} tone="amber" icon="hourglass_top" />
            <Metric label="Tổng hóa đơn" value={String(totals.totalFolios)} icon="receipt_long" />
            <Metric label="Đang mở" value={String(totals.openFolios)} tone="amber" icon="pending_actions" />
            <Metric label="Đã phát hành/đóng" value={String(totals.closedFolios)} tone="emerald" icon="task_alt" />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-100 bg-white p-4 sm:p-5">
          <label className="relative flex min-w-0 sm:min-w-[280px] flex-1 items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 text-sm transition-all focus-within:border-emerald-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-500/20">
            <span className="text-slate-400">🔍</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm kiếm mã hóa đơn, phòng, khách..."
              className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-sm font-bold text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            ) : null}
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              ["ALL", "Tất cả"],
              ["OPEN", "Đang mở"],
              ["CLOSED", "Đã phát hành/đóng"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={`rounded-xl px-4 py-2 text-sm font-bold whitespace-nowrap transition-all duration-150 ${
                  statusFilter === value
                    ? "bg-emerald-700 text-white shadow-xs"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-base">
            <colgroup>
              <col className="w-[18%]" />
              <col className="w-[22%]" />
              <col className="w-[18%]" />
              <col className="w-[14%]" />
              <col className="w-[16%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead className="border-b border-slate-200/80 bg-slate-50/90 text-sm font-extrabold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300">
              <tr>
                <th className="px-5 py-4">Mã hóa đơn</th>
                <th className="px-5 py-4">Phòng / Khách &amp; Đặt phòng</th>
                <th className="px-5 py-4">Người trả / Con nợ</th>
                <th className="px-4 py-4 text-center">Trạng thái</th>
                <th className="px-5 py-4 text-right">Tổng &amp; Đã thu</th>
                <th className="px-4 py-4 text-center">Lưu trú / Mở</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredFolios.map((folio) => {
                const paid = Number(folio.paidAmount ?? folio.invoice?.paidAmount ?? 0);
                const balance = Number(folio.balanceAmount ?? folio.invoice?.balanceAmount ?? 0);
                const hasDebtor = Boolean(folio.debtor);

                return (
                  <tr
                    key={folio.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`Mở chi tiết hóa đơn lưu trú ${folio.folioNumber ?? folio.id}`}
                    onClick={() => void openFolioDetail(folio)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        void openFolioDetail(folio);
                      }
                    }}
                    className="group cursor-pointer transition-colors duration-150 hover:bg-emerald-50/50 focus:outline-none focus-visible:bg-emerald-50/70 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-5 py-4">
                      <div className="font-mono font-bold text-emerald-700 text-sm sm:text-base group-hover:underline dark:text-emerald-400">
                        {folio.folioNumber ?? folio.id}
                      </div>
                      {folio.invoice?.invoiceNumber && folio.invoice.invoiceNumber !== folio.folioNumber ? (
                        <div className="text-xs text-slate-500 font-mono">
                          HĐ: {folio.invoice.invoiceNumber}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 text-slate-900 dark:text-white">
                      <div className="font-bold text-sm sm:text-base flex items-center gap-1.5">
                        <span>Phòng {folio.room?.roomNumber ?? "-"}</span>
                        {folio.bookingCode ? (
                          <span className="rounded bg-blue-50 border border-blue-200 px-1.5 py-0.2 font-mono text-xs font-bold text-blue-700 whitespace-nowrap">
                            #{folio.bookingCode}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {folio.stay?.guestDisplayName ?? folio.stay?.guestNameSnapshot ?? "Khách lưu trú"}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {hasDebtor ? (
                        <div>
                          <span className="text-xs font-bold text-slate-900 dark:text-white block">
                            {folio.debtor!.debtorName}
                          </span>
                          <span className="inline-flex rounded-md bg-amber-50 border border-amber-200 px-1.5 py-0.2 text-xs font-semibold text-amber-800 whitespace-nowrap mt-0.5">
                            {folio.debtor!.debtorType === "PARTNER" ? "🏢 Đối tác/OTA" : "👤 Con nợ"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500 font-medium">Khách lẻ thanh toán</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <StatusBadge status={folio.status} />
                      {hasDebtor && folio.debtor!.outstandingAmount > 0 ? (
                        <span className="text-xs font-bold text-rose-700 block mt-1 whitespace-nowrap">
                          Nợ: {formatMoney(folio.debtor!.outstandingAmount, folio.currency)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="font-mono text-sm sm:text-base font-black tabular-nums text-slate-900 dark:text-white">
                        {formatMoney(folio.total, folio.currency)}
                      </div>
                      {paid > 0 ? (
                        <div className="text-xs font-semibold text-emerald-700 whitespace-nowrap tabular-nums dark:text-emerald-400">
                          Đã thu: {formatMoney(paid, folio.currency)}
                        </div>
                      ) : null}
                      {balance > 0 && !hasDebtor ? (
                        <div className="text-xs font-semibold text-amber-700 whitespace-nowrap tabular-nums dark:text-amber-400">
                          Còn thiếu: {formatMoney(balance, folio.currency)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 text-center text-xs text-slate-600 dark:text-slate-400">
                      {folio.stayDates?.checkIn ? (
                        <div className="font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {formatShortDate(folio.stayDates.checkIn)} - {formatShortDate(folio.stayDates.checkOut)}
                        </div>
                      ) : null}
                      <div className="text-slate-500 text-xs">
                        {formatDateTime(folio.openedAt ?? folio.createdAt)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredFolios.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500 space-y-2">
              <div className="text-3xl">📋</div>
              <div className="font-medium text-pretty">Không tìm thấy hóa đơn lưu trú phù hợp trong trang này.</div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--outline-variant)] bg-slate-50/50 p-4 text-sm font-semibold text-slate-600 dark:bg-slate-900/50 dark:text-slate-400">
          <div>
            Trang <span className="font-bold text-slate-900 dark:text-white">{page}</span> / <span className="font-bold text-slate-900 dark:text-white">{totalPages}</span> ({totalItems} hóa đơn)
          </div>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link
                href={`/owner/hotels/${encodeURIComponent(hotelId)}/billing?folioPage=${page - 1}`}
                scroll={false}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 whitespace-nowrap shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200"
              >
                Trang trước
              </Link>
            ) : (
              <span className="inline-flex items-center justify-center rounded-xl border border-slate-100 bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-400 whitespace-nowrap cursor-not-allowed dark:border-slate-800/40 dark:bg-slate-800/40 dark:text-slate-600">
                Trang trước
              </span>
            )}
            {page < totalPages ? (
              <Link
                href={`/owner/hotels/${encodeURIComponent(hotelId)}/billing?folioPage=${page + 1}`}
                scroll={false}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 whitespace-nowrap shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200"
              >
                Trang sau
              </Link>
            ) : (
              <span className="inline-flex items-center justify-center rounded-xl border border-slate-100 bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-400 whitespace-nowrap cursor-not-allowed dark:border-slate-800/40 dark:bg-slate-800/40 dark:text-slate-600">
                Trang sau
              </span>
            )}
          </div>
        </div>
      </section>

      {selectedFolio ? (
        <FolioModal
          folio={selectedFolio}
          onClose={() => setSelectedFolio(null)}
          onExportOrder={() => exportOrder(selectedFolio)}
        />
      ) : null}
    </>
  );
}

function Metric({
  label,
  value,
  tone = "primary",
  icon,
}: {
  label: string;
  value: string;
  tone?: "primary" | "amber" | "emerald" | "cyan";
  icon?: string;
}) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-50/90 border-amber-200/80 text-amber-950"
      : tone === "emerald" || tone === "cyan"
      ? "bg-emerald-50/90 border-emerald-200/80 text-emerald-950"
      : "bg-white/90 border-slate-200/80 text-slate-900";

  const numClass =
    tone === "amber"
      ? "text-amber-700"
      : tone === "emerald" || tone === "cyan"
      ? "text-emerald-700"
      : "text-slate-900";

  return (
    <div className={`flex flex-col justify-between rounded-2xl border p-4 sm:p-5 shadow-xs backdrop-blur-sm min-w-0 ${toneClass}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs sm:text-sm font-extrabold uppercase tracking-wider opacity-75 text-balance">{label}</div>
        {icon ? <VsIcon name={icon} className="shrink-0 text-base opacity-60" /> : null}
      </div>
      <div className={`mt-2 text-2xl font-black tabular-nums tracking-tight break-words ${numClass}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const displayStatus = toDisplayStatus(status);
  const tone =
    displayStatus === "OPEN"
      ? "bg-emerald-100 text-emerald-800 border border-emerald-200/60"
      : "bg-slate-100 text-slate-700 border border-slate-200/60";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-sm font-bold whitespace-nowrap ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${displayStatus === "OPEN" ? "bg-emerald-600 animate-pulse" : "bg-slate-400"}`} />
      <span>{statusLabels[displayStatus]}</span>
    </span>
  );
}

function FolioModal({
  folio,
  onClose,
  onExportOrder,
}: {
  folio: FolioListItem;
  onClose: () => void;
  onExportOrder: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
        <div className="relative overflow-hidden bg-[linear-gradient(135deg,#0f766e_0%,#f97316_100%)] p-6 text-white">
          <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/20 blur-2xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.24em] text-white/80">Chi tiết hóa đơn lưu trú</p>
              <h2 className="mt-2 text-3xl font-black text-balance">{folio.folioNumber ?? folio.id}</h2>
              <p className="mt-1 text-sm text-white/80 text-pretty">
                Phòng {folio.room?.roomNumber ?? "-"} · {folio.stay?.guestNameSnapshot ?? "Khách lưu trú"}
              </p>
            </div>
            <button type="button" onClick={onClose} className="rounded-full bg-white/15 px-4 py-2 text-sm font-black text-white whitespace-nowrap hover:bg-white/25">
              Đóng
            </button>
          </div>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-3">
          <Info label="Trạng thái" value={statusLabels[toDisplayStatus(folio.status)]} />
          <Info label="Mở lúc" value={formatDateTime(folio.openedAt ?? folio.createdAt)} />
          <Info label="Tổng" value={formatMoney(folio.total, folio.currency)} strong />
          <Info label="Tạm tính" value={formatMoney(folio.subtotal, folio.currency)} />
          <Info label="Thuế" value={formatMoney(folio.tax, folio.currency)} />
          <Info label="Giảm giá" value={formatMoney(folio.discount, folio.currency)} />
        </div>

        <div className="space-y-4 border-t border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--on-surface-variant)] text-pretty">
              Thông tin đối soát doanh thu chi tiết cho hóa đơn lưu trú.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onExportOrder}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--outline-variant)] bg-white px-4 text-sm font-black text-[var(--primary)] whitespace-nowrap"
              >
                Xuất phiếu thanh toán
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-2xl border border-[var(--outline-variant)] bg-white p-4 shadow-sm">
      <div className="text-sm font-black uppercase tracking-[0.16em] text-[var(--on-surface-variant)]">{label}</div>
      <div className={`mt-2 ${strong ? "text-2xl font-black text-[var(--primary)]" : "text-lg font-bold text-[var(--on-surface)]"}`}>{value}</div>
    </div>
  );
}
