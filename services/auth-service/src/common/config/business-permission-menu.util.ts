import type { BusinessPermissionKey } from "./business-permissions.registry";
import { isBusinessPermissionKey } from "./business-permissions.registry";

const BUSINESS_PERMISSION_MENU_PATHS: Record<BusinessPermissionKey, string | null> = {
  "platform.users.view": "/admin/users",
  "platform.users.manage": "/admin/users",
  "platform.roles.view": "/admin/roles",
  "platform.roles.manage": "/admin/roles",
  "platform.permissions.manage": "/admin/roles",
  "platform.hotels.view": "/admin/hotels",
  "platform.hotels.manage": "/admin/hotels",
  "platform.billing.view": "/admin/billing",
  "platform.billing.manage": "/admin/billing",
  "hotel.revenue-protection.view": "/owner/hotels/[hotelId]/billing",
  "hotel.dashboard.view": "/owner/dashboard",
  "hotel.rooms.view": "/owner/hotels/[hotelId]/rooms",
  "hotel.rooms.manage": "/owner/hotels/[hotelId]/rooms",
  "hotel.rooms.qr.manage": "/owner/hotels/[hotelId]/rooms",
  "hotel.stays.view": "/owner/hotels/[hotelId]/stay",
  "hotel.stays.manage": "/owner/hotels/[hotelId]/stay",
  "hotel.reservations.view": null,
  "hotel.reservations.manage": null,
  "hotel.staff.view": "/owner/staff",
  "hotel.staff.manage": "/owner/staff",
  "hotel.requests.view": "/owner/hotels/[hotelId]/requests",
  "hotel.requests.manage": "/owner/hotels/[hotelId]/requests",
  "hotel.messages.view": "/owner/hotels/[hotelId]/messages",
  "hotel.messages.manage": "/owner/hotels/[hotelId]/messages",
  "hotel.billing.view": "/owner/hotels/[hotelId]/billing",
  "hotel.billing.manage": "/owner/hotels/[hotelId]/billing",
  "hotel.services.view": "/owner/hotels/[hotelId]/services",
  "hotel.services.manage": "/owner/hotels/[hotelId]/services",
  "hotel.local-partners.view": "/hotels/[hotelId]/partners",
  "hotel.local-partners.manage": "/hotels/[hotelId]/partners",
  "guest.experience.use": null,
  "system.health.view": null,
};

export function resolveBusinessPermissionMenuPath(key: string): string | null {
  if (!isBusinessPermissionKey(key)) {
    return null;
  }

  return BUSINESS_PERMISSION_MENU_PATHS[key];
}
