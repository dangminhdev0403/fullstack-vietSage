import type { GuestRequestStatus, GuestRequestType } from "@/features/guest-os/types/guest-os-contract";
import type { HotelGuestRequest, HotelServiceItem, HotelServiceStatus, StaffRequestPriority } from "@/features/hotel-ops/types/hotel-ops-contract";

export const requestTypeLabelMap: Record<GuestRequestType, string> = {
  HOUSEKEEPING: "Dọn phòng",
  EXTRA_TOWELS: "Thêm khăn",
  LAUNDRY: "Giặt ủi",
  MAINTENANCE: "Bảo trì",
  FOOD_ORDERING: "Đặt món ăn",
  AIRPORT_TRANSFER: "Đưa đón sân bay",
  TOUR_BOOKING: "Đặt tour",
  ESIM_PURCHASE: "Mua eSIM",
  AI_CONCIERGE: "Trợ lý AI",
};

export const requestStatusLabelMap: Record<GuestRequestStatus, string> = {
  CREATED: "Mới tạo",
  ACKNOWLEDGED: "Đã tiếp nhận",
  IN_PROGRESS: "Đang xử lý",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
  FAILED: "Thất bại",
};

export const requestPriorityLabelMap: Record<StaffRequestPriority, string> = {
  NORMAL: "Bình thường",
  URGENT: "Khẩn cấp",
};

export const serviceStatusLabelMap: Record<HotelServiceStatus, string> = {
  ACTIVE: "Hoạt động",
  DISABLED: "Vô hiệu hóa",
};

export function formatOpsDateTime(value?: string | null): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("vi-VN", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatMoney(item: Pick<HotelServiceItem, "price" | "currency">): string {
  if (item.price === null || item.price === undefined || item.price === "") {
    return "Liên hệ";
  }

  const amount = typeof item.price === "number" ? item.price : Number(item.price);
  if (!Number.isFinite(amount)) {
    return `${item.price} ${item.currency}`;
  }

  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: item.currency || "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function getRequestTitle(request: HotelGuestRequest): string {
  return request.title ?? request.serviceItem?.name ?? requestTypeLabelMap[request.type];
}

export function getRoomLabel(request: HotelGuestRequest): string {
  return request.room?.roomNumber ? `Phòng ${request.room.roomNumber}` : request.roomId;
}

export function getGuestLabel(request: HotelGuestRequest): string {
  return request.stay?.guestDisplayName ?? "Khách";
}

export function statusTone(status: GuestRequestStatus): string {
  switch (status) {
    case "CREATED":
      return "bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]";
    case "ACKNOWLEDGED":
      return "bg-[var(--primary-fixed)] text-[var(--on-primary-fixed-variant)]";
    case "IN_PROGRESS":
      return "bg-[var(--secondary-container)] text-[var(--on-secondary-container)]";
    case "COMPLETED":
      return "bg-emerald-100 text-emerald-800";
    case "CANCELLED":
      return "bg-zinc-200 text-zinc-700";
    case "FAILED":
      return "bg-[var(--error-container)] text-[var(--on-error-container)]";
  }
}

export function priorityTone(priority: StaffRequestPriority): string {
  switch (priority) {
    case "URGENT":
      return "bg-[var(--error-container)] text-[var(--on-error-container)]";
    case "NORMAL":
      return "bg-[var(--primary-fixed)] text-[var(--on-primary-fixed-variant)]";
  }
}

export function serviceStatusTone(status: HotelServiceStatus): string {
  return status === "ACTIVE"
    ? "bg-emerald-100 text-emerald-800"
    : "bg-zinc-200 text-zinc-700";
}
