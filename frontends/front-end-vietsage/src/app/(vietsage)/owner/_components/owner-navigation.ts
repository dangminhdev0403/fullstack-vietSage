import type { DashboardNavItem } from "@/lib/frontend-navigation";
import { buildWorkspaceNavigation } from "@/features/workspace/config/workspace-registry";

export function getOwnerBaseNavigation(): DashboardNavItem[] {
  return buildWorkspaceNavigation({ persona: "owner", permissions: [] });
}

export function withOwnerHotelNavigation(items: readonly DashboardNavItem[], hotelId: string): DashboardNavItem[] {
  const additions: DashboardNavItem[] = [
    { key: `/owner/hotels/${hotelId}`, href: `/owner/hotels/${hotelId}`, label: "Thông tin khách sạn", icon: "hotel" },
    { key: `/owner/hotels/${hotelId}/rooms`, href: `/owner/hotels/${hotelId}/rooms`, label: "Phòng & QR", icon: "bed" },
    { key: `/owner/hotels/${hotelId}/requests`, href: `/owner/hotels/${hotelId}/requests`, label: "Xử lí yêu cầu", icon: "assignment" },
    { key: `/owner/hotels/${hotelId}/stay`, href: `/owner/hotels/${hotelId}/stay`, label: "Lưu trú", icon: "hotel" },
    { key: `/owner/hotels/${hotelId}/services`, href: `/owner/hotels/${hotelId}/services`, label: "Dịch vụ", icon: "concierge" },
    { key: `/owner/hotels/${hotelId}/billing`, href: `/owner/hotels/${hotelId}/billing`, label: "Thanh toán", icon: "inventory_2" },
  ];
  const byHref = new Map<string, DashboardNavItem>();

  for (const item of [...items, ...additions]) {
    byHref.set(item.href, item);
  }

  return [...byHref.values()];
}
