export type GuestMessageRealtimeEvent = {
  eventId: string;
  messageId: string;
  hotelId: string;
  stayId: string;
  threadId: string;
  message: { id: string; senderType: "GUEST" | "STAFF" | "SYSTEM" };
  thread?: unknown;
};

export function badgeText(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}

export function createEventDeduper(maxSize = 200) {
  const ids = new Set<string>();
  return {
    accept(eventId: string) {
      if (!eventId || ids.has(eventId)) return false;
      ids.add(eventId);
      if (ids.size > maxSize) {
        const oldest = ids.values().next().value;
        if (oldest) ids.delete(oldest);
      }
      return true;
    },
  };
}

function isEvent(value: unknown): value is GuestMessageRealtimeEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<GuestMessageRealtimeEvent>;
  return Boolean(
    event.eventId &&
      event.messageId &&
      event.hotelId &&
      event.stayId &&
      event.threadId &&
      event.message?.id === event.messageId,
  );
}

export function isGuestMessageEventForHotel(
  value: unknown,
  hotelId: string,
): value is GuestMessageRealtimeEvent {
  return isEvent(value) && value.hotelId === hotelId;
}

export function isGuestMessageEventForStay(
  value: unknown,
  stayId: string,
): value is GuestMessageRealtimeEvent {
  return isEvent(value) && value.stayId === stayId;
}

export function isGuestMessageEventForScope(
  value: unknown,
  hotelId: string,
  stayId: string,
): value is GuestMessageRealtimeEvent {
  return isEvent(value) && value.hotelId === hotelId && value.stayId === stayId;
}

export type ConversationClosedRealtimeEvent = {
  eventId?: string;
  hotelId: string;
  stayId: string;
  threadId?: string;
  roomId?: string;
};

export function isConversationClosedEvent(
  value: unknown,
): value is ConversationClosedRealtimeEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<ConversationClosedRealtimeEvent>;
  return Boolean(typeof event.hotelId === "string" && typeof event.stayId === "string");
}

export function isConversationClosedEventForHotel(
  value: unknown,
  hotelId: string,
): value is ConversationClosedRealtimeEvent {
  return isConversationClosedEvent(value) && value.hotelId === hotelId;
}

export function isConversationClosedEventForStay(
  value: unknown,
  stayId: string,
): value is ConversationClosedRealtimeEvent {
  return isConversationClosedEvent(value) && value.stayId === stayId;
}

export function isConversationClosedEventForScope(
  value: unknown,
  hotelId: string,
  stayId: string,
): value is ConversationClosedRealtimeEvent {
  return isConversationClosedEvent(value) && value.hotelId === hotelId && value.stayId === stayId;
}
