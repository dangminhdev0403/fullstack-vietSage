import type { Server } from "socket.io";

const OWNER_ROOM_PREFIX = "owner:hotel:";
const GUEST_SESSION_ROOM_PREFIX = "guest-session:";
const GUEST_STAY_ROOM_PREFIX = "guest-stay:";

export class RequestRealtimeEmitter {
  private static serverRef: Server | null = null;

  static bind(server: Server) {
    this.serverRef = server;
  }

  static emitGuestRequestCreated(input: {
    hotelId: string;
    sessionId: string;
    ownerRequest: unknown;
    guestRequest: unknown;
  }) {
    this.serverRef?.to(this.ownerHotelRoom(input.hotelId)).emit("guest_request.created", {
      request: input.ownerRequest,
    });
    this.serverRef?.to(this.guestSessionRoom(input.sessionId)).emit("guest_request.created", {
      request: input.guestRequest,
    });
  }

  static emitGuestRequestUpdated(input: {
    hotelId: string;
    sessionId?: string | null;
    ownerRequest: unknown;
    guestRequest?: unknown;
    answered?: boolean;
  }) {
    const eventName = input.answered ? "guest_request.answered" : "guest_request.updated";
    this.serverRef
      ?.to(this.ownerHotelRoom(input.hotelId))
      .emit(eventName, { request: input.ownerRequest });

    if (input.sessionId && input.guestRequest) {
      this.serverRef?.to(this.guestSessionRoom(input.sessionId)).emit(eventName, {
        request: input.guestRequest,
      });
    }
  }

  static emitGuestMessageCreated(input: {
    hotelId: string;
    stayId: string;
    thread: unknown;
    message: unknown;
  }) {
    const payload = { thread: input.thread, message: input.message };
    this.serverRef?.to(this.ownerHotelRoom(input.hotelId)).emit("guest_message.created", payload);
    this.serverRef?.to(this.guestStayRoom(input.stayId)).emit("guest_message.created", payload);
  }

  static emitConversationClosed(input: { hotelId: string; stayId: string; roomId: string }) {
    const payload = { stayId: input.stayId, roomId: input.roomId };
    this.serverRef?.to(this.ownerHotelRoom(input.hotelId)).emit("conversation.closed", payload);
    this.serverRef?.to(this.guestStayRoom(input.stayId)).emit("conversation.closed", payload);
  }

  static ownerHotelRoom(hotelId: string): string {
    return `${OWNER_ROOM_PREFIX}${hotelId}:requests`;
  }

  static guestSessionRoom(sessionId: string): string {
    return `${GUEST_SESSION_ROOM_PREFIX}${sessionId}`;
  }

  static guestStayRoom(stayId: string): string {
    return `${GUEST_STAY_ROOM_PREFIX}${stayId}`;
  }
}
