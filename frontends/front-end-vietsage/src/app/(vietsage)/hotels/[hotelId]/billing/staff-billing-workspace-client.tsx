"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import Swal from "sweetalert2";

import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type {
  FolioItem,
  FolioListItem,
  FolioSummary,
  Invoice,
} from "@/features/billing/types/billing-contract";
import { formatMoney } from "@/features/billing/utils/money";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { invalidateHotelRealtimeQueries } from "@/features/hotel-ops/utils/invalidate-hotel-realtime-queries";
import { useOwnerRequestRealtime } from "@/features/request-realtime/use-owner-request-realtime";

type Props = {
  hotelId: string;
  folios: FolioListItem[];
  canManage: boolean;
};

type FolioItemsPage = {
  items: FolioItem[];
};

type StatusFilter = "ALL" | "CHECKOUT_PENDING" | "OPEN" | "CLOSED";
type ReconciliationChoice = {
  action: "provided" | "cancelled" | "";
  cancelReason: string;
};

function isFolioItemVoided(item: FolioItem): boolean {
  return (
    Boolean(item.voidedAt) ||
    item.status === "VOID" ||
    item.status === "VOIDED" ||
    item.status === "CANCELLED"
  );
}

function parseFormattedNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const rawDigits = value.replace(/\D/g, "");
    return rawDigits ? parseInt(rawDigits, 10) : 0;
  }
  return 0;
}

const toNumber = parseFormattedNumber;

function formatNumberInput(value: string | number): string {
  if (value === "" || value === null || value === undefined) return "";
  const rawDigits = String(value).replace(/\D/g, "");
  if (!rawDigits) return "";
  const num = parseInt(rawDigits, 10);
  if (isNaN(num)) return "";
  return new Intl.NumberFormat("vi-VN").format(num);
}

function formatNumberOrPercentInput(value: string | number): string {
  if (value === "" || value === null || value === undefined) return "";
  const str = String(value).trim();
  if (str.endsWith("%") || str.includes("%")) {
    const rawDigits = str.replace(/\D/g, "");
    return rawDigits ? `${rawDigits}%` : "";
  }
  return formatNumberInput(str);
}

type ParsedAmountResult = {
  amount: number;
  isPercentage: boolean;
  percentage: number;
};

function parseAmountOrPercentage(
  input: string | number,
  subtotal: number,
): ParsedAmountResult {
  if (input === "" || input === null || input === undefined) {
    return { amount: 0, isPercentage: false, percentage: 0 };
  }
  if (typeof input === "number") {
    return { amount: input, isPercentage: false, percentage: 0 };
  }
  const str = input.trim();
  if (str.includes("%")) {
    const rawDigits = str.replace(/\D/g, "");
    const percentage = rawDigits ? parseInt(rawDigits, 10) : 0;
    const amount = Math.round((subtotal * percentage) / 100);
    return { amount, isPercentage: true, percentage };
  }
  const amount = parseFormattedNumber(str);
  return { amount: isNaN(amount) ? 0 : amount, isPercentage: false, percentage: 0 };
}

function getStatusBadge(status: string | undefined) {
  if (status === "OPEN") {
    return {
      label: "Đang mở",
      colorClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  }
  if (status === "CHECKOUT_PENDING") {
    return {
      label: "Chờ checkout",
      colorClass: "bg-amber-50 text-amber-800 border-amber-200 animate-pulse",
    };
  }
  if (status === "CLOSED") {
    return {
      label: "Đã đóng",
      colorClass: "bg-slate-100 text-slate-700 border-slate-200",
    };
  }
  if (status === "VOID") {
    return {
      label: "Đã hủy",
      colorClass: "bg-red-50 text-red-700 border-red-200",
    };
  }
  return {
    label: status ?? "-",
    colorClass: "bg-gray-100 text-gray-600 border-gray-200",
  };
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
  return folio?.room?.roomNumber
    ? `Phòng ${folio.room.roomNumber}`
    : "Chưa rõ phòng";
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

export function StaffBillingWorkspaceClient({
  hotelId,
  folios,
  canManage,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const apiBase = `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/billing`;

  const queryRoomNumber = searchParams?.get("roomNumber") ?? searchParams?.get("room") ?? "";
  const queryFolioId = searchParams?.get("folioId") ?? searchParams?.get("folio") ?? "";
  const queryStayId = searchParams?.get("stayId") ?? searchParams?.get("stay") ?? "";
  const queryRoomId = searchParams?.get("roomId") ?? "";

  const initialFolio = useMemo(() => {
    if (queryFolioId) {
      const found = folios.find((f) => f.id === queryFolioId);
      if (found) return found;
    }
    if (queryStayId) {
      const found = folios.find(
        (f) => f.stayId === queryStayId || f.stay?.id === queryStayId,
      );
      if (found) return found;
    }
    if (queryRoomId) {
      const found = folios.find((f) => f.room?.id === queryRoomId);
      if (found) return found;
    }
    if (queryRoomNumber) {
      const found = folios.find(
        (f) =>
          f.room?.roomNumber?.toLowerCase() === queryRoomNumber.toLowerCase(),
      );
      if (found) return found;
    }
    return folios[0] ?? null;
  }, [folios, queryFolioId, queryStayId, queryRoomId, queryRoomNumber]);

  const [selectedFolioId, setSelectedFolioId] = useState(
    () => initialFolio?.id ?? "",
  );
  const [summary, setSummary] = useState<FolioSummary | null>(
    initialFolio ?? null,
  );
  const [items, setItems] = useState<FolioItem[]>([]);
  const [loadedFolioId, setLoadedFolioId] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [reconciliations, setReconciliations] = useState<
    Record<string, ReconciliationChoice>
  >({});
  const [checkoutError, setCheckoutError] = useState("");

  const filteredFolios = useMemo(() => {
    return folios.filter((folio) => {
      const roomStr = folio.room?.roomNumber?.toLowerCase() ?? "";
      const guestStr = folio.stay?.guestNameSnapshot?.toLowerCase() ?? "";
      const folioCode = (folio.folioNumber ?? folio.id).toLowerCase();
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        roomStr.includes(q) ||
        guestStr.includes(q) ||
        folioCode.includes(q);

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "CHECKOUT_PENDING" &&
          folio.status === "CHECKOUT_PENDING") ||
        (statusFilter === "OPEN" && folio.status === "OPEN") ||
        (statusFilter === "CLOSED" && folio.status === "CLOSED");

      return matchesSearch && matchesStatus;
    });
  }, [folios, search, statusFilter]);

  const [discountInput, setDiscountInput] = useState<string>("");
  const [surchargeInput, setSurchargeInput] = useState<string>("");
  const [discountNote, setDiscountNote] = useState<string>("");
  const [surchargeNote, setSurchargeNote] = useState<string>("");
  const [cashGivenInput, setCashGivenInput] = useState<string>("");

  const selectedFolio = useMemo(
    () =>
      folios.find((folio) => folio.id === selectedFolioId) ??
      filteredFolios[0] ??
      folios[0],
    [folios, filteredFolios, selectedFolioId],
  );

  const isDetailLoaded =
    selectedFolioId !== "" && loadedFolioId === selectedFolioId;
  const loading = selectedFolioId !== "" && !isDetailLoaded;
  const activeSummary = isDetailLoaded ? summary : null;
  const activeItems = useMemo(
    () => (isDetailLoaded ? items : []),
    [isDetailLoaded, items],
  );

  const [prevSummary, setPrevSummary] = useState<FolioSummary | null>(null);
  if (activeSummary !== prevSummary) {
    setPrevSummary(activeSummary);
    if (activeSummary) {
      setDiscountInput(
        activeSummary.discount ? String(activeSummary.discount) : "0",
      );
    }
  }

  const currency = activeSummary?.currency ?? selectedFolio?.currency ?? "VND";
  const subtotal = toNumber(activeSummary?.subtotal ?? 0);
  const tax = toNumber(activeSummary?.tax ?? 0);

  const roomChargeTotal = useMemo(() => {
    return activeItems
      .filter((item) => item.itemType === "ROOM_CHARGE" && !isFolioItemVoided(item))
      .reduce((sum, item) => sum + toNumber(item.totalSnapshot), 0);
  }, [activeItems]);

  const serviceChargeTotal = useMemo(() => {
    return activeItems
      .filter((item) => item.itemType === "SERVICE" && !isFolioItemVoided(item))
      .reduce((sum, item) => sum + toNumber(item.totalSnapshot), 0);
  }, [activeItems]);

  const discountParsed = parseAmountOrPercentage(discountInput, subtotal);
  const surchargeParsed = parseAmountOrPercentage(surchargeInput, subtotal);

  const discountVal = Math.max(0, discountParsed.amount);
  const surchargeVal = Math.max(0, surchargeParsed.amount);
  const computedTotal = Math.max(
    0,
    subtotal + tax + surchargeVal - discountVal,
  );

  const refreshActiveFolio = useCallback(async () => {
    if (!selectedFolioId) return;
    try {
      const [summaryResponse, itemsResponse] = await Promise.all([
        requestInternalApiEnvelope<FolioSummary>(
          `${apiBase}/folios/${encodeURIComponent(selectedFolioId)}/summary`,
          { method: "GET" },
        ),
        requestInternalApiEnvelope<FolioItemsPage>(
          `${apiBase}/folios/${encodeURIComponent(selectedFolioId)}/items?page=1&limit=100`,
          { method: "GET" },
        ),
      ]);
      setSummary(summaryResponse.data);
      setItems(itemsResponse.data.items);
      setLoadedFolioId(selectedFolioId);
    } catch {
      // Background refresh silent catch
    }
  }, [apiBase, selectedFolioId]);

  useEffect(() => {
    if (!selectedFolioId) return;

    let cancelled = false;
    Promise.all([
      requestInternalApiEnvelope<FolioSummary>(
        `${apiBase}/folios/${encodeURIComponent(selectedFolioId)}/summary`,
        { method: "GET" },
      ),
      requestInternalApiEnvelope<FolioItemsPage>(
        `${apiBase}/folios/${encodeURIComponent(selectedFolioId)}/items?page=1&limit=100`,
        { method: "GET" },
      ),
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

    const interval = setInterval(() => {
      if (!document.hidden) {
        void refreshActiveFolio();
        router.refresh();
      }
    }, 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [apiBase, selectedFolioId, refreshActiveFolio, router]);

  const realtimeHandlers = useMemo(
    () => ({
      onUpdated: () => {
        void refreshActiveFolio();
        router.refresh();
      },
      onReconnect: () => {
        void refreshActiveFolio();
        router.refresh();
      },
    }),
    [refreshActiveFolio, router],
  );

  useOwnerRequestRealtime(hotelId, realtimeHandlers, { showConnectionToasts: false });

  async function issueInvoiceAndCollect() {
    if (!selectedFolioId || !canManage) return;
    const activeRequests = activeSummary?.activeServiceRequests ?? [];
    const unresolved = activeRequests.find((request) => {
      const choice = reconciliations[request.id];
      return !choice?.action;
    });
    if (unresolved) {
      setCheckoutError(
        `Vui lòng xác nhận xử lý dịch vụ “${unresolved.name}” trước khi xuất hóa đơn.`,
      );
      return;
    }
    setCheckoutError("");
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
      const invoiceResponse = await requestInternalApiEnvelope<Invoice>(
        `${apiBase}/folios/${encodeURIComponent(selectedFolioId)}/invoice`,
        {
          method: "POST",
          body: {
            reconciliations: activeRequests.map((request) => ({
              requestId: request.id,
              action: reconciliations[request.id].action,
            })),
          },
        },
      );
      const invoice = invoiceResponse.data;
      if (toNumber(invoice.balanceAmount ?? invoice.totalAmount) > 0) {
        await requestInternalApiEnvelope(
          `${apiBase}/invoices/${encodeURIComponent(invoice.id)}/manual-payment`,
          {
            method: "POST",
            body: { method: "CASH", note: "Thu tại quầy lễ tân" },
          },
        );
        await Swal.fire({
          icon: "success",
          title: "Thành công",
          text: "Đã thu tiền và đóng phòng",
          confirmButtonColor: "#17201b",
        });
      } else {
        await requestInternalApiEnvelope(
          `${apiBase}/invoices/${encodeURIComponent(invoice.id)}/manual-payment`,
          {
            method: "POST",
            body: { method: "MANUAL", note: "Đóng checkout không còn số dư" },
          },
        );
        await Swal.fire({
          icon: "success",
          title: "Thành công",
          text: "Đã đóng phòng không còn số dư",
          confirmButtonColor: "#17201b",
        });
      }
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
      router.refresh();
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "Không thể hoàn tất checkout",
        text: error instanceof Error ? error.message : "Vui lòng thử lại.",
        confirmButtonColor: "#17201b",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[340px_1fr_320px] items-stretch">
      {/* CỘT TÁI CHÍNH 1: HÀNG ĐỢI FOLIO / PHÒNG CHỜ THANH TOÁN */}
      <aside className="flex h-full flex-col min-h-0 overflow-hidden rounded-2xl border border-[var(--outline-variant)] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        <div className="space-y-3.5 border-b border-[var(--outline-variant)] bg-[var(--surface-container-lowest,#fdfbf7)] p-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--secondary)]">
              HÀNG ĐỢI THANH TOÁN
            </p>
            <h2 className="vs-display mt-0.5 text-xl font-black text-[var(--primary)]">
              Danh sách phòng
            </h2>
          </div>

          {/* Search bar */}
          <div className="relative">
            <VsIcon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xl text-[var(--outline)]"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm số phòng (ví dụ: 101, 202...)"
              className="h-10.5 w-full rounded-xl border-0 bg-[var(--surface-container-low,#f4efe6)] pl-10 pr-3.5 text-xs font-semibold outline-none ring-1 ring-transparent focus:ring-[var(--primary)]"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setStatusFilter("ALL")}
              className={`rounded-xl px-3 py-1.5 text-xs font-extrabold transition ${statusFilter === "ALL" ? "bg-[#17201b] text-white shadow-xs" : "bg-[var(--surface-container-low)] text-[var(--on-surface-variant)] hover:bg-gray-200"}`}
            >
              Tất cả ({folios.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("CHECKOUT_PENDING")}
              className={`rounded-xl px-3 py-1.5 text-xs font-extrabold transition ${statusFilter === "CHECKOUT_PENDING" ? "bg-amber-700 text-white shadow-xs" : "bg-amber-50 text-amber-900 border border-amber-200/80 hover:bg-amber-100"}`}
            >
              Chờ checkout
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("OPEN")}
              className={`rounded-xl px-3 py-1.5 text-xs font-extrabold transition ${statusFilter === "OPEN" ? "bg-emerald-700 text-white shadow-xs" : "bg-emerald-50 text-emerald-900 border border-emerald-200/80 hover:bg-emerald-100"}`}
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
                className={`w-full p-4 text-left transition-all ${
                  isSelected
                    ? "bg-[#17201b]/10 border-l-4 border-l-[var(--primary)]"
                    : "hover:bg-[var(--surface-container-low)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="rounded-lg bg-[var(--primary)] px-2.5 py-1 text-xs font-black text-white shadow-xs">
                    {displayRoom(folio)}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-extrabold ${badge.colorClass}`}
                  >
                    {badge.label}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-base text-[var(--primary)] truncate">
                      {displayGuest(folio)}
                    </p>
                    <p className="text-xs text-[var(--on-surface-variant)] truncate font-mono font-bold">
                      {folio.folioNumber ?? folio.id}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-black text-[var(--primary)]">
                      {formatMoney(
                        toNumber(folio.total ?? folio.totalAmount),
                        folio.currency ?? "VND",
                      )}
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
      <main className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--outline-variant)] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        {/* Header Chi Tiết */}
        <div className="flex flex-col gap-3 border-b border-[var(--outline-variant)] bg-[var(--surface-container-lowest,#fdfbf7)] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5 min-w-0">
            {/* Custom Luxury VietSage "V" Crest Emblem Badge */}
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2a1b08] via-[#38240b] to-[#140b02] shadow-lg shrink-0 border border-[#d4af37]/60 relative overflow-hidden group">
              <svg
                viewBox="0 0 40 40"
                className="h-7 w-7 relative z-10 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <linearGradient
                    id="vGoldGrad"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#fffbeb" />
                    <stop offset="35%" stopColor="#fef08a" />
                    <stop offset="70%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#b45309" />
                  </linearGradient>
                  <linearGradient
                    id="vAccentGrad"
                    x1="0%"
                    y1="100%"
                    x2="100%"
                    y2="0%"
                  >
                    <stop offset="0%" stopColor="#d4af37" />
                    <stop offset="100%" stopColor="#ffe270" />
                  </linearGradient>
                </defs>

                {/* Sharp Architectural Luxury "V" Path */}
                <path
                  d="M7 9 L17.5 32 C18.2 33.5 19.8 33.5 20.5 32 L31 9 C31.5 7.8 30.6 6.5 29.3 6.5 L24.5 6.5 C23.8 6.5 23.2 6.9 22.9 7.5 L19 18.5 L15.1 7.5 C14.8 6.9 14.2 6.5 13.5 6.5 L8.7 6.5 C7.4 6.5 6.5 7.8 7 9 Z"
                  fill="url(#vGoldGrad)"
                />

                {/* Inner Facet Highlight for 3D Polished Gold Effect */}
                <path
                  d="M19 18.5 L24.5 6.5 L29.3 6.5 L20.5 32 C19.8 33.5 18.2 33.5 17.5 32 L19 18.5 Z"
                  fill="url(#vAccentGrad)"
                  opacity="0.75"
                />

                {/* Diamond Star Accent on Top */}
                <path
                  d="M19 2.5 L20 4.5 L22 5.5 L20 6.5 L19 8.5 L18 6.5 L16 5.5 L18 4.5 Z"
                  fill="#fef08a"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="vs-display text-2xl font-extrabold text-[var(--primary)] tracking-tight">
                  {displayRoom(selectedFolio)}
                </h2>
                <span className="rounded-full bg-emerald-100/90 text-emerald-900 border border-emerald-300/80 px-3 py-1 text-xs font-black shadow-xs">
                  {displayGuest(selectedFolio)}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--on-surface-variant)] flex items-center gap-2">
                <span>
                  Mã Folio:{" "}
                  <span className="font-mono text-sm font-bold text-[var(--primary)]">
                    {selectedFolio?.folioNumber ?? selectedFolio?.id ?? "-"}
                  </span>
                </span>
              </p>
            </div>
          </div>
          <div className="text-left sm:text-right text-xs font-medium text-[var(--on-surface-variant)] shrink-0">
            <p>
              Mở lúc:{" "}
              <span className="font-bold text-sm text-[var(--primary)]">
                {formatDate(
                  selectedFolio?.openedAt ?? selectedFolio?.createdAt,
                )}
              </span>
            </p>
          </div>
        </div>

        {/* Bảng Dịch Vụ & Chi Phí (Fluent Fluid Layout - Proportional Column Widths) */}
        <div className="flex-1 flex flex-col overflow-x-auto min-h-[380px]">
          <table className="w-full text-left text-sm border-collapse table-fixed">
            <thead className="border-b border-[var(--outline-variant)] bg-[var(--surface-container-low,#f4efe6)] text-xs font-black uppercase tracking-wider text-[var(--on-surface-variant)]">
              <tr>
                <th className="py-3.5 px-4 w-[35%] whitespace-nowrap">
                  Tên chi phí / Dịch vụ
                </th>
                <th className="py-3.5 px-4 text-center w-[15%] whitespace-nowrap">
                  Số lượng
                </th>
                <th className="py-3.5 px-4 text-right w-[18%] whitespace-nowrap">
                  Đơn giá
                </th>
                <th className="py-3.5 px-4 text-right w-[18%] whitespace-nowrap">
                  Thành tiền
                </th>
                <th className="py-3.5 px-4 text-center w-[14%] whitespace-nowrap">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--outline-variant)]/50 text-sm">
              {activeItems.map((item) => {
                const isVoided = item.status === "VOID";
                return (
                  <tr
                    key={item.id}
                    className={`transition ${isVoided ? "bg-red-50/50 opacity-60 line-through" : "hover:bg-slate-50/80"}`}
                  >
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 border border-amber-200/80 text-[var(--primary)] shrink-0 shadow-2xs">
                          <VsIcon
                            name={getItemIcon(item.itemType)}
                            className="text-xl"
                          />
                        </span>
                        <div className="min-w-0">
                          <p className="font-extrabold text-base text-[var(--primary)] truncate">
                            {item.nameSnapshot}
                          </p>
                          <span className="inline-block text-xs font-extrabold text-[var(--secondary)] bg-amber-50 border border-amber-200/80 rounded-md px-2.5 py-0.5 mt-0.5">
                            {item.itemType === "ROOM_CHARGE"
                              ? "Tiền phòng"
                              : item.itemType === "SERVICE"
                                ? "Dịch vụ"
                                : item.itemType === "DISCOUNT"
                                  ? "Giảm giá"
                                  : item.itemType === "MANUAL_CHARGE"
                                    ? "Phụ thu"
                                    : item.itemType}
                          </span>
                          {isVoided ? (
                            <span className="ml-1 inline-block text-xs font-bold text-red-700 bg-red-100 rounded px-1.5 py-0.5">
                              Đã hủy
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center font-black text-base">
                      {item.quantity}
                    </td>
                    <td className="py-4 px-4 text-right font-medium text-slate-600">
                      {formatMoney(
                        toNumber(item.unitPriceSnapshot),
                        item.currency,
                      )}
                    </td>
                    <td className="py-4 px-4 text-right font-black text-base text-[var(--primary)]">
                      {formatMoney(toNumber(item.totalSnapshot), item.currency)}
                    </td>
                    <td className="py-4 px-4 text-center">
                      {canManage &&
                      selectedFolio?.status === "OPEN" &&
                      !isVoided &&
                      item.itemType !== "ROOM_CHARGE" ? (
                        <button
                          type="button"
                          title="Hủy khoản mục này"
                          onClick={async () => {
                            const res = await Swal.fire({
                              icon: "warning",
                              title: "Hủy khoản thu này?",
                              text: `Xác nhận hủy mục "${item.nameSnapshot}" trên folio.`,
                              input: "text",
                              inputPlaceholder: "Lý do hủy (không bắt buộc)",
                              showCancelButton: true,
                              confirmButtonText: "Hủy khoản thu",
                              cancelButtonText: "Quay lại",
                              confirmButtonColor: "#dc2626",
                            });
                            if (!res.isConfirmed) return;
                            try {
                              await requestInternalApiEnvelope(
                                `${apiBase}/folios/${encodeURIComponent(selectedFolioId)}/items/${encodeURIComponent(item.id)}/void`,
                                {
                                  method: "POST",
                                  body: {
                                    reason:
                                      res.value || "Hủy theo yêu cầu thu ngân",
                                  },
                                },
                              );
                              const [summaryRes, itemsRes] = await Promise.all([
                                requestInternalApiEnvelope<FolioSummary>(
                                  `${apiBase}/folios/${encodeURIComponent(selectedFolioId)}/summary`,
                                  { method: "GET" },
                                ),
                                requestInternalApiEnvelope<FolioItemsPage>(
                                  `${apiBase}/folios/${encodeURIComponent(selectedFolioId)}/items?page=1&limit=100`,
                                  { method: "GET" },
                                ),
                              ]);
                              setSummary(summaryRes.data);
                              setItems(itemsRes.data.items);
                              await invalidateHotelRealtimeQueries(queryClient, hotelId);
                              router.refresh();
                              void Swal.fire({
                                icon: "success",
                                title: "Đã hủy khoản mục thành công",
                                toast: true,
                                position: "top-end",
                                timer: 2000,
                                showConfirmButton: false,
                              });
                            } catch (err) {
                              void Swal.fire({
                                icon: "error",
                                title: "Không thể hủy khoản mục",
                                text:
                                  err instanceof Error
                                    ? err.message
                                    : "Vui lòng thử lại",
                                confirmButtonColor: "#17201b",
                              });
                            }
                          }}
                          className="inline-flex items-center justify-center h-7 px-2 text-[11px] font-bold rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition"
                        >
                          <VsIcon name="delete" className="text-xs mr-0.5" />
                          Hủy
                        </button>
                      ) : (
                        <span className="text-[11px] text-[var(--on-surface-variant)]">
                          -
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!loading && activeItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-[var(--on-surface-variant)]">
              <VsIcon
                name="receipt_long"
                className="text-4xl text-[var(--outline)] mb-2"
              />
              <p className="text-sm font-bold text-[var(--primary)]">
                Chưa có phí dịch vụ ghi nhận trong folio
              </p>
              <p className="text-xs mt-1 text-[var(--on-surface-variant)] max-w-sm">
                Tiền phòng sẽ được hệ thống tính tự động dựa trên thời gian thực
                tế khi tiến hành checkout.
              </p>
            </div>
          ) : null}

          {loading ? (
            <div className="flex-1 flex items-center justify-center gap-2 p-12 text-xs font-semibold text-[var(--on-surface-variant)]">
              <VsIcon
                name="progress_activity"
                className="animate-spin text-lg text-[var(--primary)]"
              />
              Đang tải chi tiết phí phòng...
            </div>
          ) : null}
        </div>
      </main>

      {/* CỘT RIGHT 3: TỔNG TIỀN & XÁC NHẬN THU THỦ TỤC */}
      <aside className="flex h-full flex-col justify-start space-y-3">
        {/* Hướng dẫn nghiệp vụ điều chỉnh chi phí Folio (Chữ to, rõ ràng, layout chuẩn) */}
        <details className="group rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 via-amber-100/60 to-orange-50 p-3 text-amber-950 shadow-sm">
          <summary className="flex cursor-pointer items-center justify-between gap-2 font-black text-xs sm:text-sm text-amber-950 select-none">
            <span className="flex items-center gap-1.5 min-w-0">
              <VsIcon name="info" className="text-lg text-amber-700 shrink-0" />
              <span className="truncate">Hướng dẫn & Quy tắc %</span>
            </span>
            <span className="text-xs font-bold text-amber-800 shrink-0 rounded-md bg-amber-200/70 px-2 py-0.5 hover:bg-amber-300/80 transition">
              <span className="group-open:hidden">Mở rộng ▾</span>
              <span className="hidden group-open:inline">Thu gọn ▴</span>
            </span>
          </summary>
          <ul className="mt-2.5 space-y-2 border-t border-amber-200/80 pt-2.5 text-xs sm:text-sm font-medium text-amber-950 pl-1">
            <li className="flex items-start gap-2">
              <span className="text-amber-700 font-extrabold">•</span>
              <span>
                <strong className="font-black text-amber-950">Phụ thu (Tăng giá)</strong>: Nhận phòng sớm, trả trễ, ở quá số người, đền bù... (Nhập % hoặc số tiền).
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-700 font-extrabold">•</span>
              <span>
                <strong className="font-black text-amber-950">Giảm giá</strong>: Ưu đãi khách VIP, mã voucher, đền bù dịch vụ... (Nhập % hoặc số tiền).
              </span>
            </li>
            <li className="flex items-start gap-2 text-amber-950 font-bold pt-0.5">
              <span className="text-[#d97706] text-base">📊</span>
              <span>
                Tính theo <strong>%</strong>: Quy đổi dựa trên <strong>Tạm tính dịch vụ (Subtotal)</strong> của phòng.
              </span>
            </li>
            <li className="flex items-start gap-2 text-amber-950 font-bold">
              <span className="text-[#d97706] text-base">💡</span>
              <span>
                Luôn nhập <strong>diễn giải / lý do</strong> để lưu vết minh bạch trên hóa đơn thanh toán.
              </span>
            </li>
          </ul>
        </details>

        {(activeSummary?.activeServiceRequests?.length ?? 0) > 0 ? (
          <section
            aria-label="Đối soát dịch vụ chưa hoàn thành"
            className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs"
          >
            <h3 className="font-bold text-amber-950">
              Dịch vụ chưa hoàn thành
            </h3>
            <p className="mt-0.5 text-[11px] text-amber-900">
              Xác nhận thực tế cung cấp trước khi xuất hóa đơn.
            </p>
            <div className="mt-2 space-y-2">
              {activeSummary?.activeServiceRequests?.map((request) => {
                const choice = reconciliations[request.id] ?? {
                  action: "",
                  cancelReason: "",
                };
                return (
                  <div
                    key={request.id}
                    className="rounded-xl border border-amber-200 bg-white p-2.5"
                  >
                    <p className="text-xs font-bold">
                      {request.name} · SL {request.quantity}
                    </p>
                    <select
                      aria-label={`Xử lý ${request.name}`}
                      value={choice.action}
                      onChange={(event) =>
                        setReconciliations((current) => ({
                          ...current,
                          [request.id]: {
                            ...choice,
                            action: event.target
                              .value as ReconciliationChoice["action"],
                          },
                        }))
                      }
                      className="mt-1.5 h-9 w-full rounded-lg border px-2.5 text-xs"
                    >
                      <option value="">Chọn xử lý</option>
                      <option value="provided">
                        Đã cung cấp — tính vào hóa đơn
                      </option>
                      <option value="cancelled">Hủy — không tính tiền</option>
                    </select>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
        {checkoutError ? (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-800"
          >
            {checkoutError}
          </p>
        ) : null}

        {/* Luxurious Orange-Yellow Golden Checkout Card */}
        <div className="rounded-2xl border border-[#d4af37]/50 bg-gradient-to-br from-[#2a1b08] via-[#38240b] to-[#1a1004] p-5 text-white shadow-2xl space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#fce8b3]">
              TỔNG THÀNH TIỀN CHECKOUT
            </p>
            <span className="rounded-full bg-[#f59e0b]/30 px-3 py-1 text-xs font-black text-[#ffe270] border border-[#f59e0b]/60 shadow-xs">
              {currency}
            </span>
          </div>
          <p className="vs-display text-3xl sm:text-4xl font-black text-[#ffe270] tracking-tight drop-shadow-md break-words">
            {formatMoney(computedTotal, currency)}
          </p>

          <dl className="space-y-3 border-t border-[#d4af37]/30 pt-3 text-xs sm:text-sm text-[#fff3d1]">
            {/* Tiền phòng */}
            <div className="flex justify-between items-center">
              <dt className="text-amber-100/90 font-bold text-sm flex items-center gap-1">
                <span>🏨 Tiền phòng</span>
              </dt>
              <dd className="font-black text-base text-white">
                {formatMoney(roomChargeTotal, currency)}
              </dd>
            </div>

            {/* Dịch vụ & Tiện ích */}
            <div className="flex justify-between items-center">
              <dt className="text-amber-100/90 font-bold text-sm flex items-center gap-1">
                <span>🔔 Dịch vụ & Tiện ích</span>
              </dt>
              <dd className="font-black text-base text-white">
                {formatMoney(serviceChargeTotal, currency)}
              </dd>
            </div>

            {/* Tạm tính (Tiền phòng + Dịch vụ) */}
            <div className="flex justify-between items-center border-t border-[#d4af37]/20 pt-2">
              <dt className="text-amber-200/90 font-extrabold text-sm">
                Tổng tạm tính
              </dt>
              <dd className="font-black text-base text-[#ffe270]">
                {formatMoney(subtotal, currency)}
              </dd>
            </div>

            <div className="flex justify-between items-center">
              <dt className="text-amber-100/90 font-bold text-sm">Thuế (VAT)</dt>
              <dd className="font-black text-base text-white">
                {formatMoney(tax, currency)}
              </dd>
            </div>

            {/* Phụ thu (Tăng giá) */}
            <div className="space-y-2 border-t border-[#d4af37]/25 pt-3">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-amber-100 font-extrabold text-sm min-w-0 truncate">
                  Phụ thu (Tăng giá)
                </dt>
                <dd className="flex-1 min-w-0 max-w-[165px] flex gap-1.5 shrink-0">
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={selectedFolio?.status === "CLOSED"}
                    value={surchargeInput}
                    onChange={(e) =>
                      setSurchargeInput(
                        formatNumberOrPercentInput(e.target.value),
                      )
                    }
                    placeholder="0 hoặc 10%"
                    className="h-10 w-full min-w-0 rounded-xl border border-[#d4af37]/70 bg-[#1c1204] px-3 py-1 text-right text-base font-black text-[#ffe270] outline-none focus:border-[#fbbf24] focus:ring-2 focus:ring-[#fbbf24]/60 shadow-inner disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-[#2b1e0d]"
                  />
                  {canManage && selectedFolio?.status === "OPEN" ? (
                    <button
                      type="button"
                      title="Cập nhật Phụ thu vào Folio"
                      onClick={async () => {
                        const parsed = parseAmountOrPercentage(
                          surchargeInput,
                          subtotal,
                        );
                        if (parsed.amount <= 0) return;
                        const noteText = surchargeNote.trim();
                        const defaultName = parsed.isPercentage
                          ? `Phụ thu ${parsed.percentage}%`
                          : "Phụ thu thủ công";
                        const name = noteText ? `Phụ thu: ${noteText}` : defaultName;
                        try {
                          await requestInternalApiEnvelope(
                            `${apiBase}/folios/${encodeURIComponent(selectedFolioId)}/items`,
                            {
                              method: "POST",
                              body: {
                                itemType: "MANUAL_CHARGE",
                                name,
                                description: parsed.isPercentage
                                  ? `Quy đổi ${parsed.percentage}% từ Tạm tính (${formatMoney(subtotal, currency)})`
                                  : noteText || undefined,
                                amount: parsed.amount,
                                quantity: 1,
                              },
                            },
                          );
                          setSurchargeInput("");
                          setSurchargeNote("");
                          const [summaryRes, itemsRes] = await Promise.all([
                            requestInternalApiEnvelope<FolioSummary>(
                              `${apiBase}/folios/${encodeURIComponent(selectedFolioId)}/summary`,
                              { method: "GET" },
                            ),
                            requestInternalApiEnvelope<FolioItemsPage>(
                              `${apiBase}/folios/${encodeURIComponent(selectedFolioId)}/items?page=1&limit=100`,
                              { method: "GET" },
                            ),
                          ]);
                          setSummary(summaryRes.data);
                          setItems(itemsRes.data.items);
                          await invalidateHotelRealtimeQueries(queryClient, hotelId);
                          router.refresh();
                          void Swal.fire({
                            icon: "success",
                            title: "Đã thêm phụ thu vào folio",
                            toast: true,
                            position: "top-end",
                            timer: 2000,
                            showConfirmButton: false,
                          });
                        } catch (err) {
                          void Swal.fire({
                            icon: "error",
                            title: "Không thể thêm phụ thu",
                            text:
                              err instanceof Error
                                ? err.message
                                : "Vui lòng thử lại",
                            confirmButtonColor: "#17201b",
                          });
                        }
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fbbf24] text-[#1c1204] font-black text-xl hover:bg-[#f59e0b] active:scale-95 transition shrink-0 shadow-sm cursor-pointer"
                    >
                      +
                    </button>
                  ) : null}
                </dd>
              </div>

              {/* Input Diễn giải / Lý do phụ thu */}
              {canManage && selectedFolio?.status === "OPEN" ? (
                <input
                  type="text"
                  value={surchargeNote}
                  onChange={(e) => setSurchargeNote(e.target.value)}
                  placeholder="Lý do phụ thu (vd: Check-in sớm, phụ thu người ở...)"
                  className="h-9 w-full rounded-xl border border-[#d4af37]/40 bg-[#1c1204]/90 px-3 py-1 text-xs sm:text-sm font-medium text-[#ffe270] placeholder-[#d4af37]/50 outline-none focus:border-[#fbbf24] focus:ring-1 focus:ring-[#fbbf24]"
                />
              ) : null}

              {/* Hiển thị quy đổi % phụ thu */}
              {surchargeParsed.isPercentage && surchargeParsed.amount > 0 ? (
                <p className="text-xs font-bold text-right text-[#ffe270]">
                  ⚡ Quy đổi {surchargeParsed.percentage}% Tạm tính: +
                  {formatMoney(surchargeParsed.amount, currency)}
                </p>
              ) : null}

              {/* Preset chips phụ thu (CHỈ 1 DÒNG DUY NHẤT) */}
              {canManage && selectedFolio?.status === "OPEN" ? (
                <div className="flex flex-nowrap gap-1 justify-end overflow-x-auto no-scrollbar pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSurchargeInput("5%");
                      if (!surchargeNote) setSurchargeNote("Phụ thu 5%");
                    }}
                    className="rounded-lg bg-[#d4af37]/30 px-2 py-0.5 text-[11px] sm:text-xs font-bold text-[#ffe270] hover:bg-[#d4af37]/50 border border-[#d4af37]/40 transition shrink-0 whitespace-nowrap"
                  >
                    +5%
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSurchargeInput("10%");
                      if (!surchargeNote) setSurchargeNote("Phụ thu 10%");
                    }}
                    className="rounded-lg bg-[#d4af37]/30 px-2 py-0.5 text-[11px] sm:text-xs font-bold text-[#ffe270] hover:bg-[#d4af37]/50 border border-[#d4af37]/40 transition shrink-0 whitespace-nowrap"
                  >
                    +10%
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSurchargeInput(formatNumberInput("50000"));
                      setSurchargeNote("Phụ thu Check-in sớm");
                    }}
                    className="rounded-lg bg-[#d4af37]/30 px-2 py-0.5 text-[11px] sm:text-xs font-bold text-[#ffe270] hover:bg-[#d4af37]/50 border border-[#d4af37]/40 transition shrink-0 whitespace-nowrap"
                  >
                    +50k Sớm
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSurchargeInput(formatNumberInput("100000"));
                      setSurchargeNote("Phụ thu Check-out muộn");
                    }}
                    className="rounded-lg bg-[#d4af37]/30 px-2 py-0.5 text-[11px] sm:text-xs font-bold text-[#ffe270] hover:bg-[#d4af37]/50 border border-[#d4af37]/40 transition shrink-0 whitespace-nowrap"
                  >
                    +100k Muộn
                  </button>
                </div>
              ) : null}
            </div>

            {/* Giảm giá */}
            <div className="space-y-2 border-t border-[#d4af37]/25 pt-3">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-amber-100 font-extrabold text-sm min-w-0 truncate">
                  Giảm giá
                </dt>
                <dd className="flex-1 min-w-0 max-w-[165px] flex gap-1.5 shrink-0">
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={selectedFolio?.status === "CLOSED"}
                    value={discountInput}
                    onChange={(e) =>
                      setDiscountInput(
                        formatNumberOrPercentInput(e.target.value),
                      )
                    }
                    placeholder="0 hoặc 10%"
                    className="h-10 w-full min-w-0 rounded-xl border border-[#d4af37]/70 bg-[#1c1204] px-3 py-1 text-right text-base font-black text-[#fef08a] outline-none focus:border-[#fbbf24] focus:ring-2 focus:ring-[#fbbf24]/60 shadow-inner disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-[#2b1e0d]"
                  />
                  {canManage && selectedFolio?.status === "OPEN" ? (
                    <button
                      type="button"
                      title="Cập nhật Giảm giá vào Folio"
                      onClick={async () => {
                        const parsed = parseAmountOrPercentage(
                          discountInput,
                          subtotal,
                        );
                        if (parsed.amount <= 0) return;
                        const noteText = discountNote.trim();
                        const defaultName = parsed.isPercentage
                          ? `Giảm giá ${parsed.percentage}%`
                          : "Giảm giá";
                        const name = noteText ? `Giảm giá: ${noteText}` : defaultName;
                        try {
                          await requestInternalApiEnvelope(
                            `${apiBase}/folios/${encodeURIComponent(selectedFolioId)}/items`,
                            {
                              method: "POST",
                              body: {
                                itemType: "DISCOUNT",
                                name,
                                description: parsed.isPercentage
                                  ? `Quy đổi ${parsed.percentage}% từ Tạm tính (${formatMoney(subtotal, currency)})`
                                  : noteText || undefined,
                                amount: parsed.amount,
                                quantity: 1,
                              },
                            },
                          );
                          setDiscountInput("");
                          setDiscountNote("");
                          const [summaryRes, itemsRes] = await Promise.all([
                            requestInternalApiEnvelope<FolioSummary>(
                              `${apiBase}/folios/${encodeURIComponent(selectedFolioId)}/summary`,
                              { method: "GET" },
                            ),
                            requestInternalApiEnvelope<FolioItemsPage>(
                              `${apiBase}/folios/${encodeURIComponent(selectedFolioId)}/items?page=1&limit=100`,
                              { method: "GET" },
                            ),
                          ]);
                          setSummary(summaryRes.data);
                          setItems(itemsRes.data.items);
                          await invalidateHotelRealtimeQueries(queryClient, hotelId);
                          router.refresh();
                          void Swal.fire({
                            icon: "success",
                            title: "Đã thêm giảm giá vào folio",
                            toast: true,
                            position: "top-end",
                            timer: 2000,
                            showConfirmButton: false,
                          });
                        } catch (err) {
                          void Swal.fire({
                            icon: "error",
                            title: "Không thể thêm giảm giá",
                            text:
                              err instanceof Error
                                ? err.message
                                : "Vui lòng thử lại",
                            confirmButtonColor: "#17201b",
                          });
                        }
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fbbf24] text-[#1c1204] font-black text-xl hover:bg-[#f59e0b] active:scale-95 transition shrink-0 shadow-sm cursor-pointer"
                    >
                      +
                    </button>
                  ) : null}
                </dd>
              </div>

              {/* Input Diễn giải / Lý do giảm giá */}
              {canManage && selectedFolio?.status === "OPEN" ? (
                <input
                  type="text"
                  value={discountNote}
                  onChange={(e) => setDiscountNote(e.target.value)}
                  placeholder="Lý do giảm giá (vd: Khách VIP, voucher...)"
                  className="h-9 w-full rounded-xl border border-[#d4af37]/40 bg-[#1c1204]/90 px-3 py-1 text-xs sm:text-sm font-medium text-[#fef08a] placeholder-[#d4af37]/50 outline-none focus:border-[#fbbf24] focus:ring-1 focus:ring-[#fbbf24]"
                />
              ) : null}

              {/* Hiển thị quy đổi % giảm giá */}
              {discountParsed.isPercentage && discountParsed.amount > 0 ? (
                <p className="text-xs font-bold text-right text-[#fef08a]">
                  ⚡ Quy đổi {discountParsed.percentage}% Tạm tính: -
                  {formatMoney(discountParsed.amount, currency)}
                </p>
              ) : null}

              {/* Preset chips giảm giá (CHỈ 1 DÒNG DUY NHẤT) */}
              {canManage && selectedFolio?.status === "OPEN" ? (
                <div className="flex flex-nowrap gap-1 justify-end overflow-x-auto no-scrollbar pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountInput("5%");
                      setDiscountNote("Giảm giá 5% Khách VIP");
                    }}
                    className="rounded-lg bg-[#d4af37]/30 px-2 py-0.5 text-[11px] sm:text-xs font-bold text-[#fef08a] hover:bg-[#d4af37]/50 border border-[#d4af37]/40 transition shrink-0 whitespace-nowrap"
                  >
                    -5% VIP
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountInput("10%");
                      setDiscountNote("Giảm giá 10% Khách VIP");
                    }}
                    className="rounded-lg bg-[#d4af37]/30 px-2 py-0.5 text-[11px] sm:text-xs font-bold text-[#fef08a] hover:bg-[#d4af37]/50 border border-[#d4af37]/40 transition shrink-0 whitespace-nowrap"
                  >
                    -10% VIP
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountInput("15%");
                      setDiscountNote("Ưu đãi voucher -15%");
                    }}
                    className="rounded-lg bg-[#d4af37]/30 px-2 py-0.5 text-[11px] sm:text-xs font-bold text-[#fef08a] hover:bg-[#d4af37]/50 border border-[#d4af37]/40 transition shrink-0 whitespace-nowrap"
                  >
                    -15% Voucher
                  </button>
                </div>
              ) : null}
            </div>

            {/* Hỗ trợ tính tiền thừa cho Lễ tân */}
            {selectedFolio?.status !== "CLOSED" ? (
              <div className="space-y-2 border-t border-[#d4af37]/25 pt-3">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-amber-100 font-extrabold text-sm min-w-0 truncate">
                    Nhận tiền mặt
                  </dt>
                  <dd className="flex-1 min-w-0 max-w-[165px] shrink-0">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cashGivenInput}
                      onChange={(e) =>
                        setCashGivenInput(formatNumberInput(e.target.value))
                      }
                      placeholder="0"
                      className="h-10 w-full min-w-0 rounded-xl border border-[#d4af37]/70 bg-[#1c1204] px-3 py-1 text-right text-base font-black text-[#ffe270] outline-none focus:border-[#fbbf24] focus:ring-2 focus:ring-[#fbbf24]/60 shadow-inner"
                    />
                  </dd>
                </div>
                {/* Preset chips tiền đưa (CHỈ 1 DÒNG DUY NHẤT) */}
                <div className="flex flex-nowrap gap-1 justify-end overflow-x-auto no-scrollbar pt-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      setCashGivenInput(formatNumberInput(computedTotal))
                    }
                    className="rounded-lg bg-[#d4af37]/30 px-2 py-0.5 text-[11px] sm:text-xs font-bold text-[#ffe270] hover:bg-[#d4af37]/50 border border-[#d4af37]/40 transition shrink-0 whitespace-nowrap"
                  >
                    Đủ tiền
                  </button>
                  <button
                    type="button"
                    onClick={() => setCashGivenInput(formatNumberInput(500000))}
                    className="rounded-lg bg-[#d4af37]/30 px-2 py-0.5 text-[11px] sm:text-xs font-bold text-[#ffe270] hover:bg-[#d4af37]/50 border border-[#d4af37]/40 transition shrink-0 whitespace-nowrap"
                  >
                    500k
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCashGivenInput(formatNumberInput(1000000))
                    }
                    className="rounded-lg bg-[#d4af37]/30 px-2 py-0.5 text-[11px] sm:text-xs font-bold text-[#ffe270] hover:bg-[#d4af37]/50 border border-[#d4af37]/40 transition shrink-0 whitespace-nowrap"
                  >
                    1 Triệu
                  </button>
                </div>

                {/* Kết quả tiền thừa / thiếu */}
                {parseFormattedNumber(cashGivenInput) > 0 ? (
                  <div className="flex justify-between items-center rounded-xl bg-[#1c1204] p-2.5 border border-[#d4af37]/40 shadow-inner mt-1">
                    <span className="text-xs sm:text-sm font-bold text-[#fce8b3]">
                      {parseFormattedNumber(cashGivenInput) >= computedTotal
                        ? "Tiền thừa trả khách:"
                        : "Khách còn thiếu:"}
                    </span>
                    <span
                      className={`text-sm sm:text-base font-black ${
                        parseFormattedNumber(cashGivenInput) >= computedTotal
                          ? "text-emerald-400"
                          : "text-amber-400"
                      }`}
                    >
                      {formatMoney(
                        Math.abs(
                          parseFormattedNumber(cashGivenInput) - computedTotal,
                        ),
                        currency,
                      )}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </dl>

          {/* NÚT THAO TÁC CHÍNH Ở CUỐI CÙNG THẺ */}
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
                  router.push(
                    `/hotels/${encodeURIComponent(hotelId)}/billing/invoices/${encodeURIComponent(invoiceId)}`,
                  );
                }
              }}
              disabled={!selectedFolioId}
              className="mt-4 w-full inline-flex h-13 items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-[#fbbf24] via-[#f59e0b] to-[#d97706] px-4 text-base sm:text-lg font-black text-[#1c1204] shadow-xl shadow-amber-950/60 transition hover:from-[#f59e0b] hover:to-[#b45309] active:scale-[0.99] disabled:opacity-50 cursor-pointer"
            >
              <VsIcon name="description" className="text-xl" />
              Xem & xuất hóa đơn
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void issueInvoiceAndCollect()}
              disabled={!selectedFolioId || !canManage || saving}
              className="mt-4 w-full inline-flex h-13 items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-[#fbbf24] via-[#f59e0b] to-[#d97706] px-4 text-base sm:text-lg font-black text-[#1c1204] shadow-xl shadow-amber-950/60 transition hover:from-[#f59e0b] hover:to-[#b45309] active:scale-[0.99] disabled:opacity-50 cursor-pointer"
            >
              <VsIcon
                name={saving ? "sync" : "payments"}
                className={`text-xl ${saving ? "animate-spin" : ""}`}
              />
              {saving ? "Đang xử lý checkout..." : "Phát hành & thu tiền"}
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
