export type BusinessPermissionKey =
  | "platform.users.view"
  | "platform.users.manage"
  | "platform.roles.view"
  | "platform.roles.manage"
  | "platform.permissions.manage"
  | "platform.hotels.view"
  | "platform.hotels.manage"
  | "platform.billing.view"
  | "platform.billing.manage"
  | "platform.marketplace.view"
  | "platform.marketplace.manage"
  | "service.marketplace.view"
  | "service.marketplace.manage"
  | "hotel.marketplace.view"
  | "hotel.marketplace.revenue.view"
  | "hotel.revenue-protection.view"
  | "hotel.dashboard.view"
  | "hotel.rooms.view"
  | "hotel.rooms.manage"
  | "hotel.rooms.qr.manage"
  | "hotel.stays.view"
  | "hotel.stays.manage"
  | "hotel.reservations.view"
  | "hotel.reservations.manage"
  | "hotel.staff.view"
  | "hotel.staff.manage"
  | "hotel.requests.view"
  | "hotel.requests.manage"
  | "hotel.messages.view"
  | "hotel.messages.manage"
  | "hotel.billing.view"
  | "hotel.billing.manage"
  | "hotel.services.view"
  | "hotel.services.manage"
  | "hotel.local-partners.view"
  | "hotel.local-partners.manage"
  | "hotel.notifications.view"
  | "hotel.notifications.manage"
  | "guest.experience.use"
  | "system.health.view";

export type BusinessPermissionRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type BusinessPermissionDefinition = {
  key: BusinessPermissionKey;
  domain: string;
  moduleKey: string;
  label: string;
  description: string;
  risk: BusinessPermissionRisk;
};

function permission(
  key: BusinessPermissionKey,
  domain: string,
  label: string,
  risk: BusinessPermissionRisk = key.endsWith(".manage") ? "HIGH" : "LOW",
): BusinessPermissionDefinition {
  return { key, domain, moduleKey: domain, label, description: label, risk };
}

export const BUSINESS_PERMISSIONS: readonly BusinessPermissionDefinition[] = [
  permission("platform.users.view", "platform-users", "Xem danh sách người dùng"),
  permission("platform.users.manage", "platform-users", "Quản lý người dùng"),
  permission("platform.roles.view", "platform-roles", "Xem danh sách vai trò"),
  permission("platform.roles.manage", "platform-roles", "Quản lý vai trò"),
  permission(
    "platform.permissions.manage",
    "platform-permissions",
    "Quản lý phân quyền",
    "CRITICAL",
  ),
  permission("platform.hotels.view", "platform-hotels", "Xem danh sách khách sạn"),
  permission("platform.hotels.manage", "platform-hotels", "Quản lý khách sạn"),
  permission("platform.billing.view", "platform-billing", "Xem thanh toán nền tảng"),
  permission(
    "platform.billing.manage",
    "platform-billing",
    "Quản lý thanh toán nền tảng",
    "CRITICAL",
  ),
  permission("platform.marketplace.view", "platform-marketplace", "Xem Marketplace nền tảng"),
  permission("platform.marketplace.manage", "platform-marketplace", "Quản lý Marketplace nền tảng"),
  permission("service.marketplace.view", "service-marketplace", "Xem Marketplace nhà cung cấp"),
  permission(
    "service.marketplace.manage",
    "service-marketplace",
    "Quản lý Marketplace nhà cung cấp",
  ),
  permission("hotel.marketplace.view", "hotel-marketplace", "Xem Marketplace khách sạn"),
  permission("hotel.marketplace.revenue.view", "hotel-marketplace", "Xem doanh thu Marketplace"),
  permission(
    "hotel.revenue-protection.view",
    "hotel-revenue-protection",
    "Xem bảo vệ doanh thu",
    "MEDIUM",
  ),
  permission("hotel.dashboard.view", "hotel-dashboard", "Xem tổng quan khách sạn"),
  permission("hotel.rooms.view", "hotel-rooms", "Xem danh sách phòng"),
  permission("hotel.rooms.manage", "hotel-rooms", "Quản lý phòng"),
  permission("hotel.rooms.qr.manage", "hotel-room-qr", "Quản lý mã QR", "HIGH"),
  permission("hotel.stays.view", "hotel-stays", "Xem danh sách khách lưu trú"),
  permission("hotel.stays.manage", "hotel-stays", "Quản lý khách lưu trú"),
  permission(
    "hotel.reservations.view",
    "hotel-reservations",
    "Xem đặt phòng và danh sách khách đến",
  ),
  permission(
    "hotel.reservations.manage",
    "hotel-reservations",
    "Quản lý đặt phòng, gán phòng và check-in",
  ),
  permission("hotel.staff.view", "hotel-staff", "Xem nhân viên và phân công khách sạn"),
  permission(
    "hotel.staff.manage",
    "hotel-staff",
    "Quản lý nhân viên, vai trò và phân công khách sạn",
  ),
  permission("hotel.requests.view", "hotel-requests", "Xem danh sách yêu cầu khách"),
  permission("hotel.requests.manage", "hotel-requests", "Quản lý yêu cầu khách"),
  permission("hotel.messages.view", "hotel-messages", "Xem tin nhắn phòng"),
  permission("hotel.messages.manage", "hotel-messages", "Quản lý tin nhắn phòng"),
  permission("hotel.billing.view", "hotel-billing", "Xem danh sách thanh toán"),
  permission("hotel.billing.manage", "hotel-billing", "Quản lý thanh toán", "CRITICAL"),
  permission("hotel.services.view", "hotel-services", "Xem danh mục và dịch vụ"),
  permission("hotel.services.manage", "hotel-services", "Quản lý danh mục và dịch vụ"),
  permission("hotel.local-partners.view", "hotel-local-partners", "Xem đối tác địa phương"),
  permission("hotel.local-partners.manage", "hotel-local-partners", "Quản lý đối tác địa phương"),
  permission("hotel.notifications.view", "hotel-notifications", "Xem cấu hình thông báo khách sạn"),
  permission(
    "hotel.notifications.manage",
    "hotel-notifications",
    "Quản lý cấu hình thông báo khách sạn",
  ),
  permission("guest.experience.use", "guest-experience", "Sử dụng GuestOS", "MEDIUM"),
  permission("system.health.view", "system-health", "Xem trạng thái hệ thống"),
];

const BUSINESS_PERMISSION_KEYS = new Set(BUSINESS_PERMISSIONS.map(({ key }) => key));

export function isBusinessPermissionKey(value: string): value is BusinessPermissionKey {
  return BUSINESS_PERMISSION_KEYS.has(value as BusinessPermissionKey);
}
