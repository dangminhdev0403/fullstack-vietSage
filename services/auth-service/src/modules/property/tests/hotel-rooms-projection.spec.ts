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

import { GuestStayStatus, Prisma, ReservationStatus, RoomStatus } from "@prisma/client";
import { HotelRoomsRepository } from "../infrastructure/repositories/hotel-rooms.repository";

function createMockPrisma(overrides: Record<string, any> = {}) {
  const baseRoom = {
    id: "room-101",
    hotelId: "hotel-1",
    code: "VSH_ROOM_0101",
    roomNumber: "101",
    floor: "1",
    type: "DELUXE",
    roomTypeId: "rt-deluxe",
    price: new Prisma.Decimal(1200000),
    maxActiveGuestDevices: 3,
    status: RoomStatus.AVAILABLE,
    createdAt: new Date(),
    updatedAt: new Date(),
    qrCodes: [],
    guestStays: [],
  };

  return {
    room: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([baseRoom]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    guestSession: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    guestStay: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    reservation: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
}

describe("Authoritative Selected-Date Room Projection", () => {
  it("projects groupCode on projectedReservation when viewing a date with group booking", async () => {
    const selectedDate = "2026-11-20";
    const groupReservation = {
      id: "res-grp-1",
      hotelId: "hotel-1",
      roomId: "room-101",
      roomTypeSnapshot: "DELUXE",
      reservationCode: "VSH_RES_0001",
      groupCode: "VSH_GROUP_0001",
      guestDisplayName: "Doan Dai Bieu Cong Nghe",
      guestPhone: "0901112233",
      status: ReservationStatus.ARRIVAL_READY,
      plannedCheckInAt: new Date("2026-11-20T07:00:00.000Z"),
      plannedCheckOutAt: new Date("2026-11-23T05:00:00.000Z"),
      nightlyRateSnapshot: new Prisma.Decimal(1200000),
      assignedAt: new Date(),
      assignedByUserId: "user-1",
      checkedInAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const prisma = createMockPrisma({
      reservation: {
        findMany: jest.fn().mockResolvedValue([groupReservation]),
      },
      guestStay: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    const repository = new HotelRoomsRepository(prisma as any);
    const result = await repository.listRooms({ hotelId: "hotel-1" }, 0, 20, {
      businessDate: selectedDate,
      timezone: "Asia/Ho_Chi_Minh",
    });

    expect(result.items).toHaveLength(1);
    const room = result.items[0];
    expect(room.projectedStatus).toBe(RoomStatus.RESERVED);
    expect(room.projectedReservation).toBeDefined();
    expect(room.projectedReservation.groupCode).toBe("VSH_GROUP_0001");
    expect(room.projectedReservation.reservationCode).toBe("VSH_RES_0001");
    expect(room.projectedReservation.guestDisplayName).toBe("Doan Dai Bieu Cong Nghe");
  });

  it("ensures current occupant is absent when viewing a non-overlapping future date", async () => {
    const today = new Date();
    const currentActiveStay = {
      id: "stay-current",
      hotelId: "hotel-1",
      roomId: "room-101",
      reservationCode: "VSH_RES_CURRENT",
      guestDisplayName: "Khach Dang O Hom Nay",
      guestPhone: "0909999888",
      status: GuestStayStatus.ACTIVE,
      plannedCheckInAt: today,
      plannedCheckOutAt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      checkedInAt: today,
      checkedOutAt: null,
      occupants: [],
    };

    // The room has an active stay in the current database snapshot
    const prisma = createMockPrisma({
      room: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: "room-101",
            hotelId: "hotel-1",
            code: "VSH_ROOM_0101",
            roomNumber: "101",
            status: RoomStatus.OCCUPIED,
            guestStays: [currentActiveStay], // Active today
            qrCodes: [],
          },
        ]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      // When querying overlapping stays for a future date (next month), none overlap!
      guestStay: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      reservation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    const repository = new HotelRoomsRepository(prisma as any);
    const futureDate = "2026-12-15";
    const result = await repository.listRooms({ hotelId: "hotel-1" }, 0, 20, {
      businessDate: futureDate,
      timezone: "Asia/Ho_Chi_Minh",
    });

    const room = result.items[0];
    expect(room.projectedStatus).toBe(RoomStatus.AVAILABLE);
    // Current occupant must be absent on the non-overlapping future date
    expect(room.guestStays).toEqual([]);
    expect(room.projectedStay).toBeUndefined();
    expect(room.activeGuestDeviceCount).toBe(0);
  });

  it("preserves overdue warning semantics for active stays past planned checkout", async () => {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const overdueStay = {
      id: "stay-overdue",
      hotelId: "hotel-1",
      roomId: "room-101",
      reservationCode: "RES-OVERDUE",
      guestDisplayName: "Khach Qua Han Tra Phong",
      status: GuestStayStatus.ACTIVE,
      plannedCheckInAt: yesterday,
      plannedCheckOutAt: twoHoursAgo,
      checkedInAt: yesterday,
      checkedOutAt: null,
      occupants: [],
    };

    // When viewing today's date, the overdue stay is still occupying the room
    const todayStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);

    const prisma = createMockPrisma({
      room: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: "room-101",
            hotelId: "hotel-1",
            code: "VSH_ROOM_0101",
            roomNumber: "101",
            status: RoomStatus.OCCUPIED,
            guestStays: [overdueStay],
            qrCodes: [],
          },
        ]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      guestStay: {
        findMany: jest.fn().mockResolvedValue([overdueStay]),
      },
    });

    const repository = new HotelRoomsRepository(prisma as any);
    const result = await repository.listRooms({ hotelId: "hotel-1" }, 0, 20, {
      businessDate: todayStr,
      timezone: "Asia/Ho_Chi_Minh",
    });

    const room = result.items[0];
    expect(room.projectedStatus).toBe(RoomStatus.OCCUPIED);
    expect(room.guestStays).toHaveLength(1);
    expect(room.guestStays[0].id).toBe("stay-overdue");
    expect(room.projectedStay).toBeDefined();
    expect(room.projectedStay.id).toBe("stay-overdue");
  });

  it("persists and returns Room.zone and RoomType.maxOccupancy", async () => {
    const roomWithZone = {
      id: "room-zone-1",
      hotelId: "hotel-1",
      code: "VSH_ROOM_0201",
      roomNumber: "201",
      floor: "2",
      zone: "Khu Villa Ho Boi",
      type: "DELUXE_VILLA",
      roomTypeId: "rt-villa",
      roomType: {
        id: "rt-villa",
        name: "DELUXE_VILLA",
        basePrice: new Prisma.Decimal(2500000),
        maxOccupancy: 4,
      },
      price: new Prisma.Decimal(2500000),
      maxActiveGuestDevices: 4,
      status: RoomStatus.AVAILABLE,
      createdAt: new Date(),
      updatedAt: new Date(),
      qrCodes: [],
      guestStays: [],
    };

    const prisma = createMockPrisma({
      room: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([roomWithZone]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    });

    const repository = new HotelRoomsRepository(prisma as any);
    const result = await repository.listRooms({ hotelId: "hotel-1" }, 0, 20);

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.zone).toBe("Khu Villa Ho Boi");
    expect(item.maxOccupancy).toBe(4);
    expect(item.physicalStatus).toBe(RoomStatus.AVAILABLE);
    expect(item.projectedStatus).toBe(RoomStatus.AVAILABLE);
  });

  it("keeps legacy null capacity and room type unknown (null), not falsely zero", async () => {
    const legacyRoom = {
      id: "room-legacy-1",
      hotelId: "hotel-1",
      code: "VSH_ROOM_0099",
      roomNumber: "99",
      floor: null,
      zone: null,
      type: "LEGACY_ROOM",
      roomTypeId: null,
      roomType: null,
      price: new Prisma.Decimal(500000),
      maxActiveGuestDevices: 2,
      status: RoomStatus.AVAILABLE,
      createdAt: new Date(),
      updatedAt: new Date(),
      qrCodes: [],
      guestStays: [],
    };

    const prisma = createMockPrisma({
      room: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([legacyRoom]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      roomType: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    const repository = new HotelRoomsRepository(prisma as any);
    const result = await repository.listRooms({ hotelId: "hotel-1" }, 0, 20);
    const item = result.items[0];
    expect(item.maxOccupancy).toBeNull();
    expect(item.maxOccupancy).not.toBe(0);
    expect(item.zone).toBeNull();

    prisma.room.findMany = jest.fn().mockResolvedValue([legacyRoom]);
    const types = await repository.listRoomTypes("hotel-1");
    expect(types).toHaveLength(1);
    expect(types[0].maxOccupancy).toBeNull();
    expect(types[0].maxOccupancy).not.toBe(0);
  });

  it("does not mutate physical room status for future booking", async () => {
    const futureCheckIn = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const futureCheckOut = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

    const tx = {
      room: {
        findFirst: jest.fn().mockResolvedValue({
          id: "room-101",
          hotelId: "hotel-1",
          status: RoomStatus.AVAILABLE,
          roomTypeId: "rt-deluxe",
          roomType: { id: "rt-deluxe", maxOccupancy: 2 },
        }),
        updateMany: jest.fn(),
      },
      guestStay: {
        create: jest.fn().mockResolvedValue({
          id: "stay-future-1",
          hotelId: "hotel-1",
          roomId: "room-101",
          reservationCode: "VSH_RES_FUT_1",
          status: GuestStayStatus.RESERVED,
        }),
      },
      folio: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      domainEvent: {
        create: jest.fn(),
      },
    };

    const prisma = {
      $transaction: jest.fn(async (cb: (client: any) => any) => cb(tx)),
    };

    const repository = new HotelRoomsRepository(prisma as any);
    await repository.createStay({
      hotelId: "hotel-1",
      roomId: "room-101",
      guestDisplayName: "Future Guest",
      plannedCheckInAt: futureCheckIn,
      plannedCheckOutAt: futureCheckOut,
      createdByUserId: "user-1",
      tenantId: "tenant-1",
      generateReservationCode: async () => "VSH_RES_FUT_1",
      generateFolioNumber: async () => "FOL-001",
    });

    expect(tx.room.updateMany).not.toHaveBeenCalled();
    expect(tx.guestStay.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: GuestStayStatus.RESERVED,
          plannedCheckInAt: futureCheckIn,
        }),
      }),
    );
  });

  it("respects half-open reservation intervals [checkIn, checkOut) so arriving reservation on date D projects accurately", async () => {
    const resArriving = {
      id: "res-arriving",
      hotelId: "hotel-1",
      roomId: "room-101",
      reservationCode: "RES-ARRIVING",
      guestDisplayName: "Khach Den Ngay 20",
      status: ReservationStatus.CONFIRMED,
      plannedCheckInAt: new Date("2026-11-20T07:00:00.000Z"),
      plannedCheckOutAt: new Date("2026-11-22T05:00:00.000Z"),
      nightlyRateSnapshot: new Prisma.Decimal(1000000),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const prisma = createMockPrisma({
      reservation: {
        findMany: jest.fn().mockResolvedValue([resArriving]),
      },
      guestStay: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    const repository = new HotelRoomsRepository(prisma as any);
    const result = await repository.listRooms({ hotelId: "hotel-1" }, 0, 20, {
      businessDate: "2026-11-20",
      timezone: "Asia/Ho_Chi_Minh",
    });

    const room = result.items[0];
    expect(room.projectedStatus).toBe(RoomStatus.RESERVED);
    expect(room.projectedReservation.reservationCode).toBe("RES-ARRIVING");
    expect(room.statusConflictCode).toBeNull();
  });

  it("detects status conflicts: NON_SELLABLE_OCCUPIED_CONFLICT and AVAILABLE_WITH_ACTIVE_STAY_CONFLICT", async () => {
    const activeStay = {
      id: "stay-active",
      hotelId: "hotel-1",
      roomId: "room-101",
      status: GuestStayStatus.ACTIVE,
      plannedCheckInAt: new Date(),
      plannedCheckOutAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      checkedInAt: new Date(),
      checkedOutAt: null,
      occupants: [],
    };

    const prisma1 = createMockPrisma({
      room: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: "room-101",
            hotelId: "hotel-1",
            roomNumber: "101",
            status: RoomStatus.MAINTENANCE,
            guestStays: [activeStay],
            qrCodes: [],
          },
        ]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    });

    const repo1 = new HotelRoomsRepository(prisma1 as any);
    const result1 = await repo1.listRooms({ hotelId: "hotel-1" }, 0, 20);
    expect(result1.items[0].statusConflictCode).toBe("NON_SELLABLE_OCCUPIED_CONFLICT");

    const prisma2 = createMockPrisma({
      room: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: "room-101",
            hotelId: "hotel-1",
            roomNumber: "101",
            status: RoomStatus.AVAILABLE,
            guestStays: [activeStay],
            qrCodes: [],
          },
        ]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    });

    const repo2 = new HotelRoomsRepository(prisma2 as any);
    const result2 = await repo2.listRooms({ hotelId: "hotel-1" }, 0, 20);
    expect(result2.items[0].statusConflictCode).toBe("AVAILABLE_WITH_ACTIVE_STAY_CONFLICT");
  });
});
