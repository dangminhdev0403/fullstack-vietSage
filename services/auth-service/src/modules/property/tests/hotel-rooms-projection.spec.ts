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
});
