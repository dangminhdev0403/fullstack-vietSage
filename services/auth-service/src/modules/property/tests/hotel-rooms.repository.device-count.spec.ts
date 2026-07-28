import { GuestSessionStatus, RoomStatus } from "@prisma/client";
import { HotelRoomsRepository } from "../infrastructure/repositories/hotel-rooms.repository";

describe("HotelRoomsRepository guest device count", () => {
  it("uses distinct unexpired ACTIVE and IDLE devices for the room summary", async () => {
    const room = {
      id: "room-1",
      hotelId: "hotel-1",
      roomNumber: "201",
      status: RoomStatus.OCCUPIED,
      guestStays: [{ id: "stay-1" }],
      qrCodes: [],
      _count: { assets: 0 },
    };
    const tx = {
      room: {
        count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([room])
          .mockResolvedValueOnce([{ floor: "2" }])
          .mockResolvedValueOnce([{ type: "DELUXE" }]),
      },
      guestSession: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "session-1",
            stayId: "stay-1",
            deviceFingerprintHash: "device-a",
            ipHash: null,
            userAgent: null,
          },
          {
            id: "session-2",
            stayId: "stay-1",
            deviceFingerprintHash: "device-a",
            ipHash: null,
            userAgent: null,
          },
          {
            id: "session-3",
            stayId: "stay-1",
            deviceFingerprintHash: "device-b",
            ipHash: null,
            userAgent: null,
          },
        ]),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new HotelRoomsRepository(prisma as never);

    const result = await repository.listRooms({ hotelId: "hotel-1" }, 0, 100);

    expect(result.items[0]?.activeGuestDeviceCount).toBe(2);
    expect(tx.guestSession.findMany).toHaveBeenCalledWith({
      where: {
        stayId: { in: ["stay-1"] },
        status: { in: [GuestSessionStatus.ACTIVE, GuestSessionStatus.IDLE] },
        closedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      select: {
        id: true,
        stayId: true,
        deviceFingerprintHash: true,
        ipHash: true,
        userAgent: true,
      },
    });
  });

  it("closes the stay and guest sessions without changing the room QR status", async () => {
    const tx = {
      guestStay: {
        update: jest.fn().mockResolvedValue({ id: "stay-1" }),
      },
      room: {
        update: jest.fn().mockResolvedValue({ id: "room-1" }),
      },
      roomQRCode: {
        updateMany: jest.fn(),
      },
      guestSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      domainEvent: {
        create: jest.fn().mockResolvedValue({ id: "event-1" }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new HotelRoomsRepository(prisma as never);

    await repository.checkOutStay({
      hotelId: "hotel-1",
      stayId: "stay-1",
      roomId: "room-1",
      actorUserId: "staff-1",
      tenantId: "tenant-1",
      nextRoomStatus: RoomStatus.PROCESSING,
    });

    expect(tx.roomQRCode.updateMany).not.toHaveBeenCalled();
    expect(tx.guestSession.updateMany).toHaveBeenCalled();
    expect(tx.domainEvent.create).not.toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: "ROOM_QR_DEACTIVATED" }),
    });
  });
});
