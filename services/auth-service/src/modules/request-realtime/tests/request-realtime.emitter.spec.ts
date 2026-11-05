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

  describe("Housekeeping task events", () => {
    let emit: jest.Mock;
    let server: { to: jest.Mock };

    beforeEach(() => {
      emit = jest.fn();
      server = {
        to: jest.fn(() => ({ emit })),
      };
      RequestRealtimeEmitter.bind(server as never);
    });

    it("emits housekeeping_task.created to hotel and room channels with generated eventId", () => {
      const payload = RequestRealtimeEmitter.emitHousekeepingTaskCreated({
        hotelId: "hotel-1",
        taskId: "task-1",
        roomId: "room-101",
        roomNumber: "101",
        taskType: "DEEP_CLEAN",
        priority: "HIGH",
      });

      expect(server.to).toHaveBeenCalledWith("owner:hotel:hotel-1:requests");
      expect(server.to).toHaveBeenCalledWith("owner:hotel:hotel-1:room:room-101:requests");
      expect(emit).toHaveBeenCalledWith(
        "housekeeping_task.created",
        expect.objectContaining({
          hotelId: "hotel-1",
          taskId: "task-1",
          roomId: "room-101",
          roomNumber: "101",
          taskType: "DEEP_CLEAN",
          status: "CREATED",
          eventId: expect.any(String),
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        }),
      );
      expect(payload.eventId).toBeDefined();
    });

    it("preserves explicit eventId and formats Date objects into ISO strings", () => {
      const date = new Date("2026-11-06T10:00:00.000Z");
      RequestRealtimeEmitter.emitHousekeepingTaskClaimed({
        eventId: "custom-event-uuid-123",
        hotelId: "hotel-1",
        taskId: "task-2",
        assignedStaffId: "staff-99",
        assignedStaffName: "Nguyen Housekeeping",
        updatedAt: date,
      });

      expect(emit).toHaveBeenCalledWith(
        "housekeeping_task.claimed",
        expect.objectContaining({
          eventId: "custom-event-uuid-123",
          hotelId: "hotel-1",
          taskId: "task-2",
          status: "CLAIMED",
          assignedStaffId: "staff-99",
          assignedStaffName: "Nguyen Housekeeping",
          updatedAt: "2026-11-06T10:00:00.000Z",
        }),
      );
    });

    it("emits housekeeping_task.started, blocked, completed, and reopened events", () => {
      RequestRealtimeEmitter.emitHousekeepingTaskStarted({
        hotelId: "hotel-1",
        taskId: "task-3",
        roomId: "room-202",
      });
      expect(emit).toHaveBeenCalledWith(
        "housekeeping_task.started",
        expect.objectContaining({ taskId: "task-3", status: "IN_PROGRESS" }),
      );

      RequestRealtimeEmitter.emitHousekeepingTaskBlocked({
        hotelId: "hotel-1",
        taskId: "task-3",
        roomId: "room-202",
        reason: "Khách chưa rời phòng",
      });
      expect(emit).toHaveBeenCalledWith(
        "housekeeping_task.blocked",
        expect.objectContaining({ taskId: "task-3", status: "BLOCKED", reason: "Khách chưa rời phòng" }),
      );

      RequestRealtimeEmitter.emitHousekeepingTaskCompleted({
        hotelId: "hotel-1",
        taskId: "task-3",
        roomId: "room-202",
      });
      expect(emit).toHaveBeenCalledWith(
        "housekeeping_task.completed",
        expect.objectContaining({ taskId: "task-3", status: "COMPLETED" }),
      );

      RequestRealtimeEmitter.emitHousekeepingTaskReopened({
        hotelId: "hotel-1",
        taskId: "task-3",
        roomId: "room-202",
        reason: "Kiểm tra lại ga giường",
      });
      expect(emit).toHaveBeenCalledWith(
        "housekeeping_task.reopened",
        expect.objectContaining({ taskId: "task-3", status: "REOPENED", reason: "Kiểm tra lại ga giường" }),
      );
    });

    it("emits only after successful transaction completion via emitAfterTransaction", async () => {
      const emitAction = jest.fn();

      const successPromise = Promise.resolve({ success: true, id: "task-4" });
      const result = await RequestRealtimeEmitter.emitAfterTransaction(successPromise, emitAction);
      expect(result).toEqual({ success: true, id: "task-4" });
      expect(emitAction).toHaveBeenCalledWith({ success: true, id: "task-4" });

      const failedPromise = Promise.reject(new Error("Transaction rolled back"));
      await expect(
        RequestRealtimeEmitter.emitAfterTransaction(failedPromise, emitAction),
      ).rejects.toThrow("Transaction rolled back");
      expect(emitAction).toHaveBeenCalledTimes(1); // not called again for failed transaction
    });
  });
});
