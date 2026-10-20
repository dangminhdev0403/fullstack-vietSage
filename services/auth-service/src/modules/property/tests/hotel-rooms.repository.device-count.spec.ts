process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.PORT = process.env.PORT || "8080";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/vietsage_auth";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "replace-with-local-docker-access-secret-at-least-32-chars";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "replace-with-local-docker-refresh-secret-at-least-32-chars";
process.env.JWT_ACCESS_TTL = process.env.JWT_ACCESS_TTL || "15m";
process.env.JWT_REFRESH_TTL = process.env.JWT_REFRESH_TTL || "30d";

import { ConflictException } from "@nestjs/common";
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
        groupBy: jest.fn().mockResolvedValue([]),
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
    const prisma = tx;
    const repository = new HotelRoomsRepository(prisma as never);

    const result = await repository.listRooms({ hotelId: "hotel-1" }, 0, 100);

    expect(prisma.room.count).toHaveBeenCalledTimes(2);
    expect(prisma.room.findMany).toHaveBeenCalledTimes(3);
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "stay-1" }),
      },
      room: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
    expect(tx.room.updateMany).toHaveBeenCalledWith({
      where: { id: "room-1", hotelId: "hotel-1", status: RoomStatus.OCCUPIED },
      data: { status: RoomStatus.PROCESSING },
    });
    expect(tx.guestSession.updateMany).toHaveBeenCalled();
    expect(tx.domainEvent.create).not.toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: "ROOM_QR_DEACTIVATED" }),
    });
  });

  it("rejects check-out when room status is no longer OCCUPIED", async () => {
    const tx = {
      guestStay: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "stay-1" }),
      },
      room: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      roomQRCode: {
        updateMany: jest.fn(),
      },
      guestSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      domainEvent: {
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new HotelRoomsRepository(prisma as never);

    await expect(
      repository.checkOutStay({
        hotelId: "hotel-1",
        stayId: "stay-1",
        roomId: "room-1",
        actorUserId: "staff-1",
        tenantId: "tenant-1",
        nextRoomStatus: RoomStatus.PROCESSING,
      }),
    ).rejects.toThrow(new ConflictException("Trạng thái phòng đã thay đổi trong lúc check-out"));
  });

  it("rejects a stale status command after another actor updates the room", async () => {
    const expectedUpdatedAt = new Date("2026-10-15T00:00:00.000Z");
    const tx = {
      room: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new HotelRoomsRepository(prisma as never);

    await expect(
      repository.updateRoomInHotel(
        "hotel-1",
        "room-1",
        { status: RoomStatus.PROCESSING },
        { status: RoomStatus.AVAILABLE, updatedAt: expectedUpdatedAt },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.room.updateMany).toHaveBeenCalledWith({
      where: {
        id: "room-1",
        hotelId: "hotel-1",
        status: RoomStatus.AVAILABLE,
        updatedAt: expectedUpdatedAt,
      },
      data: { status: RoomStatus.PROCESSING },
    });
    expect(tx.room.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("allows only one PROCESSING to AVAILABLE confirmation", async () => {
    const expectedUpdatedAt = new Date("2026-10-15T00:00:00.000Z");
    const room = {
      id: "room-1",
      hotelId: "hotel-1",
      status: RoomStatus.AVAILABLE,
      guestStays: [],
      qrCodes: [],
    };
    const tx = {
      room: {
        findFirst: jest.fn().mockResolvedValue({
          id: "room-1",
          status: RoomStatus.PROCESSING,
          updatedAt: expectedUpdatedAt,
        }),
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(room),
      },
      guestSession: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new HotelRoomsRepository(prisma as never);

    await expect(
      repository.confirmRoomReady("hotel-1", "room-1", expectedUpdatedAt),
    ).resolves.toMatchObject({ status: RoomStatus.AVAILABLE });
    await expect(
      repository.confirmRoomReady("hotel-1", "room-1", expectedUpdatedAt),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects check-in while the room is still PROCESSING", async () => {
    const tx = {
      guestStay: {
        findFirst: jest.fn().mockResolvedValue({ id: "stay-1", status: "RESERVED" }),
      },
      room: {
        findFirst: jest.fn().mockResolvedValue({ id: "room-1", status: RoomStatus.PROCESSING }),
        updateMany: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new HotelRoomsRepository(prisma as never);

    await expect(
      repository.checkInStay({
        hotelId: "hotel-1",
        stayId: "stay-1",
        roomId: "room-1",
        accessCodeHash: "hash",
        accessCodeExpiresAt: new Date("2026-10-16T00:00:00.000Z"),
        actorUserId: "frontdesk-1",
        tenantId: "tenant-1",
        generateFolioNumber: jest.fn(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.room.updateMany).not.toHaveBeenCalled();
  });

  it("rejects walk-in check-in while the room is still PROCESSING", async () => {
    const tx = {
      room: {
        findFirst: jest.fn().mockResolvedValue({ id: "room-1", status: RoomStatus.PROCESSING }),
        updateMany: jest.fn(),
      },
      guestStay: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new HotelRoomsRepository(prisma as never);

    await expect(
      repository.createAndCheckInStay({
        hotelId: "hotel-1",
        roomId: "room-1",
        guestDisplayName: "Guest",
        plannedCheckInAt: new Date("2026-10-15T12:00:00.000Z"),
        plannedCheckOutAt: new Date("2026-10-16T12:00:00.000Z"),
        createdByUserId: "frontdesk-1",
        actorUserId: "frontdesk-1",
        accessCodeHash: "hash",
        accessCodeExpiresAt: new Date("2026-10-16T00:00:00.000Z"),
        generateReservationCode: jest.fn(),
        generateFolioNumber: jest.fn(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.guestStay.create).not.toHaveBeenCalled();
    expect(tx.room.updateMany).not.toHaveBeenCalled();
  });
});
