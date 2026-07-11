export interface GuestRequestCreatedEventInput {
  hotelId: string;
  sessionId: string;
  requestId: string;
  ownerRequest: unknown;
  guestRequest: unknown;
}

export interface GuestRequestUpdatedEventInput {
  hotelId: string;
  sessionId?: string | null;
  requestId?: string;
  ownerRequest: unknown;
  guestRequest?: unknown;
  answered?: boolean;
}

export interface GuestRequestEventPublisher {
  publishGuestRequestCreated(input: GuestRequestCreatedEventInput): void;
  publishGuestRequestUpdated(input: GuestRequestUpdatedEventInput): void;
}

export const GUEST_REQUEST_EVENT_PUBLISHER = Symbol("GUEST_REQUEST_EVENT_PUBLISHER");

export const NOOP_GUEST_REQUEST_EVENT_PUBLISHER: GuestRequestEventPublisher = {
  publishGuestRequestCreated: () => undefined,
  publishGuestRequestUpdated: () => undefined,
};
