"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";

import { requestInternalApi } from "@/core/http/internal-api-client";
import type { FolioListItem, Invoice } from "@/features/billing/types/billing-contract";
import { formatDateTime, formatMoney } from "@/features/billing/utils/money";

type BillingFolioTableClientProps = {
  hotelId: string;
  folios: FolioListItem[];
};

const statusLabels: Record<string, string> = {
  OPEN: "Đang mở",
  CHECKOUT_PENDING: "Đã đóng",
  CLOSED: "Đã đóng",
  VOID: "Đã đóng",
};

function toDisplayStatus(status?: string) {
  return status === "OPEN" ? "OPEN" : "CLOSED";
}

function getFolioInvoiceId(folio: FolioListItem): string | null {
  return folio.invoiceId ?? folio.billId ?? folio.invoice?.id ?? null;
}

export function BillingFolioTableClient({ hotelId, folios }: BillingFolioTableClientProps) {
  const router = useRouter();
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

    router.push(`/owner/hotels/${encodeURIComponent(hotelId)}/billing/invoices/${encodeURIComponent(invoiceId)}`);
  }

  async function issueInvoice(folio: FolioListItem) {
    const confirmation = await Swal.fire({
      icon: "warning",
      title: "Đóng phòng này?",
      text: `Folio ${folio.folioNumber ?? folio.id} sẽ được phát hành hóa đơn và chuyển sang trạng thái đã đóng.`,
      showCancelButton: true,
      confirmButtonText: "Đồng ý đóng phòng",
      cancelButtonText: "Hủy",
      confirmButtonColor: "#0f766e",
      cancelButtonColor: "#64748b",
    });

    if (!confirmation.isConfirmed) return;

    setIsIssuingInvoice(true);
    setIssueError(null);

    try {
      const invoice = await requestInternalApi<Invoice>(
        `/api/owner/hotels/${encodeURIComponent(hotelId)}/billing/folios/${encodeURIComponent(folio.id)}/invoice`,
        { method: "POST" },
      );
      setIssuedInvoice(invoice);
      router.push(`/owner/hotels/${encodeURIComponent(hotelId)}/billing/invoices/${encodeURIComponent(invoice.id)}`);
    } catch (error) {
      setIssueError(error instanceof Error ? error.message : "Không thể đóng phòng. Vui lòng thử lại.");
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
      <section className="overflow-hidden rounded-[2rem] border border-[var(--outline-variant)] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="relative overflow-hidden border-b border-[var(--outline-variant)] bg-[linear-gradient(135deg,#fff7ed_0%,#ecfeff_52%,#f8fafc_100%)] p-6">
          <div className="absolute right-8 top-6 h-28 w-28 rounded-full bg-[var(--primary)]/10 blur-2xl" />
          <div className="relative grid gap-4 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[var(--primary)]">Trung tâm folio</p>
              <h2 className="mt-2 text-2xl font-black text-[var(--on-surface)]">Theo dõi doanh thu lưu trú</h2>
              <p className="mt-2 max-w-xl text-sm text-[var(--on-surface-variant)]">
                Bảng này chỉ hiển thị số tiền backend trả về, giúp nhân sự kiểm tra nhanh trước khi phát hành hóa đơn.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Tổng folio" value={String(folios.length)} />
              <Metric label="Đang mở" value={String(totals.open)} tone="amber" />
              <Metric label="Đã đóng" value={String(totals.pending)} tone="cyan" />
            </div>
          </div>
        </div>

        <div className="grid gap-3 border-b border-[var(--outline-variant)] bg-white p-4 lg:grid-cols-[1fr_auto]">
          <label className="flex items-center gap-3 rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-4 py-3 text-sm">
            <span className="text-[var(--on-surface-variant)]">Tìm kiếm</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Folio, phòng, khách..."
              className="min-w-0 flex-1 bg-transparent font-semibold text-[var(--on-surface)] outline-none placeholder:text-[var(--on-surface-variant)]/70"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              ["ALL", "Tất cả"],
              ["OPEN", "Đang mở"],
              ["CLOSED", "Đã đóng"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={`rounded-full px-4 py-2 text-sm font-black transition ${
                  statusFilter === value
                    ? "bg-[var(--primary)] text-white shadow-lg shadow-[var(--primary)]/20"
                    : "border border-[var(--outline-variant)] bg-white text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-[var(--surface-container-low)] text-xs uppercase tracking-[0.18em] text-[var(--on-surface-variant)]">
              <tr>
                <th className="px-5 py-4">Folio</th>
                <th className="px-5 py-4">Phòng / khách</th>
                <th className="px-5 py-4">Trạng thái</th>
                <th className="px-5 py-4 text-right">Tạm tính</th>
                <th className="px-5 py-4 text-right">Thuế</th>
                <th className="px-5 py-4 text-right">Giảm giá</th>
                <th className="px-5 py-4 text-right">Tổng</th>
                <th className="px-5 py-4">Mở lúc</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--outline-variant)]">
              {filteredFolios.map((folio) => (
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
                  className="group cursor-pointer transition hover:bg-[#fff7ed] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)]"
                >
                  <td className="px-5 py-4">
                    <div className="font-black text-[var(--primary)]">{folio.folioNumber ?? folio.id}</div>
                    <div className="mt-1 text-xs text-[var(--on-surface-variant)]">Click để xem nhanh</div>
                  </td>
                  <td className="px-5 py-4 text-[var(--on-surface)]">
                    <div className="font-bold">Phòng {folio.room?.roomNumber ?? "-"}</div>
                    <div className="text-xs text-[var(--on-surface-variant)]">{folio.stay?.guestNameSnapshot ?? "Khách lưu trú"}</div>
                  </td>
                  <td className="px-5 py-4"><StatusBadge status={folio.status} /></td>
                  <td className="px-5 py-4 text-right font-semibold">{formatMoney(folio.subtotal, folio.currency)}</td>
                  <td className="px-5 py-4 text-right">{formatMoney(folio.tax, folio.currency)}</td>
                  <td className="px-5 py-4 text-right">{formatMoney(folio.discount, folio.currency)}</td>
                  <td className="px-5 py-4 text-right text-base font-black text-[var(--on-surface)]">{formatMoney(folio.total, folio.currency)}</td>
                  <td className="px-5 py-4 text-[var(--on-surface-variant)]">{formatDateTime(folio.openedAt ?? folio.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredFolios.length === 0 ? <div className="p-8 text-sm text-[var(--on-surface-variant)]">Không tìm thấy folio phù hợp.</div> : null}
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

function Metric({ label, value, tone = "primary" }: { label: string; value: string; tone?: "primary" | "amber" | "cyan" }) {
  const toneClass = tone === "amber" ? "bg-amber-100 text-amber-900" : tone === "cyan" ? "bg-cyan-100 text-cyan-900" : "bg-white text-[var(--primary)]";

  return (
    <div className={`rounded-2xl border border-white/70 p-4 shadow-sm ${toneClass}`}>
      <div className="text-xs font-black uppercase tracking-[0.16em] opacity-70">{label}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const displayStatus = toDisplayStatus(status);
  const tone = displayStatus === "OPEN" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700";

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${tone}`}>{statusLabels[displayStatus]}</span>;
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
              Folio cần được kiểm tra lại trước khi đóng phòng.
            </div>
          ) : null}
          {issueError ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{issueError}</div> : null}
          {invoice ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <div className="font-black">Đã phát hành hóa đơn {invoice.invoiceNumber}</div>
              <div className="mt-1">Tổng hóa đơn: {formatMoney(invoice.totalAmount, invoice.currency)} · Folio đã đóng</div>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--on-surface-variant)]">
              Đóng phòng sẽ phát hành hóa đơn và cập nhật folio. Xuất order dùng để in/lưu thông tin đơn hiện tại.
            </p>
            <div className="flex flex-wrap gap-2">
              {isOpen ? (
                <button
                  type="button"
                  onClick={onCloseRoom}
                  disabled={isCloseRoomDisabled}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--primary)] px-4 text-sm font-black text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isIssuingInvoice ? "Đang đóng phòng..." : hasIssuedInvoice ? "Đã đóng phòng" : "Đóng phòng"}
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
