import type { GuestPortalRequestStatus, GuestRequest } from "../../types/guest-os-contract";
import { requestStatusLabelMap } from "../../utils/guest-os-display";

export type GuestRequestTranslator = (
  key: string,
  replacements?: Record<string, string | number | null | undefined>,
) => string;

export type GuestRequestTabStatus = GuestPortalRequestStatus | "ENDED" | undefined;

export const guestRequestTabs: Array<{ value: GuestRequestTabStatus; labelKey: string }> = [
  { value: undefined, labelKey: "requests.all" },
  { value: "CREATED", labelKey: "requests.sent" },
  { value: "ACKNOWLEDGED", labelKey: "requests.acknowledged" },
  { value: "IN_PROGRESS", labelKey: "requests.inProgress" },
  { value: "COMPLETED", labelKey: "requests.done" },
  { value: "ENDED", labelKey: "requests.ended" },
];

export function getRequestTitle(request: GuestRequest, t: GuestRequestTranslator): string {
  return request.displayName?.trim() || t("requests.serviceRequest");
}

export function getRequestSummary(request: GuestRequest, t: GuestRequestTranslator): string {
  return request.answer?.trim() || request.description?.trim() || t("requests.quantity", { quantity: request.quantity });
}

export function getRequestPriorityLabel(request: GuestRequest, t: GuestRequestTranslator): string {
  return request.priority === "URGENT" ? t("requests.urgent") : t("requests.normal");
}

export function getRequestPriorityTone(request: GuestRequest): string {
  return request.priority === "URGENT"
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export function getRequestStatusLabel(status: GuestPortalRequestStatus, t: GuestRequestTranslator): string {
  if (status === "CREATED") return t("requests.sent");
  if (status === "ACKNOWLEDGED") return t("requests.acknowledged");
  if (status === "IN_PROGRESS") return t("requests.inProgress");
  if (status === "COMPLETED") return t("requests.completed");
  if (status === "CANCELLED") return t("requests.cancelled");
  if (status === "FAILED") return t("requests.failed");
  return requestStatusLabelMap[status];
}

export function getRequestCurrency(request: GuestRequest): string {
  return request.currency || "VND";
}

function readMoneyValue(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount : null;
}

export function getRequestUnitPrice(request: GuestRequest): number | null {
  return readMoneyValue(request.unitPrice ?? request.price);
}

export function getRequestTotalPrice(request: GuestRequest): number | null {
  const explicitTotal = readMoneyValue(
    request.estimatedTotalAmount ?? request.estimatedTotalPrice ?? request.totalAmount ?? request.totalPrice,
  );
  if (explicitTotal !== null) return explicitTotal;
  const unitPrice = getRequestUnitPrice(request);
  return unitPrice === null ? null : unitPrice * Math.max(request.quantity || 1, 1);
}

export function getEstimatedTotal(requests: GuestRequest[]): number | null {
  const totals = requests.map(getRequestTotalPrice).filter((value): value is number => value !== null);
  return totals.length ? totals.reduce((sum, value) => sum + value, 0) : null;
}

export function formatGuestMoney(
  value: number | null,
  currency: string,
  intlLocale: string,
  t: GuestRequestTranslator,
): string {
  if (value === null) return t("requests.noPrice");
  return new Intl.NumberFormat(intlLocale, { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export function matchesRequestSearch(request: GuestRequest, query: string, t: GuestRequestTranslator): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return [
    getRequestTitle(request, t),
    getRequestSummary(request, t),
    request.id,
    getRequestStatusLabel(request.status, t),
    getRequestPriorityLabel(request, t),
  ].join(" ").toLowerCase().includes(normalizedQuery);
}

export function getProgressStep(status: GuestPortalRequestStatus): 1 | 2 | 3 {
  if (status === "COMPLETED") return 3;
  if (status === "FAILED" || status === "CANCELLED") return 2;
  if (status === "ACKNOWLEDGED" || status === "IN_PROGRESS") return 2;
  return 1;
}

export function getMiddleProgressLabel(status: GuestPortalRequestStatus, t: GuestRequestTranslator): string {
  if (status === "COMPLETED") return t("requests.processed");
  if (status === "ACKNOWLEDGED") return t("requests.acknowledged");
  if (status === "IN_PROGRESS") return t("requests.inProgress");
  if (status === "FAILED") return t("requests.failed");
  if (status === "CANCELLED") return t("requests.cancelled");
  return t("requests.inProgress");
}

export function getMiddleProgressIcon(status: GuestPortalRequestStatus): string {
  if (status === "COMPLETED") return "check";
  if (status === "FAILED") return "error";
  if (status === "CANCELLED") return "close";
  if (status === "ACKNOWLEDGED") return "task_alt";
  return "room_service";
}
