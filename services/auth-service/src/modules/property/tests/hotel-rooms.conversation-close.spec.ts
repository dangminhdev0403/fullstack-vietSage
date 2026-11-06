import { GuestStayStatus, RoomStatus } from "@prisma/client";
import { HotelRoomsService } from "../application/hotel-rooms.service";
import { RequestRealtimeEmitter } from "../../../request-realtime.emitter";

describe("HotelRoomsService conversation close event", () => {
  function createCheckoutContext() {
    const now = new Date("2026-07-22T12:00:00.000Z");
    const activeStay = {
      id: "stay-1",
      hotelId: "hotel-1",
      roomId: "room-101",
      reservationCode: "RSV-1",
      guestDisplayName: "Guest A",
      guestPhone: null,
      status: GuestStayStatus.ACTIVE,
      plannedCheckInAt: now,
      plannedCheckOutAt: new Date("2026-07-23T12:00:00.000Z"),
      checkedInAt: now,
      activatedAt: now,
      checkedOutAt: null,
      accessCodeExpiresAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const checkedOutStay = {
      ...activeStay,
      status: GuestStayStatus.CHECKED_OUT,
      checkedOutAt: now,
    };
    const order: string[] = [];
    const repository = {
      findStayInHotel: jest.fn().mockResolvedValue(activeStay),
      findBlockingBillingFolio: jest.fn().mockResolvedValue(null),
      findRoomInHotel: jest.fn().mockResolvedValue({
        id: "room-101",
        roomNumber: "101",
        status: RoomStatus.PROCESSING,
        updatedAt: now,
      }),
      checkOutStay: jest.fn().mockImplementation(async () => {
        order.push("transaction-committed");
        return checkedOutStay;
      }),
    };
    const publisher = {
      publishGuestRequestCreated: jest.fn(),
      publishGuestRequestUpdated: jest.fn(),
      publishGuestMessageCreated: jest.fn(),
      publishConversationClosed: jest.fn().mockImplementation(() => order.push("event-published")),
    };
    const logger = { business: jest.fn(), warn: jest.fn() };
    const service = new HotelRoomsService(
      repository as never,
      {} as never,
      { assertHotelAccess: jest.fn().mockResolvedValue({ tenantId: "tenant-1" }) } as never,
      logger as never,
      publisher,
    );

    return { service, repository, publisher, logger, order, now };
  }

  afterEach(() => jest.restoreAllMocks());

  it("publishes conversation.closed only after checkout repository transaction resolves", async () => {
    const { service, publisher, order } = createCheckoutContext();
    await service.checkOutStay("user-1", "role-1", "hotel-1", "stay-1", {
      nextRoomStatus: RoomStatus.PROCESSING,
    });

    expect(order).toEqual(["transaction-committed", "event-published"]);
    expect(publisher.publishConversationClosed).toHaveBeenCalledWith({
      hotelId: "hotel-1",
      stayId: "stay-1",
      roomId: "room-101",
    });
  });

  it("keeps a committed checkout successful when the realtime room reload fails", async () => {
    const { service, repository, publisher, logger } = createCheckoutContext();
    repository.findRoomInHotel.mockRejectedValue(new Error("room read unavailable"));
    const emit = jest.spyOn(RequestRealtimeEmitter, "emitRoomStatusUpdated");

    const result = await service.checkOutStay("user-1", "role-1", "hotel-1", "stay-1", {
      nextRoomStatus: RoomStatus.PROCESSING,
    });

    expect(result.status).toBe(GuestStayStatus.CHECKED_OUT);
    expect(repository.checkOutStay).toHaveBeenCalledTimes(1);
    expect(publisher.publishConversationClosed).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(emit).not.toHaveBeenCalled();
  });

  it("emits the persisted room status and version when a newer transition follows checkout", async () => {
    const { service, repository, now } = createCheckoutContext();
    const newerUpdatedAt = new Date(now.getTime() + 1000);
    repository.findRoomInHotel.mockResolvedValue({
      id: "room-101", roomNumber: "101", status: RoomStatus.MAINTENANCE, updatedAt: newerUpdatedAt,
    });
    const emit = jest.spyOn(RequestRealtimeEmitter, "emitRoomStatusUpdated");

    await service.checkOutStay("user-1", "role-1", "hotel-1", "stay-1", {
      nextRoomStatus: RoomStatus.PROCESSING,
    });

    expect(emit).toHaveBeenCalledWith({
      hotelId: "hotel-1", roomId: "room-101", roomNumber: "101",
      status: RoomStatus.MAINTENANCE, previousStatus: RoomStatus.OCCUPIED, updatedAt: newerUpdatedAt,
    });
  });

  it("propagates checkout mutation failures without emitting a room update", async () => {
    const { service, repository } = createCheckoutContext();
    const mutationError = new Error("checkout transaction failed");
    repository.checkOutStay.mockRejectedValue(mutationError);
    const emit = jest.spyOn(RequestRealtimeEmitter, "emitRoomStatusUpdated");

    await expect(service.checkOutStay("user-1", "role-1", "hotel-1", "stay-1", {
      nextRoomStatus: RoomStatus.PROCESSING,
    })).rejects.toBe(mutationError);

    expect(repository.findRoomInHotel).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});
