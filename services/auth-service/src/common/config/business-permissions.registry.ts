export type BusinessPermissionKey =
  | "platform.users.view"
  | "platform.users.manage"
  | "platform.roles.view"
  | "platform.roles.manage"
  | "platform.permissions.manage"
  | "platform.hotels.view"
  | "platform.hotels.manage"
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
  | "hotel.billing.view"
  | "hotel.billing.manage"
  | "hotel.services.view"
  | "hotel.services.manage"
  | "guest.experience.use"
  | "system.health.view";

export type BusinessPermissionDefinition = {
  key: BusinessPermissionKey;
  moduleKey: string;
};

export const BUSINESS_PERMISSIONS: readonly BusinessPermissionDefinition[] = [
  {
    key: "platform.users.view",
    moduleKey: "platform-users",
  },
  {
    key: "platform.users.manage",
    moduleKey: "platform-users",
  },
  {
    key: "platform.roles.view",
    moduleKey: "platform-roles",
  },
  {
    key: "platform.roles.manage",
    moduleKey: "platform-roles",
  },
  {
    key: "platform.permissions.manage",
    moduleKey: "platform-permissions",
  },
  {
    key: "platform.hotels.view",
    moduleKey: "platform-hotels",
  },
  {
    key: "platform.hotels.manage",
    moduleKey: "platform-hotels",
  },
  {
    key: "hotel.dashboard.view",
    moduleKey: "hotel-dashboard",
  },
  {
    key: "hotel.rooms.view",
    moduleKey: "hotel-rooms",
  },
  {
    key: "hotel.rooms.manage",
    moduleKey: "hotel-rooms",
  },
  {
    key: "hotel.rooms.qr.manage",
    moduleKey: "hotel-room-qr",
  },
  {
    key: "hotel.stays.view",
    moduleKey: "hotel-stays",
  },
  {
    key: "hotel.stays.manage",
    moduleKey: "hotel-stays",
  },
  {
    key: "hotel.reservations.view",
    moduleKey: "hotel-reservations",
  },
  {
    key: "hotel.reservations.manage",
    moduleKey: "hotel-reservations",
  },
  {
    key: "hotel.staff.view",
    moduleKey: "hotel-staff",
  },
  {
    key: "hotel.staff.manage",
    moduleKey: "hotel-staff",
  },
  {
    key: "hotel.requests.view",
    moduleKey: "hotel-requests",
  },
  {
    key: "hotel.requests.manage",
    moduleKey: "hotel-requests",
  },
  {
    key: "hotel.billing.view",
    moduleKey: "hotel-billing",
  },
  {
    key: "hotel.billing.manage",
    moduleKey: "hotel-billing",
  },
  {
    key: "hotel.services.view",
    moduleKey: "hotel-services",
  },
  {
    key: "hotel.services.manage",
    moduleKey: "hotel-services",
  },
  {
    key: "guest.experience.use",
    moduleKey: "guest-experience",
  },
  {
    key: "system.health.view",
    moduleKey: "system-health",
  },
];

const BUSINESS_PERMISSION_KEYS = new Set(BUSINESS_PERMISSIONS.map((permission) => permission.key));

export function isBusinessPermissionKey(value: string): value is BusinessPermissionKey {
  return BUSINESS_PERMISSION_KEYS.has(value as BusinessPermissionKey);
}
