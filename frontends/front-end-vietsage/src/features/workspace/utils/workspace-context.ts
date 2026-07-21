import type {
  AuthAccessibleHotel,
  AuthActiveRole,
} from "@/features/auth/types/auth-contract";
// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { resolveWorkspacePersona as resolvePersonaFromRegistry } from "../config/workspace-registry.ts";
import type { WorkspacePersona } from "../types/workspace-registry";

export type { WorkspacePersona } from "../types/workspace-registry";

export type WorkspaceContext = {
  activeRole: AuthActiveRole;
  permissions: readonly string[];
  accessibleHotels: readonly AuthAccessibleHotel[];
};

const PLATFORM_HOTEL_CAPABILITIES = new Set([
  "platform.hotels.view",
  "platform.hotels.manage",
]);

export function resolveWorkspacePersona(roleCode: string): WorkspacePersona | null {
  return resolvePersonaFromRegistry(roleCode);
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

export function resolveSingleAssignedHotel(
  context: Pick<WorkspaceContext, "permissions" | "accessibleHotels">,
): AuthAccessibleHotel | null {
  if (!hasAnyHotelCapability(context) || context.accessibleHotels.length !== 1) {
    return null;
  }

  return context.accessibleHotels[0] ?? null;
}
