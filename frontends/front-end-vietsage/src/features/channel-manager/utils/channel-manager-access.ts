export type ChannelManagerTabId = "BOOKINGS" | "ARI" | "CHANNELS";

export interface ChannelManagerAccess {
  readonly canViewBookings: boolean;
  readonly canViewInventory: boolean;
  readonly canManageInventory: boolean;
  readonly canViewChannels: boolean;
  readonly canManageChannels: boolean;
  readonly visibleTabs: readonly ChannelManagerTabId[];
}

export interface ChannelManagerAccessOptions {
  readonly allowPlatformAdmin?: boolean;
}

export const BOOKING_READ_CAPABILITIES = [
  "hotel.reservations.view",
  "hotel.reservations.manage",
  "hotel.stays.view",
  "hotel.stays.manage",
  "hotel.stays.check-in",
  "hotel.stays.check-out",
] as const;

export const INVENTORY_READ_CAPABILITIES = [
  "hotel.rooms.view",
  "hotel.rooms.manage",
] as const;

export const INVENTORY_MANAGE_CAPABILITIES = [
  "hotel.rooms.manage",
] as const;

export const CHANNEL_READ_CAPABILITIES = [
  "hotel.channels.view",
  "hotel.channels.manage",
] as const;

export const CHANNEL_MANAGE_CAPABILITIES = [
  "hotel.channels.manage",
] as const;

export const PLATFORM_READ_CAPABILITIES = [
  "platform.hotels.view",
  "platform.hotels.manage",
] as const;

export const PLATFORM_MANAGE_CAPABILITIES = [
  "platform.hotels.manage",
] as const;

function hasAnyCapability(
  permissions: readonly string[],
  required: readonly string[],
): boolean {
  return required.some((perm) => permissions.includes(perm));
}

export function resolveChannelManagerAccess(
  permissions: readonly string[] = [],
  options: ChannelManagerAccessOptions = {},
): ChannelManagerAccess {
  const { allowPlatformAdmin = false } = options;

  const hasBookingHotelCap = hasAnyCapability(permissions, BOOKING_READ_CAPABILITIES);
  const hasInventoryReadHotelCap = hasAnyCapability(permissions, INVENTORY_READ_CAPABILITIES);
  const hasInventoryManageHotelCap = hasAnyCapability(permissions, INVENTORY_MANAGE_CAPABILITIES);
  const hasChannelReadHotelCap = hasAnyCapability(permissions, CHANNEL_READ_CAPABILITIES);
  const hasChannelManageHotelCap = hasAnyCapability(permissions, CHANNEL_MANAGE_CAPABILITIES);

  const hasPlatformRead = allowPlatformAdmin && hasAnyCapability(permissions, PLATFORM_READ_CAPABILITIES);
  const hasPlatformManage = allowPlatformAdmin && hasAnyCapability(permissions, PLATFORM_MANAGE_CAPABILITIES);

  const canViewBookings = hasBookingHotelCap || hasPlatformRead;
  const canViewInventory = hasInventoryReadHotelCap || hasPlatformRead;
  const canManageInventory = hasInventoryManageHotelCap || hasPlatformManage;
  const canViewChannels = hasChannelReadHotelCap || hasPlatformRead;
  const canManageChannels = hasChannelManageHotelCap || hasPlatformManage;

  const visibleTabs: ChannelManagerTabId[] = [];
  if (canViewBookings) {
    visibleTabs.push("BOOKINGS");
  }
  if (canViewInventory && (canViewChannels || canManageChannels)) {
    visibleTabs.push("ARI");
  }
  if (canViewChannels) {
    visibleTabs.push("CHANNELS");
  }

  return Object.freeze({
    canViewBookings,
    canViewInventory,
    canManageInventory,
    canViewChannels,
    canManageChannels,
    visibleTabs: Object.freeze(visibleTabs),
  });
}
