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

export interface GuestMessageCreatedEventInput {
  hotelId: string;
  stayId: string;
  thread: unknown;
  message: unknown;
}

export interface ConversationClosedEventInput {
  hotelId: string;
  stayId: string;
  roomId: string;
}

export interface GuestRequestEventPublisher {
  publishGuestRequestCreated(input: GuestRequestCreatedEventInput): void;
  publishGuestRequestUpdated(input: GuestRequestUpdatedEventInput): void;
  publishGuestMessageCreated(input: GuestMessageCreatedEventInput): void;
  publishConversationClosed(input: ConversationClosedEventInput): void;
}

export const GUEST_REQUEST_EVENT_PUBLISHER = Symbol("GUEST_REQUEST_EVENT_PUBLISHER");

export const NOOP_GUEST_REQUEST_EVENT_PUBLISHER: GuestRequestEventPublisher = {
  publishGuestRequestCreated: () => undefined,
  publishGuestRequestUpdated: () => undefined,
  publishGuestMessageCreated: () => undefined,
  publishConversationClosed: () => undefined,
};
