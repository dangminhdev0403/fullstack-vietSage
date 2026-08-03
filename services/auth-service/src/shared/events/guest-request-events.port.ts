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
  eventId: string;
  messageId: string;
  hotelId: string;
  stayId: string;
  threadId: string;
  thread: unknown;
  message: unknown;
}

export interface ConversationClosedEventInput {
  eventId?: string;
  hotelId: string;
  stayId: string;
  roomId?: string;
  threadId?: string;
}

export interface StayOverdueCheckoutEventInput {
  eventId?: string;
  hotelId: string;
  stayId: string;
  roomId: string;
  roomNumber: string;
  guestDisplayName: string;
  plannedCheckOutAt: Date;
  overdueHours: number;
}

export interface GuestRequestEventPublisher {
  publishGuestRequestCreated(input: GuestRequestCreatedEventInput): void;
  publishGuestRequestUpdated(input: GuestRequestUpdatedEventInput): void;
  publishGuestMessageCreated(input: GuestMessageCreatedEventInput): void;
  publishConversationClosed(input: ConversationClosedEventInput): void;
  publishStayOverdueCheckout?(input: StayOverdueCheckoutEventInput): void;
}

export const GUEST_REQUEST_EVENT_PUBLISHER = Symbol("GUEST_REQUEST_EVENT_PUBLISHER");

export const NOOP_GUEST_REQUEST_EVENT_PUBLISHER: GuestRequestEventPublisher = {
  publishGuestRequestCreated: () => undefined,
  publishGuestRequestUpdated: () => undefined,
  publishGuestMessageCreated: () => undefined,
  publishConversationClosed: () => undefined,
  publishStayOverdueCheckout: () => undefined,
};

