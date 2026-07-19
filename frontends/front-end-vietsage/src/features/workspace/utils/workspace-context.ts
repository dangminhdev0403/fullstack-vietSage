import type {
  AuthAccessibleHotel,
  AuthActiveRole,
} from "@/features/auth/types/auth-contract";

export type WorkspacePersona =
  | "platform_admin"
  | "owner"
  | "manager"
  | "front_desk"
  | "housekeeping"
  | "maintenance"
  | "finance";

export type WorkspaceContext = {
  activeRole: AuthActiveRole;
  permissions: readonly string[];
  accessibleHotels: readonly AuthAccessibleHotel[];
};

const PLATFORM_HOTEL_CAPABILITIES = new Set([
  "platform.hotels.view",
  "platform.hotels.manage",
]);

function normalizeRoleCode(roleCode: string): string {
  return roleCode.trim().toUpperCase();
}

export function resolveWorkspacePersona(roleCode: string): WorkspacePersona | null {
  const normalized = normalizeRoleCode(roleCode);

  if (normalized === "SUPER_ADMIN" || normalized === "ADMIN") {
    return "platform_admin";
  }

  if (normalized === "TENANT_OWNER" || normalized === "HOTEL_OWNER") {
    return "owner";
  }

  if (normalized === "HOTEL_MANAGER") {
    return "manager";
  }

  if (normalized === "HOTEL_FRONTDESK" || normalized === "RECEPTIONIST") {
    return "front_desk";
  }

  if (normalized === "HOUSEKEEPING" || normalized === "HOTEL_HOUSEKEEPING") {
    return "housekeeping";
  }

  if (normalized === "MAINTENANCE" || normalized === "HOTEL_MAINTENANCE") {
    return "maintenance";
  }

  if (normalized === "FINANCE" || normalized === "HOTEL_FINANCE") {
    return "finance";
  }

  return null;
}

export function hasWorkspaceCapability(
  context: Pick<WorkspaceContext, "permissions">,
  capability: string,
): boolean {
  return context.permissions.includes(capability);
}

export function hasAnyHotelCapability(
  context: Pick<WorkspaceContext, "permissions">,
): boolean {
  return context.permissions.some(
    (permission) =>
      permission.startsWith("hotel.") || PLATFORM_HOTEL_CAPABILITIES.has(permission),
  );
}

export function canAccessHotelScope(
  context: Pick<WorkspaceContext, "permissions" | "accessibleHotels">,
  hotelId: string,
): boolean {
  const normalizedHotelId = hotelId.trim();
  if (!normalizedHotelId || !hasAnyHotelCapability(context)) {
    return false;
  }

  if (context.permissions.some((permission) => PLATFORM_HOTEL_CAPABILITIES.has(permission))) {
    return true;
  }

  return context.accessibleHotels.some((hotel) => hotel.id === normalizedHotelId);
}

export function resolveExplicitAccessibleHotel(
  context: Pick<WorkspaceContext, "permissions" | "accessibleHotels">,
  requestedHotelId: string | null | undefined,
): AuthAccessibleHotel | null {
  const normalizedHotelId = requestedHotelId?.trim();
  if (!normalizedHotelId || !hasAnyHotelCapability(context)) {
    return null;
  }

  return context.accessibleHotels.find((hotel) => hotel.id === normalizedHotelId) ?? null;
}
