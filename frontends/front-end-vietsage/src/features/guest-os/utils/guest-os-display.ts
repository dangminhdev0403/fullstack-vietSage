import type {
  GuestPortalRequestPriority,
  GuestPortalRequestStatus,
  GuestRequestType,
  GuestServiceItem,
} from "@/features/guest-os/types/guest-os-contract";

export const requestStatusLabelKeyMap: Record<GuestPortalRequestStatus, string> = {
  CREATED: "requests.sent",
  ACKNOWLEDGED: "requests.acknowledged",
  IN_PROGRESS: "requests.inProgress",
  COMPLETED: "requests.done",
  FAILED: "requests.failed",
  CANCELLED: "requests.cancelled",
};

export const requestPriorityLabelKeyMap: Record<GuestPortalRequestPriority, string> = {
  NORMAL: "requests.normal",
  URGENT: "requests.urgent",
};

export const requestTypeLabelKeyMap: Record<GuestRequestType, string> = {
  HOUSEKEEPING: "services.housekeeping",
  EXTRA_TOWELS: "services.extraTowels",
  LAUNDRY: "services.laundry",
  MAINTENANCE: "services.maintenance",
  FOOD_ORDERING: "services.foodOrdering",
  AIRPORT_TRANSFER: "services.airportTransfer",
  TOUR_BOOKING: "services.tourBooking",
  ESIM_PURCHASE: "services.esimPurchase",
  AI_CONCIERGE: "services.aiConcierge",
};

export const requestStatusLabelMap = requestStatusLabelKeyMap;
export const requestPriorityLabelMap = requestPriorityLabelKeyMap;
export const requestTypeLabelMap = requestTypeLabelKeyMap;

export function getRequestTypeIcon(type: GuestRequestType): string {
  switch (type) {
    case "HOUSEKEEPING": return "cleaning_services";
    case "EXTRA_TOWELS": return "dry_cleaning";
    case "LAUNDRY": return "local_laundry_service";
    case "MAINTENANCE": return "build";
    case "FOOD_ORDERING": return "restaurant";
    case "AIRPORT_TRANSFER": return "local_taxi";
    case "TOUR_BOOKING": return "map";
    case "ESIM_PURCHASE": return "sim_card";
    case "AI_CONCIERGE": return "support_agent";
  }
}

export function getStatusTone(status: GuestPortalRequestStatus): string {
  switch (status) {
    case "CREATED": return "bg-blue-100 text-blue-800 ring-1 ring-blue-200";
    case "ACKNOWLEDGED":
    case "IN_PROGRESS": return "bg-amber-100 text-amber-800 ring-1 ring-amber-200";
    case "COMPLETED": return "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200";
    case "FAILED": return "bg-red-100 text-red-800 ring-1 ring-red-200";
    case "CANCELLED": return "bg-pink-100 text-pink-800 ring-1 ring-pink-200";
  }
}

export function formatGuestDateTime(value: string | null | undefined, locale = "vi-VN", emptyLabel = "--"): string {
  if (!value) return emptyLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return emptyLabel;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function formatGuestCurrency(item: GuestServiceItem, locale = "vi-VN"): string | null {
  if (item.price === null || item.price === undefined) return null;
  const amount = typeof item.price === "number" ? item.price : Number(item.price);
  if (Number.isNaN(amount)) return null;
  return new Intl.NumberFormat(locale, { style: "currency", currency: item.currency || "VND", maximumFractionDigits: 0 }).format(amount);
}

export function buildServiceTitle(item: GuestServiceItem | null | undefined, t: (key: string) => string): string {
  if (!item) return t("requests.serviceRequest");
  return item.name || (item.requestType ? t(requestTypeLabelKeyMap[item.requestType]) : t("requests.serviceRequest"));
}
