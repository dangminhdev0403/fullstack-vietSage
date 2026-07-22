import { GuestStayStatus, RoomStatus } from "@prisma/client";
import { HotelRoomsService } from "../application/hotel-rooms.service";

describe("HotelRoomsService conversation close event", () => {
  it("publishes conversation.closed only after checkout repository transaction resolves", async () => {
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
    const service = new HotelRoomsService(
      repository as never,
      {} as never,
      { assertHotelAccess: jest.fn().mockResolvedValue({ tenantId: "tenant-1" }) } as never,
      { business: jest.fn() } as never,
      publisher,
    );

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
});
