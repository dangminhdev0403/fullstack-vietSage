"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  escapeHtml,
  showConfirmDialog,
  showErrorAlert,
  showSuccessAlert,
  showWarningAlert,
  SwalVietSage,
} from "@/libs/swal";

import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type {
  FolioItem,
  FolioListItem,
  FolioSummary,
  Invoice,
  InvoiceDetail,
  IssueInvoiceAdjustment,
  Payment,
} from "@/features/billing/types/billing-contract";
import { folioPreviewResource } from "@/features/billing/resources/folio-preview-resource";
import { formatMoney } from "@/features/billing/utils/money";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { invalidateHotelRealtimeQueries } from "@/features/hotel-ops/utils/invalidate-hotel-realtime-queries";

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

export type BillingGroup = {
  id: string;
  leadGuestName: string;
  groupCode: string;
  folioIds: string[];
  folios: FolioListItem[];
  totalAmount: number;
  roomChargeTotal: number;
  serviceTotal: number;
  roomCount: number;
  pendingCount: number;
  openCount: number;
  closedCount: number;
  currency: string;
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
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return 0;

    // Plain integer string: "500000", "-50000"
    if (/^-?\d+$/.test(trimmed)) {
      const num = parseInt(trimmed, 10);
      return Number.isFinite(num) ? num : 0;
    }

    // Database / API Decimal with 1-2 decimal places: e.g. "500000.00", "-50000.00"
    if (/^-?\d+\.\d{1,2}$/.test(trimmed)) {
      const num = Math.round(Number(trimmed));
      return Number.isFinite(num) ? num : 0;
    }

    // Formatted Vietnamese string with thousand dots or commas (e.g. "500.000", "-50.000", "1.000.000")
    const isNegative = trimmed.startsWith("-");
    const cleanDigits = trimmed.replace(/[^\d]/g, "");
    const parsed = cleanDigits ? parseInt(cleanDigits, 10) : 0;
    return isNegative ? -parsed : parsed;
  }
  return 0;
}

const toNumber = parseFormattedNumber;

export function isCashSettlementAllowed(
  cashGivenInput: string | number,
  amountDue: number,
): boolean {
  if (amountDue <= 0) {
    return true;
  }
  if (cashGivenInput === "" || cashGivenInput === null || cashGivenInput === undefined) {
    return false;
  }
  if (typeof cashGivenInput === "number") {
    return Number.isFinite(cashGivenInput) && cashGivenInput > 0;
  }
  if (typeof cashGivenInput === "string") {
    const trimmed = cashGivenInput.trim();
    if (!trimmed) return false;
    if (!/^\d[\d.,\s]*$/.test(trimmed)) return false;
    const cash = parseFormattedNumber(trimmed);
    return Number.isFinite(cash) && cash > 0;
  }
  return false;
}

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
  return {
    amount: isNaN(amount) ? 0 : amount,
    isPercentage: false,
    percentage: 0,
  };
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

function generateFallbackAttemptId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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

  const queryRoomNumber =
    searchParams?.get("roomNumber") ?? searchParams?.get("room") ?? "";
  const queryFolioId =
    searchParams?.get("folioId") ?? searchParams?.get("folio") ?? "";
  const queryStayId =
    searchParams?.get("stayId") ?? searchParams?.get("stay") ?? "";
  const queryRoomId = searchParams?.get("roomId") ?? "";
  const queryGroupCode = searchParams?.get("groupCode") ?? "";

  // Chế độ thanh toán: Phòng lẻ (SINGLE) hoặc Theo đoàn / Đa phòng (GROUP)
  const [checkoutMode, setCheckoutMode] = useState<"SINGLE" | "GROUP">("GROUP");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroupFolioIds, setSelectedGroupFolioIds] = useState<Set<string>>(new Set());
  const [groupDiscountInput, setGroupDiscountInput] = useState<string>("");
  const [groupSurchargeInput, setGroupSurchargeInput] = useState<string>("");
  const [groupDiscountNote, setGroupDiscountNote] = useState<string>("");
  const [groupSurchargeNote, setGroupSurchargeNote] = useState<string>("");
  const [groupCashGivenInput, setGroupCashGivenInput] = useState<string>("");
  const [groupTableSearch, setGroupTableSearch] = useState<string>("");
  const [groupTableStatusFilter, setGroupTableStatusFilter] = useState<"ALL" | "PENDING" | "OPEN">("ALL");
  const [masterInvoiceMode, setMasterInvoiceMode] = useState<"MASTER" | "SPLIT">("MASTER");
  const [bankCopied, setBankCopied] = useState<boolean>(false);
  const [previewFolioId, setPreviewFolioId] = useState<string | null>(null);
  const previewQuery = useQuery({
    ...folioPreviewResource.bind({ hotelId }).queries.detail.options(previewFolioId ?? ""),
    enabled: Boolean(previewFolioId),
    staleTime: 0,
  });
  const previewFolioLoading = previewQuery.isFetching;
  const previewFolioSummary = previewFolioId ? previewQuery.data?.summary ?? null : null;
  const previewFolioItems = previewFolioId ? previewQuery.data?.items ?? [] : [];

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
  const [prevSelectedFolioId, setPrevSelectedFolioId] =
    useState(selectedFolioId);

  if (!selectedFolioId && initialFolio?.id) {
    setSelectedFolioId(initialFolio.id);
  }

  const [lastQueryFolioId, setLastQueryFolioId] = useState(queryFolioId);
  if (queryFolioId !== lastQueryFolioId) {
    setLastQueryFolioId(queryFolioId);
    if (queryFolioId) setSelectedFolioId(queryFolioId);
  }
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
  const [discountInput, setDiscountInput] = useState<string>("");
  const [surchargeInput, setSurchargeInput] = useState<string>("");
  const [discountNote, setDiscountNote] = useState<string>("");
  const [surchargeNote, setSurchargeNote] = useState<string>("");
  const [cashGivenInput, setCashGivenInput] = useState<string>("");
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState<"CASH" | "BANK_TRANSFER" | "CARD">("CASH");
  const checkoutAttemptIdsRef = useRef<Record<string, string>>({});
  const checkoutPaymentAttemptRef = useRef<{
    invoiceId: string;
    amount: number;
    cashReceived: number;
    clientRequestId: string;
  } | null>(null);

  if (selectedFolioId !== prevSelectedFolioId) {
      setPrevSelectedFolioId(selectedFolioId);
      setDiscountInput("");
      setSurchargeInput("");
      setDiscountNote("");
      setSurchargeNote("");
      setCashGivenInput("");
      setReconciliations({});
      setCheckoutError("");
  }
  useEffect(() => {
    checkoutAttemptIdsRef.current = {};
    checkoutPaymentAttemptRef.current = null;
  }, [selectedFolioId]);

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

  const currency = activeSummary?.currency ?? selectedFolio?.currency ?? "VND";
  const hasPostedRoomCharge = useMemo(() => {
    return activeItems.some(
      (item) => item.itemType === "ROOM_CHARGE" && !isFolioItemVoided(item),
    );
  }, [activeItems]);

  const estimatedRoomChargeData = useMemo(() => {
    if (activeSummary?.estimatedRoomCharge) {

      return {
        nights: Number(activeSummary.estimatedRoomCharge.nights || 1),
        nightlyRate: toNumber(activeSummary.estimatedRoomCharge.nightlyRate),
        subtotal: toNumber(activeSummary.estimatedRoomCharge.subtotal),
      };
    }
    if (selectedFolio?.estimatedRoomCharge) {
      return {
        nights: Number(selectedFolio.estimatedRoomCharge.nights || 1),
        nightlyRate: toNumber(selectedFolio.estimatedRoomCharge.nightlyRate),
        subtotal: toNumber(selectedFolio.estimatedRoomCharge.subtotal),
      };
    }
    return null;
  }, [activeSummary, selectedFolio]);

  const roomChargeTotal = useMemo(() => {
    const fromItems = activeItems
      .filter(
        (item) => item.itemType === "ROOM_CHARGE" && !isFolioItemVoided(item),
      )
      .reduce((sum, item) => sum + toNumber(item.totalSnapshot), 0);
    if (fromItems > 0) return fromItems;
    if (selectedFolio?.status === "OPEN" && estimatedRoomChargeData) {
      return estimatedRoomChargeData.subtotal;
    }
    return 0;
  }, [activeItems, selectedFolio, estimatedRoomChargeData]);

  const roomRateComparison =
    activeSummary?.roomRateComparison ?? selectedFolio?.roomRateComparison ?? null;
  const roomRateDifference = toNumber(roomRateComparison?.totalDifference ?? 0);

  const reconciledServiceTotal = useMemo(() => {
    const requests = activeSummary?.activeServiceRequests ?? [];
    return requests.reduce((sum, req) => {
      const choice = reconciliations[req.id];
      if (choice?.action === "provided") {
        return sum + toNumber(req.unitPrice) * Number(req.quantity || 1);
      }
      return sum;
    }, 0);
  }, [activeSummary?.activeServiceRequests, reconciliations]);

  const hotelServiceChargeTotal = useMemo(() => {
    const fromPostedItems = activeItems
      .filter(
        (item) =>
          item.itemType === "SERVICE" &&
          !isFolioItemVoided(item) &&
          item.serviceSource !== "EXTERNAL",
      )
      .reduce((sum, item) => sum + toNumber(item.totalSnapshot), 0);
    return fromPostedItems + reconciledServiceTotal;
  }, [activeItems, reconciledServiceTotal]);

  const externalServiceCollectionTotal = useMemo(() => {
    return activeItems
      .filter(
        (item) =>
          item.itemType === "SERVICE" &&
          !isFolioItemVoided(item) &&
          item.serviceSource === "EXTERNAL",
      )
      .reduce((sum, item) => sum + toNumber(item.totalSnapshot), 0);
  }, [activeItems]);

  const manualChargeTotal = useMemo(() => {
    return activeItems
      .filter(
        (item) =>
          (item.itemType === "MANUAL_CHARGE" || item.itemType === "ADJUSTMENT") &&
          !isFolioItemVoided(item),
      )
      .reduce((sum, item) => sum + toNumber(item.totalSnapshot), 0);
  }, [activeItems]);

  const subtotal = useMemo(() => {
    const fromSummary = toNumber(activeSummary?.subtotal ?? 0) + reconciledServiceTotal;
    const itemTotal =
      roomChargeTotal +
      hotelServiceChargeTotal +
      externalServiceCollectionTotal +
      manualChargeTotal;
    return Math.max(fromSummary, itemTotal);
  }, [
    activeSummary,
    reconciledServiceTotal,
    roomChargeTotal,
    hotelServiceChargeTotal,
    externalServiceCollectionTotal,
    manualChargeTotal,
  ]);

  const tax = toNumber(activeSummary?.tax ?? 0);

  const existingDiscountTotal = useMemo(() => {
    const fromItems = activeItems
      .filter(
        (item) => item.itemType === "DISCOUNT" && !isFolioItemVoided(item),
      )
      .reduce((sum, item) => {
        const amt = toNumber(item.totalSnapshot || item.discountAmountSnapshot);
        return sum + Math.abs(amt);
      }, 0);
    if (fromItems > 0) return fromItems;
    return Math.abs(toNumber(activeSummary?.discount ?? 0));
  }, [activeItems, activeSummary]);

  const alreadyPaidAmount = useMemo(() => {
    return toNumber(
      (activeSummary as { invoice?: { paidAmount?: number | string | null } } | null)?.invoice
        ?.paidAmount ??
        (selectedFolio as { invoice?: { paidAmount?: number | string | null } } | null)?.invoice
          ?.paidAmount ??
        0,
    );
  }, [activeSummary, selectedFolio]);

  const discountParsed = parseAmountOrPercentage(discountInput, subtotal);
  const surchargeParsed = parseAmountOrPercentage(surchargeInput, subtotal);

  const discountVal = Math.max(0, discountParsed.amount);
  const surchargeVal = Math.max(0, surchargeParsed.amount);

  const isClosedFolio = selectedFolio?.status === "CLOSED";

  const computedTotal = (() => {
    if (isClosedFolio) {
      const closedTotal = toNumber(
        activeSummary?.total ?? selectedFolio?.total ?? selectedFolio?.totalAmount,
      );
      if (closedTotal > 0 || (activeSummary && activeSummary.total !== undefined)) {
        return closedTotal;
      }
      return Math.max(0, subtotal + tax - existingDiscountTotal);
    }
    return Math.max(
      0,
      subtotal + tax - existingDiscountTotal + surchargeVal - discountVal - alreadyPaidAmount,
    );
  })();

  // Helper tính tiền cho từng folio bất kỳ trong danh sách (tính chuẩn theo giá đã chốt, giá đặt trước hoặc giá cấu hình)
  const getFolioRoomCharge = useCallback((f: FolioListItem): number => {
    if (f.postedRoomCharge !== undefined && f.postedRoomCharge !== null) {
      return toNumber(f.postedRoomCharge);
    }
    if (f.estimatedRoomCharge?.subtotal) {
      return toNumber(f.estimatedRoomCharge.subtotal);
    }
    const nightlyRate = toNumber(
      f.stay?.nightlyRateSnapshot ??
        f.stay?.baseNightlyRateSnapshot ??
        f.stay?.reservation?.nightlyRateSnapshot ??
        f.stay?.reservation?.baseNightlyRateSnapshot ??
        f.room?.price ??
        f.room?.roomType?.basePrice ??
        0,
    );

    const checkIn =
      f.stay?.checkedInAt ??
      f.stay?.plannedCheckInAt ??
      f.openedAt ??
      f.createdAt;
    const checkOut = f.stay?.checkedOutAt ?? f.stay?.plannedCheckOutAt;
    let nights = Number(f.estimatedRoomCharge?.nights ?? 0);
    if (nights <= 0 && checkIn && checkOut) {
      const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
      nights = Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
    }
    if (nights <= 0) nights = 1;

    const computedRate = nightlyRate * nights;
    if (computedRate > 0) return computedRate;

    const val = toNumber(f.total ?? f.totalAmount);
    if (val > 0) return val;
    const rPrice = toNumber(f.room?.price ?? 0);
    return rPrice > 0 ? rPrice : 0;
  }, []);

  const getFolioTotalAmount = useCallback((f: FolioListItem): number => {
    const val = toNumber(f.total ?? f.totalAmount);
    const roomCharge = getFolioRoomCharge(f);
    if (val > 0) return Math.max(val, roomCharge);
    return roomCharge;
  }, [getFolioRoomCharge]);

  const selectedGroupFolios = useMemo(
    () => folios.filter((f) => selectedGroupFolioIds.has(f.id)),
    [folios, selectedGroupFolioIds],
  );

  const toggleGroupFolio = useCallback((id: string) => {
    setSelectedGroupFolioIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllFilteredFolios = useCallback(() => {
    setSelectedGroupFolioIds(new Set(filteredFolios.map((f) => f.id)));
  }, [filteredFolios]);

  const clearGroupSelection = useCallback(() => {
    setSelectedGroupFolioIds(new Set());
  }, []);

  // Tự động phân loại và gom các phòng thành các Đoàn (BillingGroup)
  const { billingGroups, soloFolios } = useMemo(() => {
    const groupClusters = new Map<
      string,
      { leadName: string; groupCode: string; folios: FolioListItem[] }
    >();

    // Pass 1: Kiểm tra reservationCode dùng chung
    const resCodeCounts = new Map<string, number>();
    for (const f of folios) {
      const code = f.stay?.reservationCode?.trim();
      if (code) {
        resCodeCounts.set(code, (resCodeCounts.get(code) || 0) + 1);
      }
    }

    const processedFolioIds = new Set<string>();

    // Nhóm 1: Các phòng có chung reservationCode
    for (const f of folios) {
      const code = f.stay?.reservationCode?.trim();
      if (code && (resCodeCounts.get(code) || 0) > 1) {
        const key = `res:${code}`;
        const leadName =
          f.stay?.guestDisplayName?.trim() ||
          f.stay?.guestNameSnapshot?.trim() ||
          "Khách đoàn";
        if (!groupClusters.has(key)) {
          groupClusters.set(key, { leadName, groupCode: code, folios: [] });
        }
        groupClusters.get(key)!.folios.push(f);
        processedFolioIds.add(f.id);
      }
    }

    // Nhóm 2: Các phòng có chung tên khách hoặc chứa từ khóa đoàn
    const guestCounts = new Map<string, FolioListItem[]>();
    for (const f of folios) {
      if (processedFolioIds.has(f.id)) continue;
      const rawName =
        f.stay?.guestDisplayName?.trim() ||
        f.stay?.guestNameSnapshot?.trim() ||
        "Khách đoàn";
      if (!guestCounts.has(rawName)) {
        guestCounts.set(rawName, []);
      }
      guestCounts.get(rawName)!.push(f);
    }

    for (const [rawName, list] of guestCounts.entries()) {
      const isGroupKeyword =
        rawName.toLowerCase().includes("đoàn") ||
        rawName.toLowerCase().includes("tour") ||
        rawName.toLowerCase().includes("công ty") ||
        rawName.toLowerCase().includes("group") ||
        rawName.toLowerCase().includes("lưu trú");

      if ((list.length >= 2 || isGroupKeyword) && list.length >= 2) {
        const firstRoom = list[0]?.room?.roomNumber || "01";
        const groupCode = list[0]?.stay?.reservationCode || `GRP-${firstRoom}`;
        const key = `guest:${rawName.toLowerCase()}`;
        groupClusters.set(key, { leadName: rawName, groupCode, folios: list });
        list.forEach((f) => processedFolioIds.add(f.id));
      }
    }

    const groups: BillingGroup[] = [];
    for (const [id, cluster] of groupClusters.entries()) {
      let roomCharge = 0;
      let total = 0;
      let pending = 0;
      let open = 0;
      let closed = 0;

      for (const f of cluster.folios) {
        const rCharge = getFolioRoomCharge(f);
        const tot = getFolioTotalAmount(f);
        roomCharge += rCharge;
        total += tot;
        if (f.status === "CHECKOUT_PENDING") pending++;
        else if (f.status === "OPEN") open++;
        else if (f.status === "CLOSED") closed++;
      }

      groups.push({
        id,
        leadGuestName: cluster.leadName,
        groupCode: cluster.groupCode,
        folioIds: cluster.folios.map((f) => f.id),
        folios: cluster.folios,
        totalAmount: total,
        roomChargeTotal: roomCharge,
        serviceTotal: Math.max(0, total - roomCharge),
        roomCount: cluster.folios.length,
        pendingCount: pending,
        openCount: open,
        closedCount: closed,
        currency: cluster.folios[0]?.currency ?? "VND",
      });
    }

    const solo = folios.filter((f) => !processedFolioIds.has(f.id));

    return { billingGroups: groups, soloFolios: solo };
  }, [folios, getFolioRoomCharge, getFolioTotalAmount]);

  // Đoàn đang được chọn trong workspace
  const activeGroup = useMemo(() => {
    if (selectedGroupId) {
      const found = billingGroups.find((g) => g.id === selectedGroupId);
      if (found) return found;
    }
    return billingGroups[0] ?? null;
  }, [billingGroups, selectedGroupId]);

  const filteredBillingGroups = useMemo(() => {
    if (!search.trim()) return billingGroups;
    const q = search.trim().toLowerCase();
    return billingGroups.filter(
      (g) =>
        g.leadGuestName.toLowerCase().includes(q) ||
        g.groupCode.toLowerCase().includes(q) ||
        g.folios.some((f) => (f.room?.roomNumber ?? "").toLowerCase().includes(q)),
    );
  }, [billingGroups, search]);

  // Tự động khởi tạo selectedGroupId và selectedGroupFolioIds khi có billingGroups
  if (!selectedGroupId && billingGroups.length > 0) {
      const firstGroup = billingGroups[0];
      setSelectedGroupId(firstGroup.id);
      const openIds = firstGroup.folios
        .filter((f) => f.status !== "CLOSED")
        .map((f) => f.id);
      setSelectedGroupFolioIds(new Set(openIds));
  }

  const selectGroup = useCallback((group: BillingGroup) => {
    setSelectedGroupId(group.id);
    setCheckoutMode("GROUP");
    const openIds = group.folios
      .filter((f) => f.status !== "CLOSED")
      .map((f) => f.id);
    setSelectedGroupFolioIds(new Set(openIds));
    setGroupTableSearch("");
  }, []);

  const selectSoloFolio = useCallback((folioId: string) => {
    setSelectedFolioId(folioId);
    setCheckoutMode("SINGLE");
    setSelectedGroupId(null);
  }, []);

  const selectAllActiveGroupFolios = useCallback(() => {
    if (activeGroup) {
      const openIds = activeGroup.folios
        .filter((f) => f.status !== "CLOSED")
        .map((f) => f.id);
      setSelectedGroupFolioIds(new Set(openIds));
    } else {
      setSelectedGroupFolioIds(
        new Set(
          filteredFolios
            .filter((f) => f.status !== "CLOSED")
            .map((f) => f.id),
        ),
      );
    }
  }, [activeGroup, filteredFolios]);

  // Danh sách các phòng thuộc đoàn đang được lọc tìm kiếm trong bảng đoàn (Cột 2)
  const filteredGroupRooms = useMemo(() => {
    if (!activeGroup) return [];
    return activeGroup.folios.filter((folio) => {
      const rNum = (folio.room?.roomNumber ?? "").toLowerCase();
      const gName = (folio.stay?.guestDisplayName ?? folio.stay?.guestNameSnapshot ?? "").toLowerCase();
      const fCode = (folio.folioNumber ?? folio.id).toLowerCase();
      const q = groupTableSearch.trim().toLowerCase();
      const matchesSearch = !q || rNum.includes(q) || gName.includes(q) || fCode.includes(q);

      const matchesStatus =
        groupTableStatusFilter === "ALL" ||
        (groupTableStatusFilter === "PENDING" && folio.status === "CHECKOUT_PENDING") ||
        (groupTableStatusFilter === "OPEN" && folio.status === "OPEN");

      return matchesSearch && matchesStatus;
    });
  }, [activeGroup, groupTableSearch, groupTableStatusFilter]);

  const previewFolioItem = useMemo(() => {
    if (!previewFolioId) return null;
    return folios.find((f) => f.id === previewFolioId) ?? null;
  }, [previewFolioId, folios]);

  const previewFolioMetrics = useMemo(() => {
    if (!previewFolioItem) return { roomCharge: 0, serviceCharge: 0, total: 0, nights: 1 };

    const roomItems = previewFolioItems.filter(
      (it) => it.itemType === "ROOM_CHARGE" && !isFolioItemVoided(it),
    );
    const serviceItems = previewFolioItems.filter(
      (it) => (it.itemType === "SERVICE" || it.itemType === "MANUAL_CHARGE") && !isFolioItemVoided(it),
    );

    let roomCharge = 0;
    let nights = 1;
    if (roomItems.length > 0) {
      roomCharge = roomItems.reduce((sum, it) => sum + toNumber(it.totalSnapshot), 0);
      nights = roomItems.reduce((sum, it) => sum + Number(it.quantity || 1), 0);
    } else if (previewFolioSummary?.estimatedRoomCharge?.subtotal) {
      roomCharge = toNumber(previewFolioSummary.estimatedRoomCharge.subtotal);
      nights = Number(previewFolioSummary.estimatedRoomCharge.nights || 1);
    } else {
      roomCharge = getFolioRoomCharge(previewFolioItem);
      const estNights = Number(previewFolioItem.estimatedRoomCharge?.nights ?? 0);
      nights = estNights > 0 ? estNights : 1;
    }

    const serviceCharge = serviceItems.reduce((sum, it) => sum + toNumber(it.totalSnapshot), 0);
    const total = previewFolioItems.length > 0
      ? previewFolioItems.filter((it) => !isFolioItemVoided(it)).reduce((sum, it) => sum + toNumber(it.totalSnapshot), 0)
      : getFolioTotalAmount(previewFolioItem);

    return {
      roomCharge,
      serviceCharge,
      total: Math.max(total, roomCharge + serviceCharge),
      nights: Math.max(1, nights),
    };
  }, [previewFolioItem, previewFolioItems, previewFolioSummary, getFolioRoomCharge, getFolioTotalAmount]);

  const groupRoomChargeTotal = useMemo(() => {
    return selectedGroupFolios.reduce((sum, f) => sum + getFolioRoomCharge(f), 0);
  }, [selectedGroupFolios, getFolioRoomCharge]);

  const groupServiceTotal = useMemo(() => {
    return selectedGroupFolios.reduce((sum, f) => {
      const roomTotal = getFolioTotalAmount(f);
      const roomCharge = getFolioRoomCharge(f);
      return sum + Math.max(0, roomTotal - roomCharge);
    }, 0);
  }, [selectedGroupFolios, getFolioTotalAmount, getFolioRoomCharge]);

  const groupSubtotal = useMemo(() => {
    return groupRoomChargeTotal + groupServiceTotal;
  }, [groupRoomChargeTotal, groupServiceTotal]);

  const groupDiscountParsed = parseAmountOrPercentage(groupDiscountInput, groupSubtotal);
  const groupSurchargeParsed = parseAmountOrPercentage(groupSurchargeInput, groupSubtotal);
  const groupDiscountVal = Math.max(0, groupDiscountParsed.amount);
  const groupSurchargeVal = Math.max(0, groupSurchargeParsed.amount);

  const computedGroupTotal = useMemo(() => {
    return Math.max(0, groupSubtotal + groupSurchargeVal - groupDiscountVal);
  }, [groupSubtotal, groupSurchargeVal, groupDiscountVal]);

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
        void showErrorAlert("Không thể tải chi tiết folio", error);
      });

    const interval = setInterval(() => {
      if (!document.hidden) {
        void refreshActiveFolio();
      }
    }, 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [apiBase, selectedFolioId, refreshActiveFolio]);

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

    const discountCheck = parseAmountOrPercentage(discountInput, subtotal);
    if (
      discountCheck.amount > 0 &&
      subtotal + tax - existingDiscountTotal + surchargeVal - discountCheck.amount < 0
    ) {
      setCheckoutError("Số tiền giảm giá không được làm tổng tiền trở thành số âm.");
      return;
    }

    setCheckoutError("");
    const isZeroBalance = computedTotal <= 0;
    const confirmation = await showConfirmDialog({
      icon: "question",
      title: isZeroBalance ? "Đóng checkout không còn số dư?" : "Phát hành hóa đơn và thu tiền?",
      text: isZeroBalance
        ? "Sau khi xác nhận, stay sẽ đóng và phòng chuyển sang chờ dọn."
        : "Sau khi xác nhận thanh toán, hệ thống sẽ ghi nhận giao dịch.",
      confirmText: "Tiếp tục",
      cancelText: "Hủy",
    });
    if (!confirmation.isConfirmed) return;

    setSaving(true);
    try {
      const adjustments: Array<{
        clientRequestId: string;
        itemType: "MANUAL_CHARGE" | "DISCOUNT";
        name: string;
        description?: string;
        amount: number;
        quantity?: number;
      }> = [];

      const surchargeParsed = parseAmountOrPercentage(surchargeInput, subtotal);
      if (surchargeParsed.amount > 0) {
        const noteText = surchargeNote.trim();
        const defaultName = surchargeParsed.isPercentage
          ? `Phụ thu ${surchargeParsed.percentage}%`
          : "Phụ thu thủ công";
        const name = noteText ? `Phụ thu: ${noteText}` : defaultName;
        const description = surchargeParsed.isPercentage
          ? `Quy đổi ${surchargeParsed.percentage}% từ Tạm tính (${formatMoney(subtotal, currency)})`
          : noteText || undefined;

        const surchargeKey = `${selectedFolioId}:surcharge:${surchargeParsed.amount}:${noteText}`;
        if (!checkoutAttemptIdsRef.current[surchargeKey]) {
          checkoutAttemptIdsRef.current[surchargeKey] = generateFallbackAttemptId("surcharge");
        }
        adjustments.push({
          clientRequestId: checkoutAttemptIdsRef.current[surchargeKey],
          itemType: "MANUAL_CHARGE",
          name,
          description,
          amount: surchargeParsed.amount,
          quantity: 1,
        });
      }

      const discountParsed = parseAmountOrPercentage(discountInput, subtotal);
      if (discountParsed.amount > 0) {
        const noteText = discountNote.trim();
        const defaultName = discountParsed.isPercentage
          ? `Giảm giá ${discountParsed.percentage}%`
          : "Giảm giá";
        const name = noteText ? `Giảm giá: ${noteText}` : defaultName;
        const description = discountParsed.isPercentage
          ? `Quy đổi ${discountParsed.percentage}% từ Tạm tính (${formatMoney(subtotal, currency)})`
          : noteText || undefined;

        const discountKey = `${selectedFolioId}:discount:${discountParsed.amount}:${noteText}`;
        if (!checkoutAttemptIdsRef.current[discountKey]) {
          checkoutAttemptIdsRef.current[discountKey] = generateFallbackAttemptId("discount");
        }
        adjustments.push({
          clientRequestId: checkoutAttemptIdsRef.current[discountKey],
          itemType: "DISCOUNT",
          name,
          description,
          amount: discountParsed.amount,
          quantity: 1,
        });
      }

      const invoiceResponse = await requestInternalApiEnvelope<Invoice>(
        `${apiBase}/folios/${encodeURIComponent(selectedFolioId)}/invoice`,
        {
          method: "POST",
          body: {
            reconciliations: activeRequests.map((request) => ({
              requestId: request.id,
              action: reconciliations[request.id].action,
            })),
            adjustments: adjustments.length > 0 ? adjustments : undefined,
          },
        },
      );
      const invoice = invoiceResponse.data;
      setDiscountInput("");
      setSurchargeInput("");
      setDiscountNote("");
      setSurchargeNote("");
      checkoutAttemptIdsRef.current = {};

      const invoiceBalance = toNumber(invoice.balanceAmount ?? invoice.totalAmount);
      if (invoiceBalance > 0) {
        const enteredCash = parseFormattedNumber(cashGivenInput);
        const cashReceived = enteredCash > 0 ? enteredCash : invoiceBalance;
        const appliedAmount = Math.min(cashReceived, invoiceBalance);
        const previousAttempt = checkoutPaymentAttemptRef.current;
        const paymentAttempt =
          previousAttempt?.invoiceId === invoice.id &&
          previousAttempt.amount === appliedAmount &&
          previousAttempt.cashReceived === cashReceived
            ? previousAttempt
            : {
                invoiceId: invoice.id,
                amount: appliedAmount,
                cashReceived,
                clientRequestId: generateFallbackAttemptId("pay"),
              };
        checkoutPaymentAttemptRef.current = paymentAttempt;

        const paymentResponse = await requestInternalApiEnvelope<{
          payment: Payment;
          invoice: InvoiceDetail;
          changeAmount?: number;
        }>(
          `${apiBase}/invoices/${encodeURIComponent(invoice.id)}/manual-payment`,
          {
            method: "POST",
            body: {
              method: checkoutPaymentMethod,
              note:
                checkoutPaymentMethod === "CASH"
                  ? "Thu tiền mặt tại quầy lễ tân"
                  : checkoutPaymentMethod === "BANK_TRANSFER"
                  ? "Thu chuyển khoản ngân hàng"
                  : "Thu quẹt thẻ POS tại quầy",
              amount: appliedAmount,
              cashReceived,
              clientRequestId: paymentAttempt.clientRequestId,
            },
          },
        );
        checkoutPaymentAttemptRef.current = null;
        checkoutAttemptIdsRef.current = {};

        const resData = paymentResponse?.data;
        const updatedInvoice = resData?.invoice?.invoice ?? resData?.invoice ?? invoice;
        const remainingBalance = toNumber(
          updatedInvoice?.balanceAmount ?? Math.max(0, invoiceBalance - appliedAmount),
        );
        const changeAmount = resData?.changeAmount ?? Math.max(0, cashReceived - appliedAmount);

        if (appliedAmount < invoiceBalance || remainingBalance > 0) {
          await showSuccessAlert(
            "Thanh toán một phần thành công",
            `Đã thu ${formatMoney(appliedAmount, currency)}. Còn lại cần thanh toán: ${formatMoney(remainingBalance, currency)}.`,
          );
        } else if (changeAmount > 0) {
          await showSuccessAlert(
            "Checkout hoàn tất",
            `Đã thu đủ tiền. Tiền thừa trả khách: ${formatMoney(changeAmount, currency)}. Phòng đang chờ dọn.`,
          );
        } else {
          await showSuccessAlert("Thành công", "Đã thu tiền và đóng phòng.");
        }
      } else {
        const paymentKey = `${invoice.id}:zero-payment`;
        if (!checkoutAttemptIdsRef.current[paymentKey]) {
          checkoutAttemptIdsRef.current[paymentKey] = generateFallbackAttemptId("zero");
        }
        const clientRequestId = checkoutAttemptIdsRef.current[paymentKey];

        await requestInternalApiEnvelope(
          `${apiBase}/invoices/${encodeURIComponent(invoice.id)}/manual-payment`,
          {
            method: "POST",
            body: {
              method: "MANUAL",
              note: "Đóng checkout không còn số dư",
              clientRequestId,
            },
          },
        );
        checkoutAttemptIdsRef.current = {};
        await showSuccessAlert("Thành công", "Đã đóng phòng không còn số dư.");
      }
      await invalidateHotelRealtimeQueries(queryClient, hotelId);
    } catch (error) {
      await showErrorAlert("Không thể hoàn tất checkout", error);
    } finally {
      setSaving(false);
    }
  }

  async function issueGroupInvoicesAndCollect() {
    if (selectedGroupFolios.length === 0 || !canManage) return;

    if (groupDiscountVal > groupSubtotal + groupSurchargeVal) {
      await showWarningAlert(
        "Giảm giá vượt quá tổng tiền",
        "Số tiền giảm giá không được vượt quá tổng tạm tính của đoàn.",
      );
      return;
    }

    const foliosToSettle = selectedGroupFolios.filter((f) => f.status !== "CLOSED");
    if (foliosToSettle.length === 0) {
      await showWarningAlert(
        "Tất cả phòng đã đóng",
        "Tất cả các phòng được chọn đã hoàn tất thanh toán & đóng trước đó.",
      );
      return;
    }

    const roomNames = foliosToSettle.map((f) => displayRoom(f)).join(", ");
    const confirm = await showConfirmDialog({
      icon: "question",
      title: `Thanh toán đoàn ${foliosToSettle.length} phòng?`,
      html: `
        <div style="text-align: left; font-size: 14px; line-height: 1.6; color: #334155;">
          <p>Xác nhận phát hành hóa đơn &amp; đóng checkout đồng thời cho <strong>${foliosToSettle.length} phòng</strong>:</p>
          <div style="margin: 8px 0; padding: 10px; background-color: #f1f5f9; border-radius: 8px; font-weight: 700; color: #0f172a; max-height: 100px; overflow-y: auto;">
            ${escapeHtml(roomNames)}
          </div>
          <div style="margin-top: 8px; font-size: 15px; font-weight: 800; color: #047857;">
            Tổng tiền: ${formatMoney(computedGroupTotal, currency)}
          </div>
          <p style="margin-top: 6px; font-size: 13px; color: #64748b;">
            Phương thức thanh toán: <strong>${
              checkoutPaymentMethod === "CASH"
                ? "Tiền mặt (TM)"
                : checkoutPaymentMethod === "BANK_TRANSFER"
                ? "Chuyển khoản (CK)"
                : "Quẹt thẻ POS"
            }</strong>
          </p>
        </div>
      `,
      confirmText: `Thanh toán ${foliosToSettle.length} phòng`,
      cancelText: "Hủy bỏ",
      reverseButtons: false,
    });

    if (!confirm.isConfirmed) return;

    setSaving(true);
    let successCount = 0;
    let failCount = 0;
    let firstInvoiceId: string | null = null;
    const errors: string[] = [];

    for (let i = 0; i < foliosToSettle.length; i++) {
      const folio = foliosToSettle[i];
      try {
        const adjustments: IssueInvoiceAdjustment[] = [];
        // Áp dụng phụ thu / giảm giá của cả đoàn vào folio chưa thanh toán đầu tiên
        if (i === 0) {
          if (groupSurchargeParsed.amount > 0) {
            adjustments.push({
              clientRequestId: generateFallbackAttemptId(`grp-sur-${folio.id}`),
              itemType: "MANUAL_CHARGE",
              name: groupSurchargeNote || "Phụ thu đoàn",
              description: groupSurchargeParsed.isPercentage
                ? `Phụ thu đoàn ${groupSurchargeParsed.percentage}%`
                : groupSurchargeNote || "Phụ thu cả đoàn",
              amount: groupSurchargeParsed.amount,
              quantity: 1,
            });
          }
          if (groupDiscountParsed.amount > 0) {
            adjustments.push({
              clientRequestId: generateFallbackAttemptId(`grp-disc-${folio.id}`),
              itemType: "DISCOUNT",
              name: groupDiscountNote || "Giảm giá đoàn",
              description: groupDiscountParsed.isPercentage
                ? `Giảm giá đoàn ${groupDiscountParsed.percentage}%`
                : groupDiscountNote || "Ưu đãi đoàn",
              amount: groupDiscountParsed.amount,
              quantity: 1,
            });
          }
        }

        const invRes = await requestInternalApiEnvelope<Invoice>(
          `${apiBase}/folios/${encodeURIComponent(folio.id)}/invoice`,
          {
            method: "POST",
            body: {
              adjustments: adjustments.length > 0 ? adjustments : undefined,
            },
          },
        );
        const invoice = invRes.data;
        if (!firstInvoiceId && invoice?.id) {
          firstInvoiceId = invoice.id;
        }
        const invoiceBalance = toNumber(invoice.balanceAmount ?? invoice.totalAmount);

        if (invoiceBalance > 0) {
          await requestInternalApiEnvelope(
            `${apiBase}/invoices/${encodeURIComponent(invoice.id)}/manual-payment`,
            {
              method: "POST",
              body: {
                method: checkoutPaymentMethod,
                note: `Thanh toán gộp đoàn (${foliosToSettle.length} phòng: ${roomNames})`,
                amount: invoiceBalance,
                cashReceived: invoiceBalance,
                clientRequestId: generateFallbackAttemptId(`grp-pay-${invoice.id}`),
              },
            },
          );
        } else {
          await requestInternalApiEnvelope(
            `${apiBase}/invoices/${encodeURIComponent(invoice.id)}/manual-payment`,
            {
              method: "POST",
              body: {
                method: "MANUAL",
                note: "Đóng checkout đoàn không còn số dư",
                clientRequestId: generateFallbackAttemptId(`grp-zero-${invoice.id}`),
              },
            },
          );
        }
        successCount++;
      } catch (err: unknown) {
        failCount++;
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${displayRoom(folio)}: ${msg}`);
      }
    }

    setSaving(false);
    await invalidateHotelRealtimeQueries(queryClient, hotelId);

    if (failCount === 0) {
      if (firstInvoiceId) {
        const confirmResult = await showConfirmDialog({
          icon: "question",
          title: "Thanh toán đoàn thành công!",
          text: `Đã phát hành hóa đơn và hoàn tất checkout cho ${successCount} phòng thuộc đoàn. Bạn có muốn xem & in hóa đơn ngay bây giờ không?`,
          confirmText: "Xem & In hóa đơn",
          cancelText: "Ở lại hàng đợi",
          reverseButtons: false,
        });
        if (confirmResult.isConfirmed) {
          router.push(
            `/hotels/${encodeURIComponent(hotelId)}/billing/invoices/${encodeURIComponent(firstInvoiceId)}`,
          );
          return;
        }
      } else {
        await showSuccessAlert(
          "Thanh toán đoàn thành công!",
          `Đã phát hành hóa đơn và hoàn tất checkout cho ${successCount} phòng thuộc đoàn.`,
        );
      }
      setSelectedGroupFolioIds(new Set());
    } else {
      const cleanErrors = errors.map((e) =>
        e
          .replace(/MISSING_AGREED_ROOM_RATE_SNAPSHOT/g, "Chưa có thông tin đơn giá phòng thỏa thuận")
          .replace(/FOLIO_NOT_OPEN_FOR_CHECKOUT/g, "Phòng đã đóng hoặc chưa sẵn sàng checkout")
          .replace(/ADJUSTMENT_CLIENT_REQUEST_ID_CONFLICT/g, "Xung đột thông tin phụ thu / giảm giá")
          .replace(/ROOM_CHECKOUT_STATUS_CONFLICT/g, "Trạng thái phòng đã thay đổi hoặc đã checkout")
          .replace(/DUPLICATE_CLIENT_REQUEST_ID_CONFLICT/g, "Yêu cầu thanh toán trùng lặp")
          .replace(/INVALID_PAYMENT_AMOUNT/g, "Số tiền thanh toán không hợp lệ")
          .replace(/INVOICE_ALREADY_PAID/g, "Hóa đơn đã được thanh toán trước đó")
          .replace(/COUNTER_PAYMENT_CONFLICT/g, "Xung đột giao dịch thanh toán tại quầy"),
      );
      await showWarningAlert(
        "Hoàn tất một phần",
        `Thành công ${successCount} phòng. ${failCount} phòng gặp sự cố:\n${cleanErrors.join("\n")}`,
      );
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[300px_1fr] 2xl:grid-cols-[320px_1fr_340px] items-start">
      {/* CỘT 1: HÀNG ĐỢI FOLIO & CHỌN PHÒNG / ĐOÀN */}
      <aside className="xl:sticky xl:top-20 flex max-h-[calc(100vh-6.5rem)] flex-col min-h-0 overflow-hidden rounded-2xl border border-[var(--outline-variant)] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        <div className="space-y-3 border-b border-[var(--outline-variant)] bg-[var(--surface-container-lowest,#fdfbf7)] p-4 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--secondary)]">
                HÀNG ĐỢI THANH TOÁN
              </p>
              <h2 className="vs-display mt-0.5 text-lg font-black text-[var(--primary)] text-balance">
                {checkoutMode === "GROUP" ? "Danh sách đoàn" : "Danh sách phòng"}
              </h2>
            </div>
            {checkoutMode === "GROUP" ? (
              <span className="rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-xs font-black text-amber-900 whitespace-nowrap">
                {billingGroups.length} đoàn
              </span>
            ) : (
              <span className="rounded-full bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 text-xs font-black text-emerald-900 whitespace-nowrap">
                {folios.length} phòng
              </span>
            )}
          </div>

          {/* Mode Switcher Toggle: Theo đoàn vs Phòng lẻ */}
          <div className="grid grid-cols-2 p-1 rounded-xl bg-[var(--surface-container-low,#f4efe6)] border border-[var(--outline-variant)]/60 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setCheckoutMode("GROUP");
                if (!selectedGroupId && billingGroups.length > 0) {
                  selectGroup(billingGroups[0]);
                }
              }}
              className={`py-1.5 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                checkoutMode === "GROUP"
                  ? "bg-[var(--primary)] text-white shadow-xs font-black"
                  : "text-[var(--on-surface-variant)] hover:text-[var(--primary)]"
              }`}
            >
              <VsIcon name="groups" className="text-sm" />
              <span>Theo đoàn ({billingGroups.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setCheckoutMode("SINGLE");
                if (folios.length > 0 && !selectedFolioId) {
                  setSelectedFolioId(folios[0].id);
                }
              }}
              className={`py-1.5 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                checkoutMode === "SINGLE"
                  ? "bg-white text-[var(--primary)] shadow-xs font-black"
                  : "text-[var(--on-surface-variant)] hover:text-[var(--primary)]"
              }`}
            >
              <VsIcon name="hotel" className="text-sm" />
              <span>Phòng lẻ ({soloFolios.length})</span>
            </button>
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
              placeholder={
                checkoutMode === "GROUP"
                  ? "Tìm tên đoàn, mã đoàn, số phòng..."
                  : "Tìm số phòng, tên khách..."
              }
              className="h-9 w-full rounded-xl border-0 bg-[var(--surface-container-low,#f4efe6)] pl-9 pr-3 text-xs font-semibold outline-none ring-1 ring-transparent focus:ring-[var(--primary)]"
            />
          </div>

          {/* Filter Pills khi ở chế độ Phòng lẻ */}
          {checkoutMode === "SINGLE" ? (
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                className={`rounded-lg px-2.5 py-1 text-xs font-extrabold transition cursor-pointer whitespace-nowrap ${
                  statusFilter === "ALL"
                    ? "bg-[#17201b] text-white shadow-xs"
                    : "bg-[var(--surface-container-low)] text-[var(--on-surface-variant)] hover:bg-gray-200"
                }`}
              >
                Tất cả ({folios.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("CHECKOUT_PENDING")}
                className={`rounded-lg px-2.5 py-1 text-xs font-extrabold transition cursor-pointer whitespace-nowrap ${
                  statusFilter === "CHECKOUT_PENDING"
                    ? "bg-amber-700 text-white shadow-xs"
                    : "bg-amber-50 text-amber-900 border border-amber-200/80 hover:bg-amber-100"
                }`}
              >
                Chờ checkout
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("OPEN")}
                className={`rounded-lg px-2.5 py-1 text-xs font-extrabold transition cursor-pointer whitespace-nowrap ${
                  statusFilter === "OPEN"
                    ? "bg-emerald-700 text-white shadow-xs"
                    : "bg-emerald-50 text-emerald-900 border border-emerald-200/80 hover:bg-emerald-100"
                }`}
              >
                Đang mở
              </button>
            </div>
          ) : null}
        </div>

        {/* List items - Viewport Scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-[var(--outline-variant)]/40">
          {checkoutMode === "GROUP" ? (
            <>
              {filteredBillingGroups.map((grp) => {
                const isSelected = selectedGroupId === grp.id;
                return (
                  <div
                    key={grp.id}
                    onClick={() => selectGroup(grp)}
                    className={`w-full p-3 text-left transition-all cursor-pointer ${
                      isSelected
                        ? "bg-amber-50/90 border-l-4 border-l-amber-600 shadow-2xs"
                        : "hover:bg-[var(--surface-container-low)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-extrabold text-sm text-[var(--primary)] truncate">
                          {grp.leadGuestName}
                        </p>
                        <p className="text-xs text-[var(--on-surface-variant)] truncate font-mono mt-0.5">
                          {grp.groupCode}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-black text-[var(--primary)]">
                          {formatMoney(grp.totalAmount, grp.currency)}
                        </p>
                        {grp.pendingCount > 0 ? (
                          <span className="inline-block text-xs font-bold text-amber-700 whitespace-nowrap">
                            {grp.pendingCount} chờ out
                          </span>
                        ) : (
                          <span className="inline-block text-xs font-medium text-emerald-700 whitespace-nowrap">
                            {grp.openCount} đang mở
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredBillingGroups.length === 0 ? (
                <div className="p-8 text-center text-xs text-[var(--on-surface-variant)]">
                  Không tìm thấy đoàn khách nào phù hợp.
                </div>
              ) : null}
            </>
          ) : (
            <>
              {filteredFolios.map((folio) => {
                const isSingleSelected = selectedFolioId === folio.id;
                const badge = getStatusBadge(folio.status);

                return (
                  <button
                    key={folio.id}
                    type="button"
                    onClick={() => selectSoloFolio(folio.id)}
                    className={`w-full p-3.5 text-left transition-all cursor-pointer ${
                      isSingleSelected
                        ? "bg-[#17201b]/10 border-l-4 border-l-[var(--primary)]"
                        : "hover:bg-[var(--surface-container-low)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="rounded-lg bg-[var(--primary)] px-2 py-0.5 text-xs font-black text-white shadow-xs">
                        {displayRoom(folio)}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-extrabold whitespace-nowrap ${badge.colorClass}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-extrabold text-sm text-[var(--primary)] truncate">
                          {displayGuest(folio)}
                        </p>
                        <p className="text-xs text-[var(--on-surface-variant)] truncate font-mono font-bold">
                          {folio.folioNumber ?? folio.id}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-black text-[var(--primary)]">
                          {formatMoney(getFolioTotalAmount(folio), folio.currency ?? "VND")}
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
            </>
          )}
        </div>
      </aside>

      {/* CỘT 2: CHI TIẾT FOLIO HOẶC BẢNG THANH TOÁN ĐOÀN */}
      <main className="xl:sticky xl:top-20 flex max-h-[calc(100vh-6.5rem)] flex-col min-h-0 overflow-hidden rounded-2xl border border-[var(--outline-variant)] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        {checkoutMode === "GROUP" ? (
          <>
            {/* Header Đoàn gọn gàng */}
            <div className="flex items-center justify-between border-b border-[var(--outline-variant)] bg-[var(--surface-container-lowest,#fdfbf7)] px-4 py-2.5 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-600 text-white shadow-xs shrink-0">
                  <VsIcon name="groups" className="text-base" />
                </span>
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="vs-display text-sm sm:text-base font-extrabold text-[var(--primary)] truncate">
                    {activeGroup ? activeGroup.leadGuestName : "Thanh toán đoàn"}
                  </h2>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={selectAllActiveGroupFolios}
                  className="text-xs font-bold text-[var(--primary)] hover:bg-[var(--surface-container-low)] border border-[var(--outline-variant)] rounded-lg px-2.5 py-1 transition flex items-center gap-1 cursor-pointer"
                >
                  <VsIcon name="done_all" className="text-sm" />
                  <span>Chọn hết</span>
                </button>
                {selectedGroupFolioIds.size > 0 ? (
                  <button
                    type="button"
                    onClick={clearGroupSelection}
                    className="text-xs font-bold text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-lg px-2 py-1 transition cursor-pointer"
                  >
                    Bỏ chọn
                  </button>
                ) : null}
              </div>
            </div>

            {/* Filter Bar */}
            <div className="px-3.5 py-1.5 border-b border-[var(--outline-variant)] bg-white flex items-center justify-between gap-2 shrink-0">
              <div className="relative flex-1 min-w-0">
                <VsIcon
                  name="search"
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-base text-[var(--outline)]"
                />
                <input
                  type="text"
                  value={groupTableSearch}
                  onChange={(e) => setGroupTableSearch(e.target.value)}
                  placeholder="Lọc số phòng..."
                  className="h-7.5 w-full rounded-lg border border-[var(--outline-variant)]/80 bg-[var(--surface-container-low,#f4efe6)] pl-7.5 pr-2.5 text-xs font-semibold outline-none ring-1 ring-transparent focus:ring-[var(--primary)]"
                />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setGroupTableStatusFilter("ALL")}
                  className={`rounded-lg px-2 py-0.5 text-xs font-black transition cursor-pointer whitespace-nowrap ${
                    groupTableStatusFilter === "ALL"
                      ? "bg-[#17201b] text-white shadow-xs"
                      : "bg-[var(--surface-container-low)] text-[var(--on-surface-variant)] hover:bg-gray-200"
                  }`}
                >
                  Tất cả ({activeGroup?.folios.length ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => setGroupTableStatusFilter("PENDING")}
                  className={`rounded-lg px-2 py-0.5 text-xs font-black transition cursor-pointer whitespace-nowrap ${
                    groupTableStatusFilter === "PENDING"
                      ? "bg-amber-700 text-white shadow-xs"
                      : "bg-amber-50 text-amber-900 border border-amber-200/80 hover:bg-amber-100"
                  }`}
                >
                  Chờ out ({activeGroup?.pendingCount ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => setGroupTableStatusFilter("OPEN")}
                  className={`rounded-lg px-2 py-0.5 text-xs font-black transition cursor-pointer whitespace-nowrap ${
                    groupTableStatusFilter === "OPEN"
                      ? "bg-emerald-700 text-white shadow-xs"
                      : "bg-emerald-50 text-emerald-900 border border-emerald-200/80 hover:bg-emerald-100"
                  }`}
                >
                  Đang mở ({activeGroup?.openCount ?? 0})
                </button>
              </div>
            </div>

            {/* Bảng Dịch Vụ & Phòng Đoàn */}
            {!activeGroup || filteredGroupRooms.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[var(--on-surface-variant)]">
                <VsIcon
                  name="checklist"
                  className="text-4xl text-[var(--outline)] mb-2"
                />
                <p className="text-sm font-bold text-[var(--primary)]">
                  Không tìm thấy phòng nào trong đoàn
                </p>
                <p className="text-xs mt-0.5 text-[var(--on-surface-variant)]">
                  {groupTableSearch ? "Thử xóa bộ lọc để xem toàn bộ danh sách phòng." : "Vui lòng chọn một đoàn từ danh sách bên trái."}
                </p>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse table-fixed min-w-[550px]">
                  <thead className="sticky top-0 z-10 border-b border-[var(--outline-variant)] bg-[var(--surface-container-low,#f4efe6)] text-xs font-black uppercase tracking-wider text-[var(--on-surface-variant)] shadow-xs">
                    <tr>
                      <th className="py-2 px-3 w-[8%] text-center whitespace-nowrap">
                        <input
                          type="checkbox"
                          disabled={filteredGroupRooms.length === 0 || filteredGroupRooms.every((f) => f.status === "CLOSED")}
                          checked={
                            filteredGroupRooms.filter((f) => f.status !== "CLOSED").length > 0 &&
                            filteredGroupRooms
                              .filter((f) => f.status !== "CLOSED")
                              .every((f) => selectedGroupFolioIds.has(f.id))
                          }
                          onChange={(e) => {
                            const openFolios = filteredGroupRooms.filter((f) => f.status !== "CLOSED");
                            if (e.target.checked) {
                              setSelectedGroupFolioIds((prev) => {
                                const next = new Set(prev);
                                openFolios.forEach((f) => next.add(f.id));
                                return next;
                              });
                            } else {
                              setSelectedGroupFolioIds((prev) => {
                                const next = new Set(prev);
                                openFolios.forEach((f) => next.delete(f.id));
                                return next;
                              });
                            }
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500 cursor-pointer disabled:opacity-40"
                        />
                      </th>
                      <th className="py-2 px-3 w-[22%] whitespace-nowrap">Phòng</th>
                      <th className="py-2 px-2.5 w-[22%] whitespace-nowrap">Khách</th>
                      <th className="py-2 px-2.5 w-[16%] whitespace-nowrap">Trạng thái</th>
                      <th className="py-2 px-3 text-right w-[20%] whitespace-nowrap">Thành tiền</th>
                      <th className="py-2 px-2 text-center w-[12%] whitespace-nowrap"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--outline-variant)]/50 text-sm">
                    {filteredGroupRooms.map((folio) => {
                      const isChecked = selectedGroupFolioIds.has(folio.id);
                      const isClosed = folio.status === "CLOSED";
                      const totalAmt = getFolioTotalAmount(folio);
                      const rCharge = getFolioRoomCharge(folio);
                      const svcCharge = Math.max(0, totalAmt - rCharge);
                      const badge = getStatusBadge(folio.status);
                      const guestName = displayGuest(folio);

                      return (
                        <tr
                          key={folio.id}
                          className={`hover:bg-amber-50/40 transition ${
                            isChecked ? "bg-amber-50/20" : "opacity-60 bg-gray-50/50"
                          }`}
                        >
                          <td className="py-2 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isClosed}
                              onChange={() => toggleGroupFolio(folio.id)}
                              className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <span className="rounded-lg bg-[var(--primary)] px-2 py-0.5 text-xs font-black text-white shadow-xs">
                              {displayRoom(folio)}
                            </span>
                          </td>
                          <td className="py-2 px-2.5">
                            <p className="font-semibold text-xs text-[var(--primary)] truncate">
                              {guestName}
                            </p>
                          </td>
                          <td className="py-2 px-2.5">
                            <span
                              className={`rounded-full border px-2 py-0.2 text-xs font-extrabold whitespace-nowrap ${badge.colorClass}`}
                            >
                              {badge.label}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-black text-xs text-[var(--primary)]">
                            <div>{formatMoney(totalAmt, folio.currency ?? "VND")}</div>
                            {svcCharge > 0 ? (
                              <div className="text-xs font-bold text-amber-700">
                                (DV: +{formatMoney(svcCharge, folio.currency ?? "VND")})
                              </div>
                            ) : null}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => setPreviewFolioId(folio.id)}
                              title="Soi chi tiết phí phòng"
                              className="inline-flex items-center justify-center rounded-lg bg-white border border-[var(--outline-variant)] px-2 py-0.5 text-xs font-bold text-[var(--primary)] hover:bg-[var(--surface-container-low)] shadow-2xs transition cursor-pointer whitespace-nowrap"
                            >
                              <VsIcon name="visibility" className="text-xs mr-0.5" />
                              <span>Soi</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-[var(--surface-container-low,#f4efe6)] border-t-2 border-[var(--outline-variant)] font-bold shadow-xs">
                    <tr>
                      <td colSpan={4} className="py-2 px-3 text-xs font-black text-[var(--primary)] uppercase">
                        Đã chọn ({selectedGroupFolios.length} phòng)
                      </td>
                      <td className="py-2 px-3 text-right font-black text-sm text-[var(--primary)]">
                        {formatMoney(groupSubtotal, currency)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Header Chi Tiết Đơn Phòng */}
            <div className="flex flex-col gap-3 border-b border-[var(--outline-variant)] bg-[var(--surface-container-lowest,#fdfbf7)] p-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
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
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="vs-display text-xl font-extrabold text-[var(--primary)] tracking-tight">
                      {displayRoom(selectedFolio)}
                    </h2>
                    <span className="rounded-full bg-emerald-100/90 text-emerald-900 border border-emerald-300/80 px-2.5 py-0.5 text-xs font-black shadow-xs whitespace-nowrap">
                      {displayGuest(selectedFolio)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--on-surface-variant)] flex items-center gap-2">
                    <span>
                      Mã Folio:{" "}
                      <span className="font-mono text-xs font-bold text-[var(--primary)]">
                        {selectedFolio?.folioNumber ?? selectedFolio?.id ?? "-"}
                      </span>
                    </span>
                  </p>
                </div>
              </div>
              <div className="text-left sm:text-right text-xs font-medium text-[var(--on-surface-variant)] shrink-0">
                <p>
                  Mở lúc:{" "}
                  <span className="font-bold text-xs text-[var(--primary)]">
                    {formatDate(
                      selectedFolio?.openedAt ?? selectedFolio?.createdAt,
                    )}
                  </span>
                </p>
              </div>
            </div>

            {/* Bảng Dịch Vụ & Chi Phí Phòng Lẻ */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse table-fixed min-w-[550px]">
                <thead className="sticky top-0 z-10 border-b border-[var(--outline-variant)] bg-[var(--surface-container-low,#f4efe6)] text-xs font-black uppercase tracking-wider text-[var(--on-surface-variant)] shadow-xs">
                  <tr>
                    <th className="py-3 px-3.5 w-[35%] whitespace-nowrap">
                      Tên chi phí / Dịch vụ
                    </th>
                    <th className="py-3 px-3 text-center w-[15%] whitespace-nowrap">
                      Số lượng
                    </th>
                    <th className="py-3 px-3 text-right w-[18%] whitespace-nowrap">
                      Đơn giá
                    </th>
                    <th className="py-3 px-3 text-right w-[18%] whitespace-nowrap">
                      Thành tiền
                    </th>
                    <th className="py-3 px-2 text-center w-[14%] whitespace-nowrap">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--outline-variant)]/50 text-sm">
                  {/* Hàng Tiền phòng khi folio đang mở và chưa phát hành hóa đơn */}
                  {!hasPostedRoomCharge &&
                  selectedFolio?.status === "OPEN" &&
                  roomChargeTotal > 0 ? (
                    <tr className="border-b border-amber-200/80 bg-amber-50/50 hover:bg-amber-100/40 transition">
                      <td className="py-3.5 px-3.5">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100/80 border border-amber-300 text-amber-900 shrink-0 shadow-2xs">
                            <VsIcon name="hotel" className="text-lg" />
                          </span>
                          <div className="min-w-0">
                            <p className="font-extrabold text-sm text-[var(--primary)] truncate">
                              Tiền phòng
                            </p>
                            <div className="mt-0.5">
                              <span
                                className="inline-flex items-center whitespace-nowrap rounded-md bg-amber-100 text-amber-900 border border-amber-300/80 px-2 py-0.5 text-xs font-bold"
                                title={`${estimatedRoomChargeData?.nights ?? 1} đêm × ${formatMoney(estimatedRoomChargeData?.nightlyRate ?? roomChargeTotal, currency)}`}
                              >
                                Tạm tính
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-center font-bold text-sm text-[var(--primary)]">
                        {estimatedRoomChargeData?.nights ?? 1}
                      </td>
                      <td className="py-3.5 px-3 text-right font-semibold text-sm text-[var(--on-surface-variant)]">
                        {formatMoney(
                          estimatedRoomChargeData?.nightlyRate ?? roomChargeTotal,
                          currency,
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-right font-black text-sm text-[var(--primary)]">
                        {formatMoney(roomChargeTotal, currency)}
                      </td>
                      <td className="py-3.5 px-2 text-center">
                        <span className="text-xs text-[var(--on-surface-variant)]">—</span>
                      </td>
                    </tr>
                  ) : null}
                  {activeItems.map((item) => {
                    const isVoided = item.status === "VOID";
                    return (
                      <tr
                        key={item.id}
                        className={`transition ${isVoided ? "bg-red-50/50 opacity-60 line-through" : "hover:bg-slate-50/80"}`}
                      >
                        <td className="py-3.5 px-3.5">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 border border-amber-200/80 text-[var(--primary)] shrink-0 shadow-2xs">
                              <VsIcon
                                name={getItemIcon(item.itemType)}
                                className="text-lg"
                              />
                            </span>
                            <div className="min-w-0">
                              <p className="font-extrabold text-sm text-[var(--primary)] truncate">
                                {item.nameSnapshot}
                              </p>
                              {(() => {
                                const isExternal =
                                  item.serviceSource === "EXTERNAL" ||
                                  (typeof item.billingSourceSnapshot === "object" &&
                                    item.billingSourceSnapshot !== null &&
                                    ("marketplaceOrderId" in
                                      (item.billingSourceSnapshot as object) ||
                                      (
                                        item.billingSourceSnapshot as Record<
                                          string,
                                          unknown
                                        >
                                      ).serviceSource === "EXTERNAL"));

                                const partnerName =
                                  item.partnerName ??
                                  (typeof item.billingSourceSnapshot === "object" &&
                                  item.billingSourceSnapshot !== null
                                    ? (
                                        item.billingSourceSnapshot as Record<
                                          string,
                                          unknown
                                        >
                                      ).partnerName
                                    : null);

                                if (isExternal) {
                                  return (
                                    <div className="space-y-0.5 mt-0.5">
                                      <span className="inline-block whitespace-nowrap text-xs font-extrabold text-purple-900 bg-purple-100 border border-purple-300 rounded-md px-2 py-0.5 shadow-2xs">
                                        Dịch vụ bên ngoài
                                      </span>
                                      {partnerName ? (
                                        <span className="block text-xs font-semibold text-purple-800">
                                          🤝 {String(partnerName)}
                                        </span>
                                      ) : null}
                                    </div>
                                  );
                                }

                                return (
                                  <span className="inline-block whitespace-nowrap text-xs font-extrabold text-[var(--secondary)] bg-amber-50 border border-amber-200/80 rounded-md px-2 py-0.5 mt-0.5">
                                    {item.itemType === "ROOM_CHARGE"
                                      ? "Tiền phòng"
                                      : item.itemType === "SERVICE"
                                        ? "Dịch vụ khách sạn"
                                        : item.itemType === "DISCOUNT"
                                          ? "Giảm giá"
                                          : item.itemType === "MANUAL_CHARGE"
                                            ? "Phụ thu"
                                            : item.itemType}
                                  </span>
                                );
                              })()}
                              {isVoided ? (
                                <span className="ml-1 inline-block text-xs font-bold text-red-700 bg-red-100 rounded px-1.5 py-0.5 whitespace-nowrap">
                                  Đã hủy
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-center font-black text-sm">
                          {item.quantity}
                        </td>
                        <td className="py-3.5 px-3 text-right font-medium text-slate-600 text-sm">
                          {item.itemType === "DISCOUNT" ? (
                            <span className="text-emerald-700 font-semibold">
                              -{formatMoney(Math.abs(toNumber(item.unitPriceSnapshot)), item.currency)}
                            </span>
                          ) : (
                            formatMoney(
                              toNumber(item.unitPriceSnapshot),
                              item.currency,
                            )
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-right font-black text-sm text-[var(--primary)]">
                          {item.itemType === "DISCOUNT" ? (
                            <span className="text-emerald-700 font-bold">
                              -{formatMoney(Math.abs(toNumber(item.totalSnapshot || item.discountAmountSnapshot)), item.currency)}
                            </span>
                          ) : (
                            formatMoney(toNumber(item.totalSnapshot), item.currency)
                          )}
                        </td>
                        <td className="py-3.5 px-2 text-center">
                          {canManage &&
                          selectedFolio?.status === "OPEN" &&
                          !isVoided &&
                          item.itemType !== "ROOM_CHARGE" ? (
                            <button
                              type="button"
                              title="Hủy khoản mục này"
                              onClick={async () => {
                                const res = await SwalVietSage.fire({
                                  icon: "warning",
                                  title: "Hủy khoản thu này?",
                                  text: `Xác nhận hủy mục "${item.nameSnapshot}" trên folio.`,
                                  input: "text",
                                  inputPlaceholder: "Lý do hủy (không bắt buộc)",
                                  showCancelButton: true,
                                  confirmButtonText: "Hủy khoản thu",
                                  cancelButtonText: "Quay lại",
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
                                  await invalidateHotelRealtimeQueries(
                                    queryClient,
                                    hotelId,
                                  );
                                  await showSuccessAlert(
                                    "Thành công",
                                    "Đã hủy khoản mục thành công.",
                                  );
                                } catch (err) {
                                  void showErrorAlert("Không thể hủy khoản mục", err);
                                }
                              }}
                              className="inline-flex items-center justify-center h-7 px-2 text-xs font-bold rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition cursor-pointer"
                            >
                              <VsIcon name="delete" className="text-xs mr-0.5" />
                              Hủy
                            </button>
                          ) : (
                            <span className="text-xs text-[var(--on-surface-variant)]">
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {!loading && activeItems.length === 0 && (!roomChargeTotal || selectedFolio?.status !== "OPEN") ? (
                <div className="flex flex-col items-center justify-center p-12 text-center text-[var(--on-surface-variant)]">
                  <VsIcon
                    name="receipt_long"
                    className="text-4xl text-[var(--outline)] mb-2"
                  />
                  <p className="text-sm font-bold text-[var(--primary)]">
                    Chưa có khoản phí nào trong folio
                  </p>
                  <p className="text-xs mt-1 text-[var(--on-surface-variant)] max-w-sm text-pretty">
                    Vui lòng kiểm tra lại thông tin lưu trú hoặc thêm phụ thu/dịch vụ nếu cần.
                  </p>
                </div>
              ) : null}

              {loading ? (
                <div className="flex items-center justify-center gap-2 p-12 text-xs font-semibold text-[var(--on-surface-variant)]">
                  <VsIcon
                    name="progress_activity"
                    className="animate-spin text-lg text-[var(--primary)]"
                  />
                  Đang tải chi tiết phí phòng...
                </div>
              ) : null}
            </div>
          </>
        )}
      </main>

      {/* CỘT 3: TỔNG TIỀN & XÁC NHẬN THU TIỀN */}
      <aside className="xl:sticky xl:top-20 flex max-h-[calc(100vh-6.5rem)] flex-col min-h-0 xl:col-span-2 2xl:col-span-1">
        {checkoutMode === "GROUP" ? (
          <div className="flex-1 min-h-0 flex flex-col rounded-2xl border border-[#d4af37]/50 bg-gradient-to-br from-[#2a1b08] via-[#38240b] to-[#1a1004] text-white shadow-2xl overflow-hidden">
            {/* Header cố định ở đầu thẻ */}
            <div className="shrink-0 border-b border-[#d4af37]/30 bg-[#1c1204]/80 px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-[#fce8b3]">
                    Tổng tiền đoàn
                  </p>
                </div>
                <span className="rounded-full bg-[#f59e0b]/30 px-2.5 py-0.5 text-xs font-black text-[#ffe270] border border-[#f59e0b]/60 shadow-xs whitespace-nowrap">
                  {currency}
                </span>
              </div>
              <p className="vs-display text-2xl sm:text-3xl font-black text-[#ffe270] tracking-tight drop-shadow-md break-words mt-0.5">
                {formatMoney(computedGroupTotal, currency)}
              </p>
            </div>

            {/* Thân thẻ cuộn mượt bên trong */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3">
              {/* Tùy chọn Xuất Hóa Đơn gọn gàng */}
              <div className="flex items-center justify-between gap-1 p-1 rounded-xl bg-[#1c1204] border border-[#d4af37]/35 text-xs">
                <button
                  type="button"
                  onClick={() => setMasterInvoiceMode("MASTER")}
                  className={`flex-1 py-1 px-2 rounded-lg text-xs font-bold transition cursor-pointer text-center ${
                    masterInvoiceMode === "MASTER"
                      ? "bg-[#d4af37] text-slate-950 font-black shadow-xs"
                      : "text-amber-200/80 hover:bg-white/5"
                  }`}
                >
                  1 Hóa đơn gộp
                </button>
                <button
                  type="button"
                  onClick={() => setMasterInvoiceMode("SPLIT")}
                  className={`flex-1 py-1 px-2 rounded-lg text-xs font-bold transition cursor-pointer text-center ${
                    masterInvoiceMode === "SPLIT"
                      ? "bg-[#d4af37] text-slate-950 font-black shadow-xs"
                      : "text-amber-200/80 hover:bg-white/5"
                  }`}
                >
                  Hóa đơn từng phòng
                </button>
              </div>

              <dl className="space-y-2 text-xs text-[#fff3d1]">
                {/* Tổng tiền phòng */}
                <div className="flex justify-between items-center">
                  <dt className="text-amber-100 font-bold">
                    Tiền phòng cả đoàn
                  </dt>
                  <dd className="font-black text-white">
                    {formatMoney(groupRoomChargeTotal, currency)}
                  </dd>
                </div>

                {/* Dịch vụ (chỉ hiện khi có phát sinh) */}
                {groupServiceTotal > 0 ? (
                  <div className="flex justify-between items-center">
                    <dt className="text-amber-100 font-bold">
                      Dịch vụ &amp; Minibar
                    </dt>
                    <dd className="font-black text-white">
                      {formatMoney(groupServiceTotal, currency)}
                    </dd>
                  </div>
                ) : null}

                {/* Tạm tính */}
                <div className="flex justify-between items-center border-t border-[#d4af37]/20 pt-1.5">
                  <dt className="text-amber-200 font-extrabold">
                    Tổng tạm tính
                  </dt>
                  <dd className="font-black text-[#ffe270]">
                    {formatMoney(groupSubtotal, currency)}
                  </dd>
                </div>

                {/* Phụ thu cả đoàn */}
                <div className="space-y-1 border-t border-[#d4af37]/25 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-amber-100 font-bold truncate">
                      Phụ thu đoàn
                    </dt>
                    <dd className="flex-1 max-w-[120px] shrink-0">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={groupSurchargeInput}
                        onChange={(e) =>
                          setGroupSurchargeInput(
                            formatNumberOrPercentInput(e.target.value),
                          )
                        }
                        placeholder="0 hoặc 10%"
                        className="h-7.5 w-full rounded-lg border border-[#d4af37]/70 bg-[#1c1204] px-2 py-0.5 text-right text-xs font-black text-[#ffe270] placeholder-[#ffe270]/60 outline-none focus:border-[#fbbf24]"
                      />
                    </dd>
                  </div>
                  {groupSurchargeParsed.isPercentage && groupSurchargeParsed.amount > 0 ? (
                    <p className="text-xs font-bold text-right text-[#ffe270]">
                      +{formatMoney(groupSurchargeParsed.amount, currency)}
                    </p>
                  ) : null}
                  {canManage ? (
                    <div className="flex flex-nowrap gap-1 justify-end pt-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setGroupSurchargeInput("5%");
                          if (!groupSurchargeNote) setGroupSurchargeNote("Phụ thu đoàn 5%");
                        }}
                        className="rounded bg-[#d4af37]/30 px-1.5 py-0.2 text-xs font-bold text-[#ffe270] hover:bg-[#d4af37]/50 border border-[#d4af37]/50 cursor-pointer"
                      >
                        +5%
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setGroupSurchargeInput("10%");
                          if (!groupSurchargeNote) setGroupSurchargeNote("Phụ thu đoàn 10%");
                        }}
                        className="rounded bg-[#d4af37]/30 px-1.5 py-0.2 text-xs font-bold text-[#ffe270] hover:bg-[#d4af37]/50 border border-[#d4af37]/50 cursor-pointer"
                      >
                        +10%
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setGroupSurchargeInput(formatNumberInput("200000"));
                          if (!groupSurchargeNote) setGroupSurchargeNote("Phụ thu đoàn");
                        }}
                        className="rounded bg-[#d4af37]/30 px-1.5 py-0.2 text-xs font-bold text-[#ffe270] hover:bg-[#d4af37]/50 border border-[#d4af37]/50 cursor-pointer"
                      >
                        +200k
                      </button>
                    </div>
                  ) : null}
                </div>

                {/* Giảm giá cả đoàn */}
                <div className="space-y-1 border-t border-[#d4af37]/25 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-amber-100 font-bold truncate">
                      Giảm giá đoàn
                    </dt>
                    <dd className="flex-1 max-w-[120px] shrink-0">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={groupDiscountInput}
                        onChange={(e) =>
                          setGroupDiscountInput(
                            formatNumberOrPercentInput(e.target.value),
                          )
                        }
                        placeholder="0 hoặc 10%"
                        className="h-7.5 w-full rounded-lg border border-[#d4af37]/70 bg-[#1c1204] px-2 py-0.5 text-right text-xs font-black text-[#fef08a] placeholder-[#fef08a]/60 outline-none focus:border-[#fbbf24]"
                      />
                    </dd>
                  </div>
                  {groupDiscountParsed.isPercentage && groupDiscountParsed.amount > 0 ? (
                    <p className="text-xs font-bold text-right text-[#fef08a]">
                      -{formatMoney(groupDiscountParsed.amount, currency)}
                    </p>
                  ) : null}
                  {canManage ? (
                    <div className="flex flex-nowrap gap-1 justify-end pt-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setGroupDiscountInput("5%");
                          setGroupDiscountNote("Chiết khấu đoàn 5%");
                        }}
                        className="rounded bg-[#d4af37]/30 px-1.5 py-0.2 text-xs font-bold text-[#fef08a] hover:bg-[#d4af37]/50 border border-[#d4af37]/50 cursor-pointer"
                      >
                        -5%
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setGroupDiscountInput("10%");
                          setGroupDiscountNote("Chiết khấu đoàn 10%");
                        }}
                        className="rounded bg-[#d4af37]/30 px-1.5 py-0.2 text-xs font-bold text-[#fef08a] hover:bg-[#d4af37]/50 border border-[#d4af37]/50 cursor-pointer"
                      >
                        -10%
                      </button>
                    </div>
                  ) : null}
                </div>
              </dl>
            </div>

            {/* Chân ghim cố định cho nút thanh toán đoàn (Sticky Action Footer) */}
            <div className="shrink-0 border-t border-[#d4af37]/40 bg-[#140c03] p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.5)]">
              {(selectedGroupFolios.length > 0 &&
                selectedGroupFolios.every((f) => f.status === "CLOSED")) ||
              (activeGroup &&
                activeGroup.folios.length > 0 &&
                activeGroup.folios.every((f) => f.status === "CLOSED")) ? (
                <button
                  type="button"
                  onClick={async () => {
                    const closedInvoiceId = (
                      selectedGroupFolios.length > 0 ? selectedGroupFolios : activeGroup.folios
                    )
                      .map((f) => getFolioInvoiceId(f))
                      .find(Boolean);
                    if (!closedInvoiceId) {
                      void SwalVietSage.fire({
                        icon: "warning",
                        title: "Chưa có mã hóa đơn",
                        text: "Các phòng trong đoàn đã đóng nhưng chưa tìm thấy mã hóa đơn.",
                        confirmButtonText: "Đã hiểu",
                      });
                      return;
                    }
                    const result = await showConfirmDialog({
                      icon: "question",
                      title: "Xem & In hóa đơn đoàn?",
                      text: "Hệ thống sẽ chuyển sang trang hóa đơn để xem chi tiết và in ấn.",
                      confirmText: "Xem & In",
                      cancelText: "Hủy",
                    });
                    if (result.isConfirmed) {
                      router.push(
                        `/hotels/${encodeURIComponent(hotelId)}/billing/invoices/${encodeURIComponent(closedInvoiceId)}`,
                      );
                    }
                  }}
                  className="w-full inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#fbbf24] via-[#f59e0b] to-[#d97706] px-4 text-sm font-black text-[#1c1204] shadow-lg shadow-amber-950/60 transition hover:from-[#f59e0b] hover:to-[#b45309] active:scale-[0.99] cursor-pointer"
                >
                  <VsIcon name="description" className="text-lg" />
                  <span>Xem &amp; In hóa đơn đoàn</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void issueGroupInvoicesAndCollect()}
                  disabled={
                    selectedGroupFolios.filter((f) => f.status !== "CLOSED").length === 0 ||
                    !canManage ||
                    saving
                  }
                  className="w-full inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#fbbf24] via-[#f59e0b] to-[#d97706] px-4 text-sm font-black text-[#1c1204] shadow-lg shadow-amber-950/60 transition hover:from-[#f59e0b] hover:to-[#b45309] active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                >
                  <VsIcon
                    name={saving ? "sync" : "payments"}
                    className={`text-lg ${saving ? "animate-spin" : ""}`}
                  />
                  {saving
                    ? "Đang xử lý checkout..."
                    : `Thanh toán (${selectedGroupFolios.filter((f) => f.status !== "CLOSED").length} phòng)`}
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Hướng dẫn nghiệp vụ điều chỉnh chi phí Folio Phòng Lẻ */}
            <details className="group shrink-0 mb-2 rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 via-amber-100/60 to-orange-50 p-2.5 text-amber-950 shadow-xs">
              <summary className="flex cursor-pointer items-center justify-between gap-2 font-black text-xs text-amber-950 select-none">
                <span className="flex items-center gap-1.5 min-w-0">
                  <VsIcon name="info" className="text-base text-amber-700 shrink-0" />
                  <span className="truncate">Hướng dẫn &amp; Quy tắc %</span>
                </span>
                <span className="text-xs font-bold text-amber-800 shrink-0 rounded-md bg-amber-200/70 px-2 py-0.5 hover:bg-amber-300/80 transition">
                  <span className="group-open:hidden">Mở rộng ▾</span>
                  <span className="hidden group-open:inline">Thu gọn ▴</span>
                </span>
              </summary>
              <ul className="mt-2 space-y-1.5 border-t border-amber-200/80 pt-2 text-xs font-medium text-amber-950 pl-1">
                <li className="flex items-start gap-1.5">
                  <span className="text-amber-700 font-extrabold">•</span>
                  <span>
                    <strong className="font-black text-amber-950">Phụ thu (Tăng giá)</strong>: Nhận phòng sớm, trả trễ, phụ thu người ở...
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-amber-700 font-extrabold">•</span>
                  <span>
                    <strong className="font-black text-amber-950">Giảm giá</strong>: Ưu đãi khách VIP, voucher...
                  </span>
                </li>
              </ul>
            </details>

            {(activeSummary?.activeServiceRequests?.length ?? 0) > 0 ? (
              <section
                aria-label="Đối soát dịch vụ chưa hoàn thành"
                className="shrink-0 mb-2 max-h-36 overflow-y-auto rounded-2xl border border-amber-300 bg-amber-50 p-2.5 text-xs"
              >
                <h3 className="font-bold text-amber-950">
                  Dịch vụ chưa hoàn thành
                </h3>
                <p className="mt-0.5 text-xs text-amber-900">
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
                          className="mt-1.5 h-8.5 w-full rounded-lg border px-2 text-xs"
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
                className="shrink-0 mb-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-800"
              >
                {checkoutError}
              </p>
            ) : null}

            {/* Luxurious Orange-Yellow Golden Checkout Card Cho Phòng Lẻ Với Chân Ghim Cố Định */}
            <div className="flex-1 min-h-0 flex flex-col rounded-2xl border border-[#d4af37]/50 bg-gradient-to-br from-[#2a1b08] via-[#38240b] to-[#1a1004] text-white shadow-2xl overflow-hidden">
              {/* Header cố định ở đầu thẻ */}
              <div className="shrink-0 border-b border-[#d4af37]/30 bg-[#1c1204]/80 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-wider text-[#fce8b3]">
                    Tổng tiền
                  </p>
                  <span className="rounded-full bg-[#f59e0b]/30 px-3 py-1 text-xs font-black text-[#ffe270] border border-[#f59e0b]/60 shadow-xs whitespace-nowrap">
                    {currency}
                  </span>
                </div>
                <p className="vs-display text-3xl font-black text-[#ffe270] tracking-tight drop-shadow-md break-words mt-1">
                  {formatMoney(computedTotal, currency)}
                </p>
              </div>

              {/* Thân thẻ cuộn mượt bên trong */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3.5">
                <dl className="space-y-2.5 text-xs sm:text-sm text-[#fff3d1]">
                {/* Tiền phòng */}
                <div className="flex justify-between items-center">
                  <dt className="text-amber-100 font-bold text-xs sm:text-sm flex items-center gap-1">
                    <span>🏨 Tiền phòng</span>
                  </dt>
                  <dd className="font-black text-sm sm:text-base text-white">
                    {formatMoney(roomChargeTotal, currency)}
                  </dd>
                </div>

                {roomRateComparison ? (
                  <div className="space-y-1.5 rounded-xl border border-[#d4af37]/40 bg-[#1c1204]/70 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-xs font-bold text-[#fce8b3]">Giá gốc tiền phòng</dt>
                      <dd className="text-sm font-black text-white">
                        {formatMoney(toNumber(roomRateComparison.baseSubtotal), currency)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-[#d4af37]/25 pt-1.5">
                      <dt
                        className={`text-xs font-extrabold ${
                          roomRateDifference > 0
                            ? "text-amber-300"
                            : roomRateDifference < 0
                              ? "text-emerald-300"
                              : "text-[#fce8b3]"
                        }`}
                      >
                        {roomRateDifference > 0
                          ? "Tăng so với giá gốc"
                          : roomRateDifference < 0
                            ? "Giảm so với giá gốc"
                            : "Không đổi so với giá gốc"}
                      </dt>
                      <dd
                        className={`text-sm font-black ${
                          roomRateDifference > 0
                            ? "text-amber-300"
                            : roomRateDifference < 0
                              ? "text-emerald-300"
                              : "text-white"
                        }`}
                      >
                        {roomRateDifference > 0 ? "+" : roomRateDifference < 0 ? "−" : ""}
                        {formatMoney(Math.abs(roomRateDifference), currency)}
                      </dd>
                    </div>
                    <p className="text-xs text-[#fce8b3]">
                      {roomRateComparison.direction === "UNCHANGED"
                        ? `${estimatedRoomChargeData?.nights ?? 1} đêm cùng giá gốc.`
                        : `${estimatedRoomChargeData?.nights ?? 1} đêm × ${formatMoney(
                            Math.abs(toNumber(roomRateComparison.nightlyDifference)),
                            currency,
                          )} mỗi đêm.`}
                    </p>
                  </div>
                ) : null}

                {/* Dịch vụ khách sạn (Internal) */}
                <div className="flex justify-between items-center">
                  <dt className="text-amber-100 font-bold text-xs sm:text-sm flex items-center gap-1">
                    <span>🔔 Dịch vụ khách sạn</span>
                  </dt>
                  <dd className="font-black text-sm sm:text-base text-white">
                    {formatMoney(hotelServiceChargeTotal, currency)}
                  </dd>
                </div>

                {/* Thu hộ dịch vụ bên ngoài */}
                {externalServiceCollectionTotal > 0 ? (
                  <div className="space-y-1 rounded-xl bg-purple-950/40 p-2 border border-purple-400/40">
                    <div className="flex justify-between items-center">
                      <dt className="text-purple-200 font-extrabold text-xs flex items-center gap-1.5">
                        <span className="rounded-md bg-purple-500/30 px-1.5 py-0.5 text-xs text-purple-200 whitespace-nowrap">
                          🤝 Thu hộ đối tác
                        </span>
                        <span className="truncate">Dịch vụ bên ngoài</span>
                      </dt>
                      <dd className="font-black text-sm text-purple-200 whitespace-nowrap">
                        {formatMoney(externalServiceCollectionTotal, currency)}
                      </dd>
                    </div>
                    <p className="text-xs text-purple-300 font-semibold">
                      (Thu hộ đối tác — Không ghi nhận vào doanh thu khách sạn)
                    </p>
                  </div>
                ) : null}

                {/* Phụ thu đã ghi nhận trong folio */}
                {manualChargeTotal > 0 ? (
                  <div className="flex justify-between items-center">
                    <dt className="text-amber-100 font-bold text-xs sm:text-sm flex items-center gap-1">
                      <span>⚡ Phụ thu đã thêm</span>
                    </dt>
                    <dd className="font-black text-sm sm:text-base text-amber-300">
                      +{formatMoney(manualChargeTotal, currency)}
                    </dd>
                  </div>
                ) : null}

                {/* Tạm tính */}
                <div className="flex justify-between items-center border-t border-[#d4af37]/20 pt-2">
                  <dt className="text-amber-200 font-extrabold text-xs sm:text-sm">
                    Tổng tạm tính
                  </dt>
                  <dd className="font-black text-sm sm:text-base text-[#ffe270]">
                    {formatMoney(subtotal, currency)}
                  </dd>
                </div>

                <div className="flex justify-between items-center">
                  <dt className="text-amber-100 font-bold text-xs sm:text-sm">
                    Thuế GTGT
                  </dt>
                  <dd className="font-black text-sm sm:text-base text-white">
                    {formatMoney(tax, currency)}
                  </dd>
                </div>

                {/* Giảm giá đã áp dụng trong folio */}
                {existingDiscountTotal > 0 ? (
                  <div className="flex justify-between items-center border-t border-[#d4af37]/20 pt-2">
                    <dt className="text-emerald-300 font-extrabold text-xs sm:text-sm flex items-center gap-1">
                      <span>🏷️ Giảm giá đã áp dụng</span>
                    </dt>
                    <dd className="font-black text-sm sm:text-base text-emerald-400">
                      -{formatMoney(existingDiscountTotal, currency)}
                    </dd>
                  </div>
                ) : null}

                {/* Khi folio đã đóng */}
                {selectedFolio?.status === "CLOSED" ? (
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/60 p-3 text-center space-y-1">
                    <div className="flex items-center justify-center gap-1.5 text-xs font-black text-emerald-400">
                      <VsIcon name="check_circle" className="text-base" />
                      <span>Folio đã hoàn tất thanh toán &amp; đóng</span>
                    </div>
                    <p className="text-xs text-emerald-300/80">
                      Hóa đơn đã được phát hành. Bấm nút bên dưới để xem hoặc in lại hóa đơn.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Phụ thu (Tăng giá) */}
                    <div className="space-y-1.5 border-t border-[#d4af37]/25 pt-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-amber-100 font-extrabold text-xs sm:text-sm min-w-0 truncate">
                          Phụ thu (Tăng giá)
                        </dt>
                        <dd className="flex-1 min-w-0 max-w-[150px] shrink-0">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={surchargeInput}
                            onChange={(e) =>
                              setSurchargeInput(
                                formatNumberOrPercentInput(e.target.value),
                              )
                            }
                            placeholder="0 hoặc 10%"
                            className="h-9 w-full min-w-0 rounded-xl border border-[#d4af37]/70 bg-[#1c1204] px-2.5 py-1 text-right text-sm font-black text-[#ffe270] placeholder-[#ffe270]/60 outline-none focus:border-[#fbbf24] focus:ring-1 focus:ring-[#fbbf24] shadow-inner"
                          />
                        </dd>
                      </div>

                      {canManage ? (
                        <input
                          type="text"
                          value={surchargeNote}
                          onChange={(e) => setSurchargeNote(e.target.value)}
                          placeholder="Lý do phụ thu (nhận phòng sớm, phụ thu người ở...)"
                          className="h-8 w-full rounded-xl border border-[#d4af37]/40 bg-[#1c1204]/90 px-2.5 py-1 text-xs font-medium text-[#ffe270] placeholder-[#ffe270]/60 outline-none focus:border-[#fbbf24] focus:ring-1 focus:ring-[#fbbf24]"
                        />
                      ) : null}

                      {surchargeParsed.isPercentage && surchargeParsed.amount > 0 ? (
                        <p className="text-xs font-bold text-right text-[#ffe270]">
                          ⚡ Quy đổi {surchargeParsed.percentage}% Tạm tính: +
                          {formatMoney(surchargeParsed.amount, currency)}
                        </p>
                      ) : null}

                      {canManage ? (
                        <div className="flex flex-nowrap gap-1 justify-end overflow-x-auto no-scrollbar pt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSurchargeInput("5%");
                              if (!surchargeNote) setSurchargeNote("Phụ thu 5%");
                            }}
                            className="rounded-lg bg-[#d4af37]/30 px-2 py-0.5 text-xs font-bold text-[#ffe270] hover:bg-[#d4af37]/50 border border-[#d4af37]/50 transition shrink-0 whitespace-nowrap cursor-pointer"
                          >
                            +5%
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSurchargeInput("10%");
                              if (!surchargeNote) setSurchargeNote("Phụ thu 10%");
                            }}
                            className="rounded-lg bg-[#d4af37]/30 px-2 py-0.5 text-xs font-bold text-[#ffe270] hover:bg-[#d4af37]/50 border border-[#d4af37]/50 transition shrink-0 whitespace-nowrap cursor-pointer"
                          >
                            +10%
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSurchargeInput(formatNumberInput("50000"));
                              setSurchargeNote("Phụ thu nhận phòng sớm");
                            }}
                            className="rounded-lg bg-[#d4af37]/30 px-2 py-0.5 text-xs font-bold text-[#ffe270] hover:bg-[#d4af37]/50 border border-[#d4af37]/50 transition shrink-0 whitespace-nowrap cursor-pointer"
                          >
                            +50k Sớm
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSurchargeInput(formatNumberInput("100000"));
                              setSurchargeNote("Phụ thu trả phòng muộn");
                            }}
                            className="rounded-lg bg-[#d4af37]/30 px-2 py-0.5 text-xs font-bold text-[#ffe270] hover:bg-[#d4af37]/50 border border-[#d4af37]/50 transition shrink-0 whitespace-nowrap cursor-pointer"
                          >
                            +100k Muộn
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {/* Giảm giá */}
                    <div className="space-y-1.5 border-t border-[#d4af37]/25 pt-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-amber-100 font-extrabold text-xs sm:text-sm min-w-0 truncate">
                          Giảm giá
                        </dt>
                        <dd className="flex-1 min-w-0 max-w-[150px] shrink-0">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={discountInput}
                            onChange={(e) =>
                              setDiscountInput(
                                formatNumberOrPercentInput(e.target.value),
                              )
                            }
                            placeholder="0 hoặc 10%"
                            className="h-9 w-full min-w-0 rounded-xl border border-[#d4af37]/70 bg-[#1c1204] px-2.5 py-1 text-right text-sm font-black text-[#fef08a] placeholder-[#fef08a]/60 outline-none focus:border-[#fbbf24] focus:ring-1 focus:ring-[#fbbf24] shadow-inner"
                          />
                        </dd>
                      </div>

                      {canManage ? (
                        <input
                          type="text"
                          value={discountNote}
                          onChange={(e) => setDiscountNote(e.target.value)}
                          placeholder="Lý do giảm giá (khách thân thiết, ưu đãi đặc biệt...)"
                          className="h-8 w-full rounded-xl border border-[#d4af37]/40 bg-[#1c1204]/90 px-2.5 py-1 text-xs font-medium text-[#fef08a] placeholder-[#fef08a]/60 outline-none focus:border-[#fbbf24] focus:ring-1 focus:ring-[#fbbf24]"
                        />
                      ) : null}

                      {discountParsed.isPercentage && discountParsed.amount > 0 ? (
                        <p className="text-xs font-bold text-right text-[#fef08a]">
                          ⚡ Quy đổi {discountParsed.percentage}% Tạm tính: -
                          {formatMoney(discountParsed.amount, currency)}
                        </p>
                      ) : null}

                      {canManage ? (
                        <div className="flex flex-nowrap gap-1 justify-end overflow-x-auto no-scrollbar pt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setDiscountInput("5%");
                              setDiscountNote("Giảm giá 5% Khách VIP");
                            }}
                            className="rounded-lg bg-[#d4af37]/30 px-2 py-0.5 text-xs font-bold text-[#fef08a] hover:bg-[#d4af37]/50 border border-[#d4af37]/50 transition shrink-0 whitespace-nowrap cursor-pointer"
                          >
                            -5% VIP
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDiscountInput("10%");
                              setDiscountNote("Giảm giá 10% Khách VIP");
                            }}
                            className="rounded-lg bg-[#d4af37]/30 px-2 py-0.5 text-xs font-bold text-[#fef08a] hover:bg-[#d4af37]/50 border border-[#d4af37]/50 transition shrink-0 whitespace-nowrap cursor-pointer"
                          >
                            -10% VIP
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDiscountInput("15%");
                              setDiscountNote("Ưu đãi voucher -15%");
                            }}
                            className="rounded-lg bg-[#d4af37]/30 px-2 py-0.5 text-xs font-bold text-[#fef08a] hover:bg-[#d4af37]/50 border border-[#d4af37]/50 transition shrink-0 whitespace-nowrap cursor-pointer"
                          >
                            -15% Voucher
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </>
                )}

                {/* Phương thức thanh toán khi checkout */}
                {selectedFolio?.status !== "CLOSED" ? (
                  <div className="flex items-center justify-between gap-2 border-t border-[#d4af37]/25 pt-2.5">
                    <dt className="text-amber-100 font-extrabold text-xs uppercase tracking-wider min-w-0">
                      Hình thức
                    </dt>
                    <dd className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setCheckoutPaymentMethod("CASH")}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                          checkoutPaymentMethod === "CASH"
                            ? "bg-[#d4af37] text-slate-950 font-black shadow-xs"
                            : "bg-[#1c1204] text-[#ffe270] border border-[#d4af37]/40 hover:bg-[#d4af37]/20"
                        }`}
                      >
                        💵 TM
                      </button>
                      <button
                        type="button"
                        onClick={() => setCheckoutPaymentMethod("BANK_TRANSFER")}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                          checkoutPaymentMethod === "BANK_TRANSFER"
                            ? "bg-[#d4af37] text-slate-950 font-black shadow-xs"
                            : "bg-[#1c1204] text-[#ffe270] border border-[#d4af37]/40 hover:bg-[#d4af37]/20"
                        }`}
                      >
                        🏦 CK
                      </button>
                      <button
                        type="button"
                        onClick={() => setCheckoutPaymentMethod("CARD")}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                          checkoutPaymentMethod === "CARD"
                            ? "bg-[#d4af37] text-slate-950 font-black shadow-xs"
                            : "bg-[#1c1204] text-[#ffe270] border border-[#d4af37]/40 hover:bg-[#d4af37]/20"
                        }`}
                      >
                        💳 Thẻ
                      </button>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>

            {/* Chân ghim cố định cho nút thao tác chính (Sticky Action Footer) */}
            <div className="shrink-0 border-t border-[#d4af37]/40 bg-[#140c03] p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.5)]">
              {selectedFolio?.status === "CLOSED" ? (
                <button
                  type="button"
                  onClick={async () => {
                    const invoiceId = getFolioInvoiceId(selectedFolio);
                    if (!invoiceId) {
                      void SwalVietSage.fire({
                        icon: "warning",
                        title: "Chưa có mã hóa đơn",
                        text: `Folio ${selectedFolio?.folioNumber ?? selectedFolio?.id} đã đóng nhưng chưa có thông tin hóa đơn.`,
                        confirmButtonText: "Đã hiểu",
                      });
                      return;
                    }
                    const result = await showConfirmDialog({
                      icon: "question",
                      title: "Xuất hóa đơn?",
                      text: "Hệ thống sẽ chuyển sang trang chi tiết để in và xuất hóa đơn.",
                      confirmText: "Đồng ý",
                      cancelText: "Hủy",
                    });
                    if (result.isConfirmed) {
                      router.push(
                        `/hotels/${encodeURIComponent(hotelId)}/billing/invoices/${encodeURIComponent(invoiceId)}`,
                      );
                    }
                  }}
                  disabled={!selectedFolioId}
                  className="w-full inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#fbbf24] via-[#f59e0b] to-[#d97706] px-4 text-sm sm:text-base font-black text-[#1c1204] shadow-xl shadow-amber-950/60 transition hover:from-[#f59e0b] hover:to-[#b45309] active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                >
                  <VsIcon name="description" className="text-xl" />
                  Xem &amp; Xuất hóa đơn
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void issueInvoiceAndCollect()}
                  disabled={
                    !selectedFolioId ||
                    !canManage ||
                    saving
                  }
                  className="w-full inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#fbbf24] via-[#f59e0b] to-[#d97706] px-4 text-sm sm:text-base font-black text-[#1c1204] shadow-xl shadow-amber-950/60 transition hover:from-[#f59e0b] hover:to-[#b45309] active:scale-[0.99] disabled:opacity-50 cursor-pointer text-balance"
                >
                  <VsIcon
                    name={saving ? "sync" : "payments"}
                    className={`text-xl ${saving ? "animate-spin" : ""}`}
                  />
                  {saving ? "Đang xử lý checkout..." : "Thanh toán & Trả phòng"}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </aside>

      {/* MODAL SOI CHI TIẾT PHÒNG IN-PLACE (BOX NGANG CĂN GIỮA MÀN HÌNH CHUẨN VIETSAGE) */}
      {previewFolioId && previewFolioItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-[var(--outline-variant)]">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--outline-variant)] bg-[var(--surface-container-lowest,#fdfbf7)] shrink-0">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-[var(--primary)] px-3 py-1 text-sm font-black text-white shadow-xs">
                  {displayRoom(previewFolioItem)}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-[var(--primary)]">
                      {displayGuest(previewFolioItem)}
                    </h3>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-extrabold whitespace-nowrap ${
                        getStatusBadge(previewFolioItem.status).colorClass
                      }`}
                    >
                      {getStatusBadge(previewFolioItem.status).label}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--on-surface-variant)] font-mono font-bold">
                    Mã Folio: {previewFolioItem.folioNumber ?? previewFolioItem.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewFolioId(null)}
                className="h-8 w-8 rounded-full bg-[var(--surface-container-low)] hover:bg-gray-200 flex items-center justify-center text-slate-700 transition cursor-pointer"
              >
                <VsIcon name="close" className="text-lg" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
              {previewFolioLoading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs font-bold text-[var(--on-surface-variant)]">
                  <VsIcon name="progress_activity" className="animate-spin text-2xl text-[var(--primary)]" />
                  <span>Đang tải dữ liệu chi tiết phòng...</span>
                </div>
              ) : (
                <>
                  {/* Tóm tắt chỉ số nhanh của phòng */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-3 shadow-2xs">
                      <p className="text-xs font-bold text-[var(--on-surface-variant)]">Tiền phòng ({previewFolioMetrics.nights} đêm)</p>
                      <p className="text-base font-black text-[var(--primary)] mt-1">
                        {formatMoney(
                          previewFolioMetrics.roomCharge,
                          previewFolioItem.currency ?? "VND",
                        )}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-3 shadow-2xs">
                      <p className="text-xs font-bold text-[var(--on-surface-variant)]">Dịch vụ &amp; Minibar</p>
                      <p className="text-base font-black text-amber-900 mt-1">
                        {formatMoney(
                          previewFolioMetrics.serviceCharge,
                          previewFolioItem.currency ?? "VND",
                        )}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[var(--outline-variant)] bg-emerald-50/50 p-3 shadow-2xs">
                      <p className="text-xs font-bold text-emerald-900">Tổng cộng phòng này</p>
                      <p className="text-base font-black text-emerald-700 mt-1">
                        {formatMoney(
                          previewFolioMetrics.total,
                          previewFolioItem.currency ?? "VND",
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Danh sách mục chi phí trong Folio */}
                  <div className="rounded-xl border border-[var(--outline-variant)] overflow-hidden">
                    <div className="bg-[var(--surface-container-low,#f4efe6)] px-3.5 py-2 text-xs font-black uppercase text-[var(--on-surface-variant)] border-b border-[var(--outline-variant)]">
                      Danh mục khoản phí phát sinh ({previewFolioItems.length} mục)
                    </div>
                    {previewFolioItems.length === 0 ? (
                      <div className="p-6 text-center text-xs text-[var(--on-surface-variant)]">
                        Không có dịch vụ phát sinh ngoài tiền phòng cơ bản.
                      </div>
                    ) : (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="border-b border-[var(--outline-variant)]/60 bg-white font-bold text-[var(--on-surface-variant)]">
                          <tr>
                            <th className="py-2 px-3">Loại phí / Tên mục</th>
                            <th className="py-2 px-2 text-center">SL</th>
                            <th className="py-2 px-3 text-right">Đơn giá</th>
                            <th className="py-2 px-3 text-right">Thành tiền</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--outline-variant)]/40">
                          {previewFolioItems.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50/80">
                              <td className="py-2 px-3 font-semibold text-[var(--primary)]">
                                {item.nameSnapshot || item.description || item.itemType}
                              </td>
                              <td className="py-2 px-2 text-center text-slate-600 font-bold">
                                {item.quantity ?? 1}
                              </td>
                              <td className="py-2 px-3 text-right text-slate-700">
                                {formatMoney(toNumber(item.unitPriceSnapshot), previewFolioItem.currency ?? "VND")}
                              </td>
                              <td className="py-2 px-3 text-right font-black text-[var(--primary)]">
                                {formatMoney(toNumber(item.totalSnapshot), previewFolioItem.currency ?? "VND")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end p-3.5 border-t border-[var(--outline-variant)] bg-[var(--surface-container-lowest,#fdfbf7)] shrink-0 gap-2">
              {previewFolioItem?.invoiceId || (previewFolioSummary as FolioListItem | null)?.invoiceId ? (
                <button
                  type="button"
                  onClick={() => {
                    const invId =
                      previewFolioItem?.invoiceId || (previewFolioSummary as FolioListItem | null)?.invoiceId;
                    if (invId) {
                      setPreviewFolioId(null);
                      router.push(
                        `/hotels/${encodeURIComponent(hotelId)}/billing/invoices/${encodeURIComponent(invId)}`,
                      );
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black shadow-xs transition flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <VsIcon name="print" className="text-sm" />
                  <span>In hóa đơn phòng này</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setPreviewFolioId(null)}
                className="px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-bold hover:opacity-90 transition cursor-pointer"
              >
                Đóng chi tiết
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
