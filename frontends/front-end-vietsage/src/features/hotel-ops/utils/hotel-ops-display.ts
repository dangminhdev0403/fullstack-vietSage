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
      return "inline-flex items-center justify-center whitespace-nowrap bg-slate-100 text-slate-700 border border-slate-200/80 shadow-2xs";
    case "ACKNOWLEDGED":
      return "inline-flex items-center justify-center whitespace-nowrap bg-indigo-50 text-indigo-700 border border-indigo-200/80 shadow-2xs";
    case "IN_PROGRESS":
      return "inline-flex items-center justify-center whitespace-nowrap bg-amber-50 text-amber-800 border border-amber-200/80 shadow-2xs";
    case "COMPLETED":
      return "inline-flex items-center justify-center whitespace-nowrap bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs";
    case "CANCELLED":
      return "inline-flex items-center justify-center whitespace-nowrap bg-zinc-100 text-zinc-600 border border-zinc-200 shadow-2xs";
    case "FAILED":
      return "inline-flex items-center justify-center whitespace-nowrap bg-rose-50 text-rose-700 border border-rose-200/80 shadow-2xs";
  }
}

export function priorityTone(priority: StaffRequestPriority): string {
  switch (priority) {
    case "URGENT":
      return "inline-flex items-center justify-center whitespace-nowrap bg-rose-100 text-rose-800 border border-rose-300 font-bold shadow-2xs animate-pulse";
    case "NORMAL":
      return "inline-flex items-center justify-center whitespace-nowrap bg-sky-50 text-sky-700 border border-sky-200/80 shadow-2xs";
  }
}

export function serviceStatusTone(status: HotelServiceStatus): string {
  return status === "ACTIVE"
    ? "inline-flex items-center justify-center whitespace-nowrap bg-emerald-50 text-emerald-700 border border-emerald-200/80"
    : "inline-flex items-center justify-center whitespace-nowrap bg-zinc-100 text-zinc-600 border border-zinc-200";
}

export function filterExtraOccupants<
  T extends {
    fullName?: string | null;
    identityNumber?: string | null;
    phone?: string | null;
    isPrimary?: boolean | null;
    isLeader?: boolean | null;
  },
>(
  occupants: T[] | undefined | null,
  leader:
    | {
        guestDisplayName?: string | null;
        guestIdentityNumber?: string | null;
        guestPhone?: string | null;
      }
    | undefined
    | null,
): T[] {
  if (!occupants || occupants.length === 0) return [];
  const leaderName = (leader?.guestDisplayName || "").trim().toLowerCase();
  const leaderCccd = (leader?.guestIdentityNumber || "").trim().toLowerCase();

  return occupants.filter((occ) => {
    if (occ.isPrimary || occ.isLeader) return false;
    const occName = (occ.fullName || "").trim().toLowerCase();
    if (!occName) return false;

    const occCccd = (occ.identityNumber || "").trim().toLowerCase();
    const isSameCccd = Boolean(leaderCccd && occCccd && occCccd === leaderCccd);
    if (isSameCccd) return false;

    const isSameName = Boolean(leaderName && occName === leaderName);
    if (isSameName && (!leaderCccd || !occCccd || isSameCccd)) return false;

    return true;
  });
}
