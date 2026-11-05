import { randomUUID } from "node:crypto";
import type { Server } from "socket.io";

const OWNER_ROOM_PREFIX = "owner:hotel:";
const GUEST_SESSION_ROOM_PREFIX = "guest-session:";
const GUEST_STAY_ROOM_PREFIX = "guest-stay:";

const SERVICE_TENANT_ROOM_PREFIX = "service-tenant:";

export type ExternalServiceOrderItemPayload = {
  serviceId: string;
  serviceName: string;
  quantity: number;
  unitPrice: number | string;
  partnerSubtotal?: number | string;
  hotelServiceFeeAmount?: number | string;
  customerTotalAmount?: number | string;
};

export type HousekeepingTaskPayload = {
  eventId?: string;
  hotelId: string;
  taskId: string;
  roomId?: string | null;
  roomNumber?: string | null;
  taskType?: string | null;
  status?: string;
  previousStatus?: string | null;
  assignedStaffId?: string | null;
  assignedStaffName?: string | null;
  assignedToStaffId?: string | null;
  assignedToStaffName?: string | null;
  priority?: string | null;
  note?: string | null;
  notes?: string | null;
  reason?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
};

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
  status?: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorType?: string | null;
  note?: string | null;
  hotelStatus?: string | null;
  voucherNumber?: string | null;
  quantity?: number;
  unitPrice?: number | string;
  pricingUnit?: string | null;
  partnerSubtotal?: number | string;
  hotelServiceFeeAmount?: number | string;
  customerTotalAmount?: number | string;
  totalAmount?: number | string;
  currency?: string;
  guestNote?: string | null;
  serviceMode?: string;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  items?: ExternalServiceOrderItemPayload[];
};

export class RequestRealtimeEmitter {
  private static serverRef: Server | null = null;

  static bind(server: Server) {
    this.serverRef = server;
  }

  static emitGuestRequestCreated(input: {
    hotelId: string;
    sessionId: string;
    roomId?: string;
    ownerRequest: unknown;
    guestRequest: unknown;
  }) {
    this.serverRef?.to(this.ownerHotelRoom(input.hotelId)).emit("guest_request.created", {
      request: input.ownerRequest,
    });
    if (input.roomId) {
      this.serverRef
        ?.to(this.ownerRoomChannel(input.hotelId, input.roomId))
        .emit("guest_request.created", {
          request: input.ownerRequest,
        });
    }
    this.serverRef?.to(this.guestSessionRoom(input.sessionId)).emit("guest_request.created", {
      request: input.guestRequest,
    });
  }

  static emitGuestRequestUpdated(input: {
    hotelId: string;
    sessionId?: string | null;
    roomId?: string;
    ownerRequest: unknown;
    guestRequest?: unknown;
  }) {
    this.serverRef?.to(this.ownerHotelRoom(input.hotelId)).emit("guest_request.updated", {
      request: input.ownerRequest,
    });
    if (input.roomId) {
      this.serverRef
        ?.to(this.ownerRoomChannel(input.hotelId, input.roomId))
        .emit("guest_request.updated", {
          request: input.ownerRequest,
        });
    }
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
    roomId?: string;
    threadId: string;
    thread: unknown;
    message: unknown;
  }) {
    const payload = {
      eventId: input.eventId,
      messageId: input.messageId,
      hotelId: input.hotelId,
      stayId: input.stayId,
      roomId: input.roomId,
      threadId: input.threadId,
      thread: input.thread,
      message: input.message,
    };
    this.serverRef?.to(this.ownerHotelRoom(input.hotelId)).emit("guest_message.created", payload);
    if (input.roomId) {
      this.serverRef
        ?.to(this.ownerRoomChannel(input.hotelId, input.roomId))
        .emit("guest_message.created", payload);
    }
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
    if (input.roomId) {
      this.serverRef
        ?.to(this.ownerRoomChannel(input.hotelId, input.roomId))
        .emit("conversation.closed", payload);
    }
    this.serverRef?.to(this.guestStayRoom(input.stayId)).emit("conversation.closed", payload);
  }

  static emitMarketplaceConversationMessageCreated(input: {
    eventId?: string;
    hotelId: string;
    stayId: string;
    sessionId?: string;
    orderId: string;
    message: {
      id: string;
      orderId: string;
      senderType: string;
      body: string;
      deliveryStatus: string;
      createdAt: string;
    };
  }) {
    const eventId = input.eventId ?? randomUUID();
    const payload = {
      eventId,
      orderId: input.orderId,
      message: input.message,
    };
    let recipients = this.serverRef?.to(this.guestStayRoom(input.stayId));
    if (input.sessionId) {
      recipients = recipients?.to(this.guestSessionRoom(input.sessionId));
    }
    recipients?.emit("marketplace_conversation.message_created", payload);
  }

  static emitExternalServiceOrderCreated(
    input: ExternalServiceOrderPayload & { sessionId?: string | null },
  ) {
    const eventId = input.eventId ?? randomUUID();
    const payload = { ...input, eventId };

    this.serverRef
      ?.to(this.ownerHotelRoom(input.hotelId))
      .emit("external_service_order.created", payload);
    if (input.roomId) {
      this.serverRef
        ?.to(this.ownerRoomChannel(input.hotelId, input.roomId))
        .emit("external_service_order.created", payload);
    }
    this.serverRef
      ?.to(this.serviceTenantRoom(input.serviceTenantId))
      .emit("external_service_order.created", payload);
    if (input.sessionId) {
      this.serverRef
        ?.to(this.guestSessionRoom(input.sessionId))
        .emit("external_service_order.created", payload);
    }
    if (input.stayId) {
      this.serverRef
        ?.to(this.guestStayRoom(input.stayId))
        .emit("external_service_order.created", payload);
    }
  }

  static emitExternalServiceOrderStatusChanged(
    input: ExternalServiceOrderPayload & { sessionId?: string | null },
  ) {
    const eventId = input.eventId ?? randomUUID();
    const payload = { ...input, eventId };

    this.serverRef
      ?.to(this.ownerHotelRoom(input.hotelId))
      .emit("external_service_order.status_changed", payload);
    if (input.roomId) {
      this.serverRef
        ?.to(this.ownerRoomChannel(input.hotelId, input.roomId))
        .emit("external_service_order.status_changed", payload);
    }
    this.serverRef
      ?.to(this.serviceTenantRoom(input.serviceTenantId))
      .emit("external_service_order.status_changed", payload);
    if (input.sessionId) {
      this.serverRef
        ?.to(this.guestSessionRoom(input.sessionId))
        .emit("external_service_order.status_changed", payload);
    }
    if (input.stayId) {
      this.serverRef
        ?.to(this.guestStayRoom(input.stayId))
        .emit("external_service_order.status_changed", payload);
    }
  }

  static emitExternalServiceOrderHotelAcknowledged(
    input: ExternalServiceOrderPayload & { sessionId?: string | null },
  ) {
    const eventId = input.eventId ?? randomUUID();
    const payload = { ...input, eventId };

    this.serverRef
      ?.to(this.ownerHotelRoom(input.hotelId))
      .emit("external_service_order.hotel_acknowledged", payload);
    if (input.roomId) {
      this.serverRef
        ?.to(this.ownerRoomChannel(input.hotelId, input.roomId))
        .emit("external_service_order.hotel_acknowledged", payload);
    }
    this.serverRef
      ?.to(this.serviceTenantRoom(input.serviceTenantId))
      .emit("external_service_order.hotel_acknowledged", payload);
    if (input.sessionId) {
      this.serverRef
        ?.to(this.guestSessionRoom(input.sessionId))
        .emit("external_service_order.hotel_acknowledged", payload);
    }
    if (input.stayId) {
      this.serverRef
        ?.to(this.guestStayRoom(input.stayId))
        .emit("external_service_order.hotel_acknowledged", payload);
    }
  }

  static emitExternalServiceOrderVoucherIssued(
    input: ExternalServiceOrderPayload & { sessionId?: string | null },
  ) {
    const eventId = input.eventId ?? randomUUID();
    const payload = { ...input, eventId };

    this.serverRef
      ?.to(this.ownerHotelRoom(input.hotelId))
      .emit("external_service_order.voucher_issued", payload);
    if (input.roomId) {
      this.serverRef
        ?.to(this.ownerRoomChannel(input.hotelId, input.roomId))
        .emit("external_service_order.voucher_issued", payload);
    }
    this.serverRef
      ?.to(this.serviceTenantRoom(input.serviceTenantId))
      .emit("external_service_order.voucher_issued", payload);
    if (input.sessionId) {
      this.serverRef
        ?.to(this.guestSessionRoom(input.sessionId))
        .emit("external_service_order.voucher_issued", payload);
    }
    if (input.stayId) {
      this.serverRef
        ?.to(this.guestStayRoom(input.stayId))
        .emit("external_service_order.voucher_issued", payload);
    }
  }

  static emitPartnerSettlementCreated(input: {
    eventId?: string;
    settlement: unknown;
    hotelId: string;
    serviceTenantId: string;
  }) {
    const eventId = input.eventId ?? randomUUID();
    const payload = {
      eventId,
      settlement: input.settlement,
      hotelId: input.hotelId,
      serviceTenantId: input.serviceTenantId,
    };

    this.serverRef
      ?.to(this.ownerHotelRoom(input.hotelId))
      .emit("partner_settlement.created", payload);
    this.serverRef
      ?.to(this.serviceTenantRoom(input.serviceTenantId))
      .emit("partner_settlement.created", payload);
  }

  static emitPartnerSettlementUpdated(input: {
    eventId?: string;
    settlement: unknown;
    hotelId: string;
    serviceTenantId: string;
  }) {
    const eventId = input.eventId ?? randomUUID();
    const payload = {
      eventId,
      settlement: input.settlement,
      hotelId: input.hotelId,
      serviceTenantId: input.serviceTenantId,
    };

    this.serverRef
      ?.to(this.ownerHotelRoom(input.hotelId))
      .emit("partner_settlement.updated", payload);
    this.serverRef
      ?.to(this.serviceTenantRoom(input.serviceTenantId))
      .emit("partner_settlement.updated", payload);
  }

  static emitChannelBookingCreated(input: {
    hotelId: string;
    bookingId: string;
    reservationId?: string;
    otaName: string;
    reservationCode: string;
    guestName: string;
    roomNumber?: string | null;
    roomType?: string | null;
    checkInDate?: string | null;
    checkOutDate?: string | null;
    amount?: number | string | null;
    currency?: string | null;
  }) {
    const eventId = randomUUID();
    const payload = { ...input, eventId };

    this.serverRef?.to(this.ownerHotelRoom(input.hotelId)).emit("channel_booking.created", payload);
  }

  static emitChannelBookingCancelled(input: {
    hotelId: string;
    bookingId: string;
    reservationId?: string;
    otaName?: string;
    reservationCode?: string;
  }) {
    const eventId = randomUUID();
    const payload = { ...input, eventId };

    this.serverRef
      ?.to(this.ownerHotelRoom(input.hotelId))
      .emit("channel_booking.cancelled", payload);
  }

  static emitRoomStatusUpdated(input: {
    hotelId: string;
    roomId: string;
    roomNumber?: string | null;
    status: string;
    previousStatus?: string | null;
    updatedAt?: string | Date | null;
  }) {
    const eventId = randomUUID();
    let formattedUpdatedAt: string;
    if (input.updatedAt instanceof Date) {
      formattedUpdatedAt = input.updatedAt.toISOString();
    } else if (typeof input.updatedAt === "string" && input.updatedAt) {
      formattedUpdatedAt = input.updatedAt;
    } else {
      formattedUpdatedAt = new Date().toISOString();
    }

    const payload = {
      eventId,
      hotelId: input.hotelId,
      roomId: input.roomId,
      roomNumber: input.roomNumber,
      status: input.status,
      previousStatus: input.previousStatus,
      updatedAt: formattedUpdatedAt,
    };

    this.serverRef?.to(this.ownerHotelRoom(input.hotelId)).emit("room_status.updated", payload);
    if (input.roomId) {
      this.serverRef
        ?.to(this.ownerRoomChannel(input.hotelId, input.roomId))
        .emit("room_status.updated", payload);
    }
  }

  private static formatIsoTimestamp(value?: string | Date | null): string {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === "string" && value) {
      return value;
    }
    return new Date().toISOString();
  }

  private static emitHousekeepingTaskEvent(
    eventName: string,
    defaultStatus: string,
    input: HousekeepingTaskPayload,
  ) {
    const eventId = input.eventId ?? randomUUID();
    const taskId = input.taskId || (input as { id?: string }).id || randomUUID();
    const payload = {
      ...input,
      eventId,
      taskId,
      status: input.status ?? defaultStatus,
      assignedStaffId: input.assignedStaffId ?? input.assignedToStaffId ?? null,
      assignedStaffName: input.assignedStaffName ?? input.assignedToStaffName ?? null,
      createdAt: this.formatIsoTimestamp(input.createdAt),
      updatedAt: this.formatIsoTimestamp(input.updatedAt),
    };

    this.serverRef?.to(this.ownerHotelRoom(input.hotelId)).emit(eventName, payload);
    if (input.roomId) {
      this.serverRef
        ?.to(this.ownerRoomChannel(input.hotelId, input.roomId))
        .emit(eventName, payload);
    }
    return payload;
  }

  static emitHousekeepingTaskCreated(input: HousekeepingTaskPayload) {
    return this.emitHousekeepingTaskEvent("housekeeping_task.created", "CREATED", input);
  }

  static emitHousekeepingTaskClaimed(input: HousekeepingTaskPayload) {
    return this.emitHousekeepingTaskEvent("housekeeping_task.claimed", "CLAIMED", input);
  }

  static emitHousekeepingTaskStarted(input: HousekeepingTaskPayload) {
    return this.emitHousekeepingTaskEvent("housekeeping_task.started", "IN_PROGRESS", input);
  }

  static emitHousekeepingTaskBlocked(input: HousekeepingTaskPayload) {
    return this.emitHousekeepingTaskEvent("housekeeping_task.blocked", "BLOCKED", input);
  }

  static emitHousekeepingTaskCompleted(input: HousekeepingTaskPayload) {
    return this.emitHousekeepingTaskEvent("housekeeping_task.completed", "COMPLETED", input);
  }

  static emitHousekeepingTaskReopened(input: HousekeepingTaskPayload) {
    return this.emitHousekeepingTaskEvent("housekeeping_task.reopened", "REOPENED", input);
  }

  static async emitAfterTransaction<T>(
    transactionPromise: Promise<T>,
    emitAction: (result: T) => void,
  ): Promise<T> {
    const result = await transactionPromise;
    try {
      emitAction(result);
    } catch {
      // realtime emit failure must not fail the completed transaction
    }
    return result;
  }

  static ownerHotelRoom(hotelId: string): string {
    return `${OWNER_ROOM_PREFIX}${hotelId}:requests`;
  }

  static ownerUserHotelRoom(hotelId: string, userId: string): string {
    return `${OWNER_ROOM_PREFIX}${hotelId}:user:${userId}:scope`;
  }

  static invalidateOwnerScope(hotelId: string, userId: string): void {
    const room = this.ownerUserHotelRoom(hotelId, userId);
    this.serverRef?.to(room).emit("request_realtime.error", { code: "SCOPE_CHANGED", retryable: true });
    this.serverRef?.in(room).disconnectSockets(true);
  }

  static ownerRoomChannel(hotelId: string, roomId: string): string {
    return `${OWNER_ROOM_PREFIX}${hotelId}:room:${roomId}:requests`;
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
