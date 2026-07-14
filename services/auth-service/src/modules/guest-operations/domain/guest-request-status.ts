import { GuestRequestStatus } from "@prisma/client";

export const canonicalGuestRequestStatuses = [
  GuestRequestStatus.CREATED,
  GuestRequestStatus.ACKNOWLEDGED,
  GuestRequestStatus.IN_PROGRESS,
  GuestRequestStatus.COMPLETED,
  GuestRequestStatus.CANCELLED,
  GuestRequestStatus.FAILED,
] as const;

export type CanonicalGuestRequestStatus = (typeof canonicalGuestRequestStatuses)[number];

export const activeGuestRequestStatuses = [
  GuestRequestStatus.CREATED,
  GuestRequestStatus.NEW,
  GuestRequestStatus.ACKNOWLEDGED,
  GuestRequestStatus.CONFIRMED,
  GuestRequestStatus.ACCEPTED,
  GuestRequestStatus.IN_PROGRESS,
  GuestRequestStatus.PENDING,
  GuestRequestStatus.ON_THE_WAY,
] as const;

export function normalizeGuestRequestStatus(
  status: GuestRequestStatus,
): CanonicalGuestRequestStatus {
  switch (status) {
    case GuestRequestStatus.NEW:
    case GuestRequestStatus.CREATED:
      return GuestRequestStatus.CREATED;
    case GuestRequestStatus.CONFIRMED:
    case GuestRequestStatus.ACCEPTED:
    case GuestRequestStatus.ACKNOWLEDGED:
      return GuestRequestStatus.ACKNOWLEDGED;
    case GuestRequestStatus.PENDING:
    case GuestRequestStatus.ON_THE_WAY:
    case GuestRequestStatus.IN_PROGRESS:
      return GuestRequestStatus.IN_PROGRESS;
    case GuestRequestStatus.REJECTED:
    case GuestRequestStatus.FAILED:
      return GuestRequestStatus.FAILED;
    case GuestRequestStatus.COMPLETED:
      return GuestRequestStatus.COMPLETED;
    case GuestRequestStatus.CANCELLED:
      return GuestRequestStatus.CANCELLED;
  }
}

export function compatibleGuestRequestStatuses(
  status: CanonicalGuestRequestStatus,
): GuestRequestStatus[] {
  switch (status) {
    case GuestRequestStatus.CREATED:
      return [GuestRequestStatus.CREATED, GuestRequestStatus.NEW];
    case GuestRequestStatus.ACKNOWLEDGED:
      return [
        GuestRequestStatus.ACKNOWLEDGED,
        GuestRequestStatus.CONFIRMED,
        GuestRequestStatus.ACCEPTED,
      ];
    case GuestRequestStatus.IN_PROGRESS:
      return [
        GuestRequestStatus.IN_PROGRESS,
        GuestRequestStatus.PENDING,
        GuestRequestStatus.ON_THE_WAY,
      ];
    case GuestRequestStatus.FAILED:
      return [GuestRequestStatus.FAILED, GuestRequestStatus.REJECTED];
    case GuestRequestStatus.COMPLETED:
      return [GuestRequestStatus.COMPLETED];
    case GuestRequestStatus.CANCELLED:
      return [GuestRequestStatus.CANCELLED];
  }
}
