import { randomUUID } from "node:crypto";
import type { Server } from "socket.io";

const OWNER_ROOM_PREFIX = "owner:hotel:";
const GUEST_SESSION_ROOM_PREFIX = "guest-session:";
const GUEST_STAY_ROOM_PREFIX = "guest-stay:";

const SERVICE_TENANT_ROOM_PREFIX = "service-tenant:";

export type ExternalServiceOrderPayload = {
  eventId?: string;
  orderId: string;
  orderNumber: string;
  hotelId: string;
  stayId: string;
  roomId?: string | null;
  roomNumber?: string | null;
  guestDisplayName?: string | null;
  serviceTenantId: string;
  serviceTenantName?: string | null;
  serviceId: string;
  serviceName: string;
  status: string;
  hotelStatus?: string | null;
  voucherNumber?: string | null;
  quantity: number;
  unitPrice: number | string;
  pricingUnit?: string | null;
  totalAmount: number | string;
  currency: string;
  guestNote?: string | null;
  serviceMode: string;
  createdAt: string;
  updatedAt?: string;
  version?: number;
};

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
  }) {
    this.serverRef?.to(this.ownerHotelRoom(input.hotelId)).emit("guest_request.updated", {
      request: input.ownerRequest,
    });
    if (input.sessionId && input.guestRequest !== undefined) {
      this.serverRef?.to(this.guestSessionRoom(input.sessionId)).emit("guest_request.updated", {
        request: input.guestRequest,
      });
    }
  }

  static emitGuestMessageCreated(input: {
    eventId: string;
    messageId: string;
    hotelId: string;
    stayId: string;
    threadId: string;
    thread: unknown;
    message: unknown;
  }) {
    const payload = {
      eventId: input.eventId,
      messageId: input.messageId,
      hotelId: input.hotelId,
      stayId: input.stayId,
      threadId: input.threadId,
      thread: input.thread,
      message: input.message,
    };
    this.serverRef?.to(this.ownerHotelRoom(input.hotelId)).emit("guest_message.created", payload);
    this.serverRef?.to(this.guestStayRoom(input.stayId)).emit("guest_message.created", payload);
  }

  static emitConversationClosed(input: {
    eventId?: string;
    hotelId: string;
    stayId: string;
    roomId?: string;
    threadId?: string;
  }) {
    const payload = {
      eventId: input.eventId ?? randomUUID(),
      hotelId: input.hotelId,
      stayId: input.stayId,
      roomId: input.roomId,
      threadId: input.threadId,
    };
    this.serverRef?.to(this.ownerHotelRoom(input.hotelId)).emit("conversation.closed", payload);
    this.serverRef?.to(this.guestStayRoom(input.stayId)).emit("conversation.closed", payload);
  }

  static emitStayOverdueCheckout(input: {
    eventId?: string;
    hotelId: string;
    stayId: string;
    roomId: string;
    roomNumber: string;
    guestDisplayName: string;
    plannedCheckOutAt: Date;
    overdueHours: number;
  }) {
    const payload = {
      eventId: input.eventId ?? randomUUID(),
      hotelId: input.hotelId,
      stayId: input.stayId,
      roomId: input.roomId,
      roomNumber: input.roomNumber,
      guestDisplayName: input.guestDisplayName,
      plannedCheckOutAt: input.plannedCheckOutAt.toISOString(),
      overdueHours: input.overdueHours,
    };
    this.serverRef?.to(this.ownerHotelRoom(input.hotelId)).emit("stay.overdue_checkout", payload);
  }

  static emitExternalServiceOrderCreated(
    input: ExternalServiceOrderPayload & { sessionId?: string | null },
  ) {
    const eventId = input.eventId ?? randomUUID();
    const payload = { ...input, eventId };

    this.serverRef?.to(this.ownerHotelRoom(input.hotelId)).emit("external_service_order.created", payload);
    this.serverRef?.to(this.serviceTenantRoom(input.serviceTenantId)).emit("external_service_order.created", payload);
    if (input.sessionId) {
      this.serverRef?.to(this.guestSessionRoom(input.sessionId)).emit("external_service_order.created", payload);
    }
    if (input.stayId) {
      this.serverRef?.to(this.guestStayRoom(input.stayId)).emit("external_service_order.created", payload);
    }
  }

  static emitExternalServiceOrderStatusChanged(
    input: ExternalServiceOrderPayload & { sessionId?: string | null },
  ) {
    const eventId = input.eventId ?? randomUUID();
    const payload = { ...input, eventId };

    this.serverRef?.to(this.ownerHotelRoom(input.hotelId)).emit("external_service_order.status_changed", payload);
    this.serverRef?.to(this.serviceTenantRoom(input.serviceTenantId)).emit("external_service_order.status_changed", payload);
    if (input.sessionId) {
      this.serverRef?.to(this.guestSessionRoom(input.sessionId)).emit("external_service_order.status_changed", payload);
    }
    if (input.stayId) {
      this.serverRef?.to(this.guestStayRoom(input.stayId)).emit("external_service_order.status_changed", payload);
    }
  }

  static emitExternalServiceOrderHotelAcknowledged(
    input: ExternalServiceOrderPayload & { sessionId?: string | null },
  ) {
    const eventId = input.eventId ?? randomUUID();
    const payload = { ...input, eventId };

    this.serverRef?.to(this.ownerHotelRoom(input.hotelId)).emit("external_service_order.hotel_acknowledged", payload);
    this.serverRef?.to(this.serviceTenantRoom(input.serviceTenantId)).emit("external_service_order.hotel_acknowledged", payload);
    if (input.sessionId) {
      this.serverRef?.to(this.guestSessionRoom(input.sessionId)).emit("external_service_order.hotel_acknowledged", payload);
    }
    if (input.stayId) {
      this.serverRef?.to(this.guestStayRoom(input.stayId)).emit("external_service_order.hotel_acknowledged", payload);
    }
  }

  static emitExternalServiceOrderVoucherIssued(
    input: ExternalServiceOrderPayload & { sessionId?: string | null },
  ) {
    const eventId = input.eventId ?? randomUUID();
    const payload = { ...input, eventId };

    this.serverRef?.to(this.ownerHotelRoom(input.hotelId)).emit("external_service_order.voucher_issued", payload);
    this.serverRef?.to(this.serviceTenantRoom(input.serviceTenantId)).emit("external_service_order.voucher_issued", payload);
    if (input.sessionId) {
      this.serverRef?.to(this.guestSessionRoom(input.sessionId)).emit("external_service_order.voucher_issued", payload);
    }
    if (input.stayId) {
      this.serverRef?.to(this.guestStayRoom(input.stayId)).emit("external_service_order.voucher_issued", payload);
    }
  }

  static ownerHotelRoom(hotelId: string): string {
    return `${OWNER_ROOM_PREFIX}${hotelId}:requests`;
  }

  static serviceTenantRoom(tenantId: string): string {
    return `${SERVICE_TENANT_ROOM_PREFIX}${tenantId}`;
  }

  static guestSessionRoom(sessionId: string): string {
    return `${GUEST_SESSION_ROOM_PREFIX}${sessionId}`;
  }

  static guestStayRoom(stayId: string): string {
    return `${GUEST_STAY_ROOM_PREFIX}${stayId}`;
  }
}
