import { GuestRequestStatus } from "@prisma/client";

export const canonicalGuestRequestStatuses = [
  GuestRequestStatus.PENDING,
  GuestRequestStatus.ACKNOWLEDGED,
  GuestRequestStatus.COMPLETED,
  GuestRequestStatus.CANCELLED,
  GuestRequestStatus.REJECTED,
] as const;

export type CanonicalGuestRequestStatus = (typeof canonicalGuestRequestStatuses)[number];

export const activeGuestRequestStatuses = [
  GuestRequestStatus.PENDING,
  GuestRequestStatus.ACKNOWLEDGED,
] as const;

export function normalizeGuestRequestStatus(
  status: GuestRequestStatus,
): CanonicalGuestRequestStatus {
  return status;
}

export function compatibleGuestRequestStatuses(
  status: CanonicalGuestRequestStatus,
): GuestRequestStatus[] {
  return [status];
}
