import { RequestRealtimeEmitter } from "../../../request-realtime.emitter";

describe("RequestRealtimeEmitter", () => {
  it("emits one marketplace message event to the union of guest stay and session rooms", () => {
    const emit = jest.fn();
    const operator = {
      to: jest.fn(() => operator),
      emit,
    };
    const server = { to: jest.fn(() => operator) };
    RequestRealtimeEmitter.bind(server as never);

    RequestRealtimeEmitter.emitMarketplaceConversationMessageCreated({
      hotelId: "hotel-1",
      stayId: "stay-1",
      sessionId: "session-1",
      orderId: "order-1",
      message: {
        id: "message-1",
        orderId: "order-1",
        senderType: "SERVICE_STAFF",
        body: "Em đang tới ạ",
        deliveryStatus: "RECEIVED",
        createdAt: "2026-10-04T00:00:00.000Z",
      },
    });

    expect(server.to).toHaveBeenCalledTimes(1);
    expect(server.to).toHaveBeenCalledWith("guest-stay:stay-1");
    expect(operator.to).toHaveBeenCalledWith("guest-session:session-1");
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      "marketplace_conversation.message_created",
      expect.objectContaining({ orderId: "order-1" }),
    );
  });

  it("emits room_status.updated to hotel and room channels", () => {
    const emit = jest.fn();
    const server = {
      to: jest.fn(() => ({ emit })),
    };
    RequestRealtimeEmitter.bind(server as never);

    RequestRealtimeEmitter.emitRoomStatusUpdated({
      hotelId: "hotel-1",
      roomId: "room-101",
      roomNumber: "101",
      status: "AVAILABLE",
      previousStatus: "PROCESSING",
      updatedAt: "2026-10-15T08:00:00.000Z",
    });

    expect(server.to).toHaveBeenCalledWith("owner:hotel:hotel-1:requests");
    expect(server.to).toHaveBeenCalledWith("owner:hotel:hotel-1:room:room-101:requests");
    expect(emit).toHaveBeenCalledWith(
      "room_status.updated",
      expect.objectContaining({
        hotelId: "hotel-1",
        roomId: "room-101",
        roomNumber: "101",
        status: "AVAILABLE",
        previousStatus: "PROCESSING",
      }),
    );
  });
});
