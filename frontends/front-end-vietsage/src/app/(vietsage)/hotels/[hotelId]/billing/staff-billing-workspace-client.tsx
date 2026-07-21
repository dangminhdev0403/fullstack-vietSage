"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";

import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type { FolioItem, FolioListItem, FolioSummary, Invoice } from "@/features/billing/types/billing-contract";
import { formatMoney } from "@/features/billing/utils/money";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";

type Props = {
  hotelId: string;
  folios: FolioListItem[];
  canManage: boolean;
};

type FolioItemsPage = {
  items: FolioItem[];
};

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getStatusLabel(status: string | undefined): string {
  if (status === "OPEN") return "Đang mở";
  if (status === "CHECKOUT_PENDING") return "Chờ thanh toán";
  if (status === "CLOSED") return "Đã đóng";
  if (status === "VOID") return "Đã hủy";
  return status ?? "-";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function displayRoom(folio: FolioListItem | undefined): string {
  return folio?.room?.roomNumber ? `Phòng ${folio.room.roomNumber}` : "Chưa rõ phòng";
}

function displayGuest(folio: FolioListItem | undefined): string {
  return folio?.stay?.guestNameSnapshot ?? "Khách lưu trú";
}

export function StaffBillingWorkspaceClient({ hotelId, folios, canManage }: Props) {
  const router = useRouter();
  const apiBase = `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/billing`;
  const [selectedFolioId, setSelectedFolioId] = useState(() => folios[0]?.id ?? "");
  const [summary, setSummary] = useState<FolioSummary | null>(folios[0] ?? null);
  const [items, setItems] = useState<FolioItem[]>([]);
  const [loadedFolioId, setLoadedFolioId] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedFolio = useMemo(
    () => folios.find((folio) => folio.id === selectedFolioId) ?? folios[0],
    [folios, selectedFolioId],
  );
  const isDetailLoaded = selectedFolioId !== "" && loadedFolioId === selectedFolioId;
  const loading = selectedFolioId !== "" && !isDetailLoaded;
  const activeSummary = isDetailLoaded ? summary : null;
  const activeItems = isDetailLoaded ? items : [];

  useEffect(() => {
    if (!selectedFolioId) {
      return;
    }

    let cancelled = false;
    Promise.all([
      requestInternalApiEnvelope<FolioSummary>(`${apiBase}/folios/${encodeURIComponent(selectedFolioId)}/summary`, { method: "GET" }),
      requestInternalApiEnvelope<FolioItemsPage>(`${apiBase}/folios/${encodeURIComponent(selectedFolioId)}/items?page=1&limit=100`, { method: "GET" }),
    ])
      .then(([summaryResponse, itemsResponse]) => {
        if (cancelled) return;
        setSummary(summaryResponse.data);
        setItems(itemsResponse.data.items);
        setLoadedFolioId(selectedFolioId);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadedFolioId(selectedFolioId);
        void Swal.fire({ icon: "error", title: "Không thể tải chi tiết folio", text: error instanceof Error ? error.message : "Vui lòng thử lại.", confirmButtonColor: "#00003c" });
      })

    return () => {
      cancelled = true;
    };
  }, [apiBase, selectedFolioId]);

  async function issueInvoiceAndCollect() {
    if (!selectedFolioId || !canManage) return;
    const confirmation = await Swal.fire({
      icon: "question",
      title: "Phát hành hóa đơn và thu tiền?",
      text: "Sau khi xác nhận thanh toán, stay sẽ đóng và phòng chuyển sang chờ dọn.",
      showCancelButton: true,
      confirmButtonText: "Tiếp tục",
      cancelButtonText: "Hủy",
      confirmButtonColor: "#00003c",
    });
    if (!confirmation.isConfirmed) return;

    setSaving(true);
    try {
      const invoiceResponse = await requestInternalApiEnvelope<Invoice>(`${apiBase}/folios/${encodeURIComponent(selectedFolioId)}/invoice`, { method: "POST" });
      const invoice = invoiceResponse.data;
      if (toNumber(invoice.balanceAmount ?? invoice.totalAmount) > 0) {
        await requestInternalApiEnvelope(`${apiBase}/invoices/${encodeURIComponent(invoice.id)}/manual-payment`, {
          method: "POST",
          body: { method: "CASH", note: "Thu tại quầy lễ tân" },
        });
        await Swal.fire({ icon: "success", title: "Đã thu tiền và đóng phòng", confirmButtonColor: "#00003c" });
      } else {
        await requestInternalApiEnvelope(`${apiBase}/invoices/${encodeURIComponent(invoice.id)}/manual-payment`, {
          method: "POST",
          body: { method: "MANUAL", note: "Đóng checkout không còn số dư" },
        });
        await Swal.fire({ icon: "success", title: "Đã đóng phòng không còn số dư", confirmButtonColor: "#00003c" });
      }
      router.refresh();
    } catch (error) {
      await Swal.fire({ icon: "error", title: "Không thể hoàn tất checkout", text: error instanceof Error ? error.message : "Vui lòng thử lại.", confirmButtonColor: "#00003c" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)_22rem]">
      <aside className="overflow-hidden rounded-xl border border-[var(--outline-variant)] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        <div className="border-b border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--secondary)]">Folio queue</p>
          <h2 className="vs-display mt-1 text-2xl font-semibold text-[var(--primary)]">Khách chờ thanh toán</h2>
        </div>
        <div className="max-h-[38rem] divide-y divide-[var(--outline-variant)] overflow-y-auto">
          {folios.map((folio) => (
            <button key={folio.id} type="button" onClick={() => setSelectedFolioId(folio.id)} className={`block w-full p-4 text-left transition hover:bg-[var(--surface-container-low)] ${selectedFolioId === folio.id ? "bg-[var(--primary-fixed)]/45" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-[var(--primary)]">{folio.folioNumber ?? folio.id}</p>
                  <p className="mt-1 text-sm font-semibold">{displayRoom(folio)}</p>
                  <p className="text-xs text-[var(--on-surface-variant)]">{displayGuest(folio)}</p>
                </div>
                <span className="rounded-full bg-[var(--surface-container-high)] px-3 py-1 text-xs font-bold text-[var(--on-surface-variant)]">{getStatusLabel(folio.status)}</span>
              </div>
              <p className="mt-3 text-right font-bold text-[var(--primary)]">{formatMoney(toNumber(folio.total ?? folio.totalAmount), folio.currency ?? "VND")}</p>
            </button>
          ))}
          {folios.length === 0 ? <p className="p-5 text-center text-sm text-[var(--on-surface-variant)]">Chưa có folio trong phạm vi thanh toán.</p> : null}
        </div>
      </aside>

      <article className="overflow-hidden rounded-xl border border-[var(--outline-variant)] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        <div className="flex flex-col gap-3 border-b border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--secondary)]">Payment workspace</p>
            <h2 className="vs-display mt-1 text-3xl font-semibold text-[var(--primary)]">{displayRoom(selectedFolio)} - {displayGuest(selectedFolio)}</h2>
          </div>
          <p className="text-sm text-[var(--on-surface-variant)]">Mở lúc <span className="font-bold text-[var(--primary)]">{formatDate(selectedFolio?.openedAt ?? selectedFolio?.createdAt)}</span></p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[var(--surface-container-low)] text-xs uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
              <tr><th className="p-4">Dịch vụ</th><th className="p-4 text-right">SL</th><th className="p-4 text-right">Đơn giá</th><th className="p-4 text-right">Thành tiền</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--outline-variant)]">
              {activeItems.map((item) => (
                <tr key={item.id}>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--secondary-fixed)] text-[var(--on-secondary-fixed)]"><VsIcon name={item.itemType === "ROOM_CHARGE" ? "king_bed" : "room_service"} /></span>
                      <div><p className="font-semibold text-[var(--primary)]">{item.nameSnapshot}</p><p className="text-xs text-[var(--on-surface-variant)]">{item.itemType}</p></div>
                    </div>
                  </td>
                  <td className="p-4 text-right">{item.quantity}</td>
                  <td className="p-4 text-right">{formatMoney(toNumber(item.unitPriceSnapshot), item.currency)}</td>
                  <td className="p-4 text-right font-bold">{formatMoney(toNumber(item.totalSnapshot), item.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && activeItems.length === 0 ? <p className="p-8 text-center text-sm text-[var(--on-surface-variant)]">Folio chưa có dòng phí. Phí phòng sẽ được backend tính khi phát hành hóa đơn.</p> : null}
          {loading ? <p className="p-8 text-center text-sm text-[var(--on-surface-variant)]">Đang tải chi tiết folio...</p> : null}
        </div>
      </article>

      <aside className="space-y-4">
        <div className="rounded-xl bg-[var(--primary)] p-5 text-white shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/65">Tổng thanh toán</p>
          <p className="vs-display mt-2 text-4xl font-semibold">{formatMoney(toNumber(activeSummary?.total ?? selectedFolio?.total ?? 0), activeSummary?.currency ?? selectedFolio?.currency ?? "VND")}</p>
          <dl className="mt-5 space-y-3 border-t border-white/20 pt-4 text-sm">
            <div className="flex justify-between"><dt>Tạm tính</dt><dd>{formatMoney(toNumber(activeSummary?.subtotal ?? 0), activeSummary?.currency ?? "VND")}</dd></div>
            <div className="flex justify-between"><dt>Thuế</dt><dd>{formatMoney(toNumber(activeSummary?.tax ?? 0), activeSummary?.currency ?? "VND")}</dd></div>
            <div className="flex justify-between"><dt>Giảm giá</dt><dd>{formatMoney(toNumber(activeSummary?.discount ?? 0), activeSummary?.currency ?? "VND")}</dd></div>
          </dl>
          <button type="button" onClick={() => void issueInvoiceAndCollect()} disabled={!selectedFolioId || !canManage || saving} className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--secondary-fixed)] px-5 text-sm font-bold text-[var(--on-secondary-fixed)] disabled:opacity-60">
            <VsIcon name={saving ? "sync" : "payments"} />
            {saving ? "Đang xử lý..." : "Phát hành & thu tiền"}
          </button>
        </div>
        <div className="rounded-xl border border-[var(--outline-variant)] bg-white p-5">
          <h3 className="vs-display text-2xl font-semibold text-[var(--primary)]">Trạng thái checkout</h3>
          <p className="mt-3 text-sm text-[var(--on-surface-variant)]">Sau khi thanh toán thành công, backend đóng folio, đóng stay, khóa QR GuestOS và chuyển phòng sang chờ dọn.</p>
        </div>
      </aside>
    </section>
  );
}
