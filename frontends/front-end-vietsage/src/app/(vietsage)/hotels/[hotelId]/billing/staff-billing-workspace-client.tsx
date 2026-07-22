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

type StatusFilter = "ALL" | "CHECKOUT_PENDING" | "OPEN" | "CLOSED";

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getStatusBadge(status: string | undefined) {
  if (status === "OPEN") {
    return { label: "Đang mở", colorClass: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  }
  if (status === "CHECKOUT_PENDING") {
    return { label: "Chờ checkout", colorClass: "bg-amber-50 text-amber-800 border-amber-200 animate-pulse" };
  }
  if (status === "CLOSED") {
    return { label: "Đã đóng", colorClass: "bg-slate-100 text-slate-700 border-slate-200" };
  }
  if (status === "VOID") {
    return { label: "Đã hủy", colorClass: "bg-red-50 text-red-700 border-red-200" };
  }
  return { label: status ?? "-", colorClass: "bg-gray-100 text-gray-600 border-gray-200" };
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

function getFolioInvoiceId(folio: FolioListItem | undefined): string | null {
  if (!folio) return null;
  return folio.invoiceId ?? folio.billId ?? folio.invoice?.id ?? null;
}

function getItemIcon(itemType: string): string {
  if (itemType === "ROOM_CHARGE") return "king_bed";
  if (itemType === "SERVICE") return "room_service";
  if (itemType === "FOOD_BEVERAGE") return "restaurant";
  if (itemType === "DISCOUNT") return "loyalty";
  return "receipt_long";
}

export function StaffBillingWorkspaceClient({ hotelId, folios, canManage }: Props) {
  const router = useRouter();
  const apiBase = `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/billing`;
  const [selectedFolioId, setSelectedFolioId] = useState(() => folios[0]?.id ?? "");
  const [summary, setSummary] = useState<FolioSummary | null>(folios[0] ?? null);
  const [items, setItems] = useState<FolioItem[]>([]);
  const [loadedFolioId, setLoadedFolioId] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const filteredFolios = useMemo(() => {
    return folios.filter((folio) => {
      const roomStr = folio.room?.roomNumber?.toLowerCase() ?? "";
      const guestStr = folio.stay?.guestNameSnapshot?.toLowerCase() ?? "";
      const folioCode = (folio.folioNumber ?? folio.id).toLowerCase();
      const q = search.trim().toLowerCase();
      const matchesSearch = !q || roomStr.includes(q) || guestStr.includes(q) || folioCode.includes(q);

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "CHECKOUT_PENDING" && folio.status === "CHECKOUT_PENDING") ||
        (statusFilter === "OPEN" && folio.status === "OPEN") ||
        (statusFilter === "CLOSED" && folio.status === "CLOSED");

      return matchesSearch && matchesStatus;
    });
  }, [folios, search, statusFilter]);

  const selectedFolio = useMemo(
    () => folios.find((folio) => folio.id === selectedFolioId) ?? filteredFolios[0] ?? folios[0],
    [folios, filteredFolios, selectedFolioId],
  );

  const isDetailLoaded = selectedFolioId !== "" && loadedFolioId === selectedFolioId;
  const loading = selectedFolioId !== "" && !isDetailLoaded;
  const activeSummary = isDetailLoaded ? summary : null;
  const activeItems = isDetailLoaded ? items : [];

  useEffect(() => {
    if (!selectedFolioId) return;

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
        void Swal.fire({
          icon: "error",
          title: "Không thể tải chi tiết folio",
          text: error instanceof Error ? error.message : "Vui lòng thử lại.",
          confirmButtonColor: "#17201b",
        });
      });

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
      confirmButtonColor: "#17201b",
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
        await Swal.fire({ icon: "success", title: "Đã thu tiền và đóng phòng", confirmButtonColor: "#17201b" });
      } else {
        await requestInternalApiEnvelope(`${apiBase}/invoices/${encodeURIComponent(invoice.id)}/manual-payment`, {
          method: "POST",
          body: { method: "MANUAL", note: "Đóng checkout không còn số dư" },
        });
        await Swal.fire({ icon: "success", title: "Đã đóng phòng không còn số dư", confirmButtonColor: "#17201b" });
      }
      router.refresh();
    } catch (error) {
      await Swal.fire({ icon: "error", title: "Không thể hoàn tất checkout", text: error instanceof Error ? error.message : "Vui lòng thử lại.", confirmButtonColor: "#17201b" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[340px_1fr_320px] items-start">
      {/* CỘT TÁI CHÍNH 1: HÀNG ĐỢI FOLIO / PHÒNG CHỜ THANH TOÁN */}
      <aside className="flex flex-col min-h-0 overflow-hidden rounded-2xl border border-[var(--outline-variant)] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        <div className="space-y-3 border-b border-[var(--outline-variant)] bg-[var(--surface-container-lowest,#fdfbf7)] p-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--secondary)]">HÀNG ĐỢI THANH TOÁN</p>
            <h2 className="vs-display mt-0.5 text-xl font-bold text-[var(--primary)]">Danh sách phòng</h2>
          </div>

          {/* Search bar */}
          <div className="relative">
            <VsIcon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-[var(--outline)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm số phòng, tên khách..."
              className="h-9 w-full rounded-xl border-0 bg-[var(--surface-container-low,#f4efe6)] pl-9 pr-3 text-xs outline-none ring-1 ring-transparent focus:ring-[var(--primary)]"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setStatusFilter("ALL")}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${statusFilter === "ALL" ? "bg-[#17201b] text-white" : "bg-[var(--surface-container-low)] text-[var(--on-surface-variant)] hover:bg-gray-200"}`}
            >
              Tất cả ({folios.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("CHECKOUT_PENDING")}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${statusFilter === "CHECKOUT_PENDING" ? "bg-amber-700 text-white" : "bg-amber-50 text-amber-800 hover:bg-amber-100"}`}
            >
              Chờ checkout
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("OPEN")}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${statusFilter === "OPEN" ? "bg-emerald-700 text-white" : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"}`}
            >
              Đang mở
            </button>
          </div>
        </div>

        {/* List items */}
        <div className="max-h-[calc(100vh-21rem)] min-h-[460px] flex-1 overflow-y-auto divide-y divide-[var(--outline-variant)]/40">
          {filteredFolios.map((folio) => {
            const isSelected = selectedFolioId === folio.id;
            const badge = getStatusBadge(folio.status);
            return (
              <button
                key={folio.id}
                type="button"
                onClick={() => setSelectedFolioId(folio.id)}
                className={`w-full p-3.5 text-left transition-all ${
                  isSelected
                    ? "bg-[#17201b]/10 border-l-4 border-l-[var(--primary)]"
                    : "hover:bg-[var(--surface-container-low)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="rounded-md bg-[var(--primary)] px-2 py-0.5 text-xs font-extrabold text-white shadow-xs">
                    {displayRoom(folio)}
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge.colorClass}`}>
                    {badge.label}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm text-[var(--primary)] truncate">{displayGuest(folio)}</p>
                    <p className="text-[11px] text-[var(--on-surface-variant)] truncate font-mono">{folio.folioNumber ?? folio.id}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-extrabold text-[var(--primary)]">
                      {formatMoney(toNumber(folio.total ?? folio.totalAmount), folio.currency ?? "VND")}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}

          {filteredFolios.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--on-surface-variant)]">
              Không tìm thấy folio phù hợp với bộ lọc.
            </div>
          ) : null}
        </div>
      </aside>

      {/* CỘT CENTRAL 2: CHI TIẾT FOLIO & DANH SÁCH CHI PHÍ */}
      <main className="flex flex-col overflow-hidden rounded-2xl border border-[var(--outline-variant)] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        {/* Header Chi Tiết */}
        <div className="flex flex-col gap-2 border-b border-[var(--outline-variant)] bg-[var(--surface-container-lowest,#fdfbf7)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--primary)] text-white font-extrabold text-sm shadow-sm shrink-0">
              {selectedFolio?.room?.roomNumber ?? "..."}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="vs-display text-xl font-bold text-[var(--primary)]">{displayRoom(selectedFolio)}</h2>
                <span className="rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold">
                  {displayGuest(selectedFolio)}
                </span>
              </div>
              <p className="text-xs text-[var(--on-surface-variant)]">
                Mã Folio: <span className="font-mono font-semibold text-[var(--primary)]">{selectedFolio?.folioNumber ?? selectedFolio?.id ?? "-"}</span>
              </p>
            </div>
          </div>
          <div className="text-left sm:text-right text-xs text-[var(--on-surface-variant)]">
            <p>Mở lúc: <span className="font-semibold text-[var(--primary)]">{formatDate(selectedFolio?.openedAt ?? selectedFolio?.createdAt)}</span></p>
          </div>
        </div>

        {/* Bảng Dịch Vụ & Chi Phí (Fluent Fluid Layout - Proportional Column Widths) */}
        <div className="flex-1 overflow-x-auto min-h-[380px]">
          <table className="w-full text-left text-sm border-collapse table-fixed">
            <thead className="border-b border-[var(--outline-variant)] bg-[var(--surface-container-low,#f4efe6)] text-[11px] font-bold uppercase tracking-wider text-[var(--on-surface-variant)]">
              <tr>
                <th className="py-3 px-4 w-[40%]">Tên chi phí / Dịch vụ</th>
                <th className="py-3 px-4 text-center w-[16%]">Số lượng</th>
                <th className="py-3 px-4 text-right w-[22%]">Đơn giá</th>
                <th className="py-3 px-4 text-right w-[22%]">Thành tiền</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--outline-variant)]/50 text-xs">
              {activeItems.map((item) => (
                <tr key={item.id} className="transition hover:bg-slate-50/80">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface-container-low,#f4efe6)] text-[var(--primary)] shrink-0">
                        <VsIcon name={getItemIcon(item.itemType)} className="text-lg" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-[var(--primary)] truncate">{item.nameSnapshot}</p>
                        <span className="inline-block text-[10px] font-semibold text-[var(--secondary)] bg-amber-50 border border-amber-200/60 rounded px-1.5 py-0.5 mt-0.5">
                          {item.itemType === "ROOM_CHARGE" ? "Tiền phòng" : item.itemType === "SERVICE" ? "Dịch vụ" : item.itemType}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-center font-bold text-sm">{item.quantity}</td>
                  <td className="py-3.5 px-4 text-right text-[var(--on-surface-variant)]">{formatMoney(toNumber(item.unitPriceSnapshot), item.currency)}</td>
                  <td className="py-3.5 px-4 text-right font-extrabold text-sm text-[var(--primary)]">{formatMoney(toNumber(item.totalSnapshot), item.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {!loading && activeItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-[var(--on-surface-variant)]">
              <VsIcon name="receipt_long" className="text-4xl text-[var(--outline)] mb-2" />
              <p className="text-sm font-bold text-[var(--primary)]">Chưa có phí dịch vụ ghi nhận trong folio</p>
              <p className="text-xs mt-1 text-[var(--on-surface-variant)] max-w-sm">
                Tiền phòng sẽ được hệ thống tính tự động dựa trên thời gian thực tế khi tiến hành checkout.
              </p>
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center justify-center gap-2 p-12 text-xs font-semibold text-[var(--on-surface-variant)]">
              <VsIcon name="progress_activity" className="animate-spin text-lg text-[var(--primary)]" />
              Đang tải chi tiết phí phòng...
            </div>
          ) : null}
        </div>
      </main>

      {/* CỘT RIGHT 3: TỔNG TIỀN & XÁC NHẬN THU THỦ TỤC */}
      <aside className="space-y-4">
        {/* Luxurious Orange-Yellow Golden Checkout Card */}
        <div className="rounded-2xl border border-[#d4af37]/35 bg-gradient-to-br from-[#2a1b08] via-[#38240b] to-[#1a1004] p-5 text-white shadow-xl">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#fce8b3]/70">TỔNG THÀNH TIỀN CHECKOUT</p>
            <span className="rounded-full bg-[#f59e0b]/20 px-2.5 py-0.5 text-[10px] font-extrabold text-[#ffe270] border border-[#f59e0b]/40">
              VND
            </span>
          </div>
          <p className="vs-display mt-2 text-3xl font-extrabold text-[#ffe270] drop-shadow-sm">
            {formatMoney(toNumber(activeSummary?.total ?? selectedFolio?.total ?? 0), activeSummary?.currency ?? selectedFolio?.currency ?? "VND")}
          </p>

          <dl className="mt-4 space-y-2.5 border-t border-[#d4af37]/20 pt-3.5 text-xs text-[#fff3d1]/90">
            <div className="flex justify-between">
              <dt className="text-[#fce8b3]/60">Tạm tính dịch vụ</dt>
              <dd className="font-semibold">{formatMoney(toNumber(activeSummary?.subtotal ?? 0), activeSummary?.currency ?? "VND")}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#fce8b3]/60">Thuế (VAT)</dt>
              <dd className="font-semibold">{formatMoney(toNumber(activeSummary?.tax ?? 0), activeSummary?.currency ?? "VND")}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#fce8b3]/60">Giảm giá & Khuyến mãi</dt>
              <dd className="font-semibold text-[#fef08a]">-{formatMoney(toNumber(activeSummary?.discount ?? 0), activeSummary?.currency ?? "VND")}</dd>
            </div>
          </dl>

          {selectedFolio?.status === "CLOSED" ? (
            <button
              type="button"
              onClick={async () => {
                const invoiceId = getFolioInvoiceId(selectedFolio);
                if (!invoiceId) {
                  void Swal.fire({
                    icon: "warning",
                    title: "Chưa có mã hóa đơn",
                    text: `Folio ${selectedFolio?.folioNumber ?? selectedFolio?.id} đã đóng nhưng chưa có thông tin hóa đơn.`,
                    confirmButtonText: "Đã hiểu",
                    confirmButtonColor: "#8c5e00",
                  });
                  return;
                }
                const result = await Swal.fire({
                  icon: "question",
                  title: "Xuất hóa đơn?",
                  text: "Hệ thống sẽ chuyển sang trang chi tiết để in và xuất hóa đơn.",
                  showCancelButton: true,
                  confirmButtonText: "Đồng ý",
                  cancelButtonText: "Hủy",
                  confirmButtonColor: "#8c5e00",
                  cancelButtonColor: "#64748b",
                });
                if (result.isConfirmed) {
                  router.push(`/hotels/${encodeURIComponent(hotelId)}/billing/invoices/${encodeURIComponent(invoiceId)}`);
                }
              }}
              disabled={!selectedFolioId}
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#fbbf24] via-[#f59e0b] to-[#d97706] px-4 text-xs font-black text-[#1c1204] shadow-lg shadow-amber-950/40 transition hover:from-[#f59e0b] hover:to-[#b45309] disabled:opacity-50"
            >
              <VsIcon name="description" className="text-base" />
              Xem & xuất hóa đơn
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void issueInvoiceAndCollect()}
              disabled={!selectedFolioId || !canManage || saving}
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#fbbf24] via-[#f59e0b] to-[#d97706] px-4 text-xs font-black text-[#1c1204] shadow-lg shadow-amber-950/40 transition hover:from-[#f59e0b] hover:to-[#b45309] disabled:opacity-50"
            >
              <VsIcon name={saving ? "sync" : "payments"} className={`text-base ${saving ? "animate-spin" : ""}`} />
              {saving ? "Đang xử lý checkout..." : "Phát hành & thu tiền"}
            </button>
          )}
        </div>

        {/* Quy trình checkout */}
        <div className="rounded-2xl border border-[var(--outline-variant)] bg-white p-4 space-y-2">
          <h3 className="vs-display text-sm font-bold text-[var(--primary)] flex items-center gap-1.5">
            <VsIcon name="info" className="text-amber-600 text-base" />
            Quy trình Checkout & Đóng Stay
          </h3>
          <ul className="text-xs text-[var(--on-surface-variant)] space-y-2 pl-1">
            <li className="flex items-start gap-2">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-800">1</span>
              <span>Lễ tân kiểm tra chi phí và nhấn <strong>Phát hành & thu tiền</strong>.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-800">2</span>
              <span>Backend tự động đóng stay và khóa phiên QR GuestOS của phòng.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-800">3</span>
              <span>Trạng thái phòng tự động chuyển sang <strong>Chờ dọn dẹp (DIRTY)</strong>.</span>
            </li>
          </ul>
          <div className="pt-2 border-t border-[var(--outline-variant)]/40 mt-3">
            <button
              type="button"
              onClick={() => router.push(`/hotels/${encodeURIComponent(hotelId)}/rooms?status=processing`)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 transition hover:bg-amber-100"
            >
              <VsIcon name="cleaning_services" className="text-base text-amber-700" />
              Đến trang Dọn phòng & Chuyển TRỐNG →
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
