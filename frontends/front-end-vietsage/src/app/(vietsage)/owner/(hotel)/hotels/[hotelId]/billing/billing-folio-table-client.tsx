"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";

import { requestInternalApi } from "@/core/http/internal-api-client";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import type { BillingPage, FolioListItem, Invoice } from "@/features/billing/types/billing-contract";
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

function getFolioInvoiceId(folio: FolioListItem): string | null {
  return folio.invoiceId ?? folio.billId ?? folio.invoice?.id ?? null;
}

export function BillingFolioTableClient({
  hotelId,
  foliosPage,
  apiBasePath = `/api/owner/hotels/${encodeURIComponent(hotelId)}`,
  invoiceBasePath = `/owner/hotels/${encodeURIComponent(hotelId)}/billing/invoices`,
}: BillingFolioTableClientProps) {
  const router = useRouter();
  const folios = foliosPage.items;
  const page = foliosPage.page;
  const totalItems = foliosPage.total;
  const totalPages = Math.max(1, Math.ceil(totalItems / foliosPage.limit));

  const [selectedFolio, setSelectedFolio] = useState<FolioListItem | null>(null);
  const [issuedInvoice, setIssuedInvoice] = useState<Invoice | null>(null);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [isIssuingInvoice, setIsIssuingInvoice] = useState(false);
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
    return folios.reduce(
      (acc, folio) => {
        acc.total += Number(folio.total ?? 0);
        acc.open += folio.status === "OPEN" ? 1 : 0;
        acc.pending += toDisplayStatus(folio.status) === "CLOSED" ? 1 : 0;
        return acc;
      },
      { total: 0, open: 0, pending: 0 },
    );
  }, [folios]);

  function openFolio(folio: FolioListItem) {
    setSelectedFolio(folio);
    setIssuedInvoice(null);
    setIssueError(null);
  }

  async function openFolioDetail(folio: FolioListItem) {
    if (toDisplayStatus(folio.status) === "OPEN") {
      openFolio(folio);
      return;
    }

    const invoiceId = getFolioInvoiceId(folio);
    if (!invoiceId) {
      await Swal.fire({
        icon: "warning",
        title: "Chưa có mã hóa đơn",
        text: `Folio ${folio.folioNumber ?? folio.id} đã đóng nhưng danh sách folio chưa trả về invoiceId để mở trang chi tiết.`,
        confirmButtonText: "Đã hiểu",
        confirmButtonColor: "#0f766e",
      });
      return;
    }

    router.push(`${invoiceBasePath}/${encodeURIComponent(invoiceId)}`);
  }

  async function issueInvoice(folio: FolioListItem) {
    const confirmation = await Swal.fire({
      icon: "warning",
      title: "Phát hành hóa đơn?",
      text: `Folio ${folio.folioNumber ?? folio.id} sẽ được khóa chi phí và chuyển sang chờ thanh toán.`,
      showCancelButton: true,
      confirmButtonText: "Phát hành hóa đơn",
      cancelButtonText: "Hủy",
      confirmButtonColor: "#0f766e",
      cancelButtonColor: "#64748b",
    });

    if (!confirmation.isConfirmed) return;

    setIsIssuingInvoice(true);
    setIssueError(null);

    try {
      const invoice = await requestInternalApi<Invoice>(
        `${apiBasePath}/billing/folios/${encodeURIComponent(folio.id)}/invoice`,
        { method: "POST" },
      );
      setIssuedInvoice(invoice);
      router.push(`${invoiceBasePath}/${encodeURIComponent(invoice.id)}`);
    } catch (error) {
      setIssueError(error instanceof Error ? error.message : "Không thể phát hành hóa đơn. Vui lòng thử lại.");
    } finally {
      setIsIssuingInvoice(false);
    }
  }

  async function exportOrder(folio: FolioListItem) {
    const confirmation = await Swal.fire({
      icon: "question",
      title: "Xuất order?",
      text: `Xuất order cho folio ${folio.folioNumber ?? folio.id}.`,
      showCancelButton: true,
      confirmButtonText: "Đồng ý xuất",
      cancelButtonText: "Hủy",
      confirmButtonColor: "#0f766e",
      cancelButtonColor: "#64748b",
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
        <div className="relative overflow-hidden border-b border-slate-200/80 bg-gradient-to-br from-emerald-50/90 via-teal-50/40 to-slate-50 p-6 sm:p-7">
          <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="relative grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/10 px-3 py-0.5 text-xs font-bold uppercase tracking-[0.2em] text-emerald-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                Trung tâm folio
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                Theo dõi doanh thu lưu trú
              </h2>
              <p className="max-w-xl text-sm leading-relaxed text-slate-600">
                Bảng này chỉ hiển thị số tiền backend trả về, giúp nhân sự kiểm tra nhanh trước khi phát hành hóa đơn.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Metric label="Tổng folio" value={String(folios.length)} icon="receipt_long" />
              <Metric label="Đang mở" value={String(totals.open)} tone="amber" icon="pending_actions" />
              <Metric label="Đã phát hành/đóng" value={String(totals.pending)} tone="emerald" icon="task_alt" />
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-100 bg-white p-4 sm:p-5">
          <label className="relative flex min-w-[280px] flex-1 items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 text-sm transition-all focus-within:border-emerald-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-500/20">
            <span className="text-slate-400">🔍</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm kiếm Folio, phòng, khách..."
              className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-xs font-bold text-slate-400 hover:text-slate-600"
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
                className={`rounded-xl px-4 py-2 text-xs font-bold transition-all duration-150 ${
                  statusFilter === value
                    ? "bg-slate-900 text-white shadow-xs"
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
            <thead className="border-b border-slate-200/80 bg-slate-50/90 text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300">
              <tr>
                <th className="px-6 py-4">Folio</th>
                <th className="px-6 py-4">Phòng / Khách</th>
                <th className="px-6 py-4 text-center">Trạng thái</th>
                <th className="px-6 py-4 text-right">Tổng cộng</th>
                <th className="px-6 py-4 text-right">Mở lúc</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredFolios.map((folio) => {
                const discountValue = Number(folio.discount ?? 0);

                return (
                  <tr
                    key={folio.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`Mở chi tiết folio ${folio.folioNumber ?? folio.id}`}
                    onClick={() => void openFolioDetail(folio)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        void openFolioDetail(folio);
                      }
                    }}
                    className="group cursor-pointer transition-colors duration-150 hover:bg-emerald-50/50 focus:outline-none focus-visible:bg-emerald-50/70 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-6 py-4">
                      <div className="font-mono font-bold text-emerald-700 text-base sm:text-lg group-hover:underline dark:text-emerald-400">
                        {folio.folioNumber ?? folio.id}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400 flex items-center gap-1">
                        <span>Click để xem chi tiết</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-900 dark:text-white">
                      <div className="font-bold text-base sm:text-lg">Phòng {folio.room?.roomNumber ?? "-"}</div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">{folio.stay?.guestNameSnapshot ?? "Khách lưu trú"}</div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <StatusBadge status={folio.status} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="font-mono text-base sm:text-xl font-black tabular-nums text-slate-900 dark:text-white">
                        {formatMoney(folio.total, folio.currency)}
                      </div>
                      {discountValue > 0 && (
                        <div className="mt-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          Đã giảm -{formatMoney(folio.discount, folio.currency)}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-sm sm:text-base font-medium text-slate-600 dark:text-slate-400">
                      {formatDateTime(folio.openedAt ?? folio.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredFolios.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500 space-y-2">
              <div className="text-3xl">📋</div>
              <div className="font-medium">Không tìm thấy folio phù hợp trong trang này.</div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--outline-variant)] bg-slate-50/50 p-4 text-sm font-semibold text-slate-600 dark:bg-slate-900/50 dark:text-slate-400">
          <div>
            Trang <span className="font-bold text-slate-900 dark:text-white">{page}</span> / <span className="font-bold text-slate-900 dark:text-white">{totalPages}</span> ({totalItems} folio)
          </div>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link
                href={`/owner/hotels/${encodeURIComponent(hotelId)}/billing?folioPage=${page - 1}`}
                scroll={false}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200"
              >
                Trang trước
              </Link>
            ) : (
              <span className="inline-flex items-center justify-center rounded-xl border border-slate-100 bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-400 cursor-not-allowed dark:border-slate-800/40 dark:bg-slate-800/40 dark:text-slate-600">
                Trang trước
              </span>
            )}
            {page < totalPages ? (
              <Link
                href={`/owner/hotels/${encodeURIComponent(hotelId)}/billing?folioPage=${page + 1}`}
                scroll={false}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200"
              >
                Trang sau
              </Link>
            ) : (
              <span className="inline-flex items-center justify-center rounded-xl border border-slate-100 bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-400 cursor-not-allowed dark:border-slate-800/40 dark:bg-slate-800/40 dark:text-slate-600">
                Trang sau
              </span>
            )}
          </div>
        </div>
      </section>

      {selectedFolio ? (
        <FolioModal
          folio={selectedFolio}
          invoice={issuedInvoice}
          isIssuingInvoice={isIssuingInvoice}
          issueError={issueError}
          onClose={() => setSelectedFolio(null)}
          onCloseRoom={() => issueInvoice(selectedFolio)}
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
    <div className={`rounded-2xl border p-4 shadow-xs backdrop-blur-sm ${toneClass}`}>
      <div className="flex items-center justify-between gap-1">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] opacity-70">{label}</div>
        {icon ? <VsIcon name={icon} className="text-base opacity-60" /> : null}
      </div>
      <div className={`mt-1.5 text-2xl font-black ${numClass}`}>{value}</div>
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
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-xs font-bold ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${displayStatus === "OPEN" ? "bg-emerald-600 animate-pulse" : "bg-slate-400"}`} />
      <span>{statusLabels[displayStatus]}</span>
    </span>
  );
}

function FolioModal({
  folio,
  invoice,
  isIssuingInvoice,
  issueError,
  onClose,
  onCloseRoom,
  onExportOrder,
}: {
  folio: FolioListItem;
  invoice: Invoice | null;
  isIssuingInvoice: boolean;
  issueError: string | null;
  onClose: () => void;
  onCloseRoom: () => void;
  onExportOrder: () => void;
}) {
  const isOpen = folio.status === "OPEN";
  const isBlocked = Boolean(folio.isStale || folio.requiresRecalculation || folio.hasDuplicateOpenFolios);
  const hasIssuedInvoice = Boolean(invoice);
  const isCloseRoomDisabled = isBlocked || isIssuingInvoice || hasIssuedInvoice;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
        <div className="relative overflow-hidden bg-[linear-gradient(135deg,#0f766e_0%,#f97316_100%)] p-6 text-white">
          <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/20 blur-2xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-white/80">Chi tiết folio</p>
              <h2 className="mt-2 text-3xl font-black">{folio.folioNumber ?? folio.id}</h2>
              <p className="mt-1 text-sm text-white/80">
                Phòng {folio.room?.roomNumber ?? "-"} · {folio.stay?.guestNameSnapshot ?? "Khách lưu trú"}
              </p>
            </div>
            <button type="button" onClick={onClose} className="rounded-full bg-white/15 px-4 py-2 text-sm font-black text-white hover:bg-white/25">
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
          {isBlocked ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
              Folio cần được kiểm tra lại trước khi phát hành hóa đơn.
            </div>
          ) : null}
          {issueError ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{issueError}</div> : null}
          {invoice ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <div className="font-black">Đã phát hành hóa đơn {invoice.invoiceNumber}</div>
              <div className="mt-1">Tổng hóa đơn: {formatMoney(invoice.totalAmount, invoice.currency)} · Đang chờ thu tiền</div>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--on-surface-variant)]">
              Phát hành hóa đơn sẽ khóa chi phí folio. Checkout chỉ hoàn tất sau khi xác nhận đã thu tiền.
            </p>
            <div className="flex flex-wrap gap-2">
              {isOpen ? (
                <button
                  type="button"
                  onClick={onCloseRoom}
                  disabled={isCloseRoomDisabled}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--primary)] px-4 text-sm font-black text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isIssuingInvoice ? "Đang phát hành..." : hasIssuedInvoice ? "Đã phát hành" : "Phát hành hóa đơn"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={onExportOrder}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--outline-variant)] bg-white px-4 text-sm font-black text-[var(--primary)]"
              >
                Xuất order
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
      <div className="text-xs font-black uppercase tracking-[0.16em] text-[var(--on-surface-variant)]">{label}</div>
      <div className={`mt-2 ${strong ? "text-2xl font-black text-[var(--primary)]" : "text-lg font-bold text-[var(--on-surface)]"}`}>{value}</div>
    </div>
  );
}
