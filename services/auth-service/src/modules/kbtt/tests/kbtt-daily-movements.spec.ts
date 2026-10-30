process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/test";
process.env.PORT = "3000";
process.env.JWT_ACCESS_SECRET = "test-secret-min-32-chars-long-abcdef";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-min-32-chars-long";
process.env.JWT_ACCESS_TTL = "15m";
process.env.JWT_REFRESH_TTL = "7d";

import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";

const ReservationStatus = {
  CONFIRMED: "CONFIRMED",
  ARRIVAL_READY: "ARRIVAL_READY",
} as const;

const GuestStayStatus = {
  ACTIVE: "ACTIVE",
  CHECKED_IN: "CHECKED_IN",
  CHECKOUT_PENDING: "CHECKOUT_PENDING",
  CHECKED_OUT: "CHECKED_OUT",
  RESERVED: "RESERVED",
} as const;

jest.mock("@prisma/client", () => {
  const enums: Record<string, any> = {
    PrismaClient: class PrismaClient {},
    ReservationStatus: {
      CONFIRMED: "CONFIRMED",
      ARRIVAL_READY: "ARRIVAL_READY",
    },
    GuestStayStatus: {
      ACTIVE: "ACTIVE",
      CHECKED_IN: "CHECKED_IN",
      CHECKOUT_PENDING: "CHECKOUT_PENDING",
      CHECKED_OUT: "CHECKED_OUT",
      RESERVED: "RESERVED",
    },
    RoomStatus: {
      AVAILABLE: "AVAILABLE",
      OCCUPIED: "OCCUPIED",
      RESERVED: "RESERVED",
    },
    RoomQRCodeStatus: {
      ACTIVE: "ACTIVE",
      INACTIVE: "INACTIVE",
      REVOKED: "REVOKED",
    },
    CitizenshipKind: {
      VIETNAMESE: "VIETNAMESE",
      FOREIGNER: "FOREIGNER",
    },
    Prisma: {},
  };

  return new Proxy(enums, {
    get: (target, prop: string) => {
      if (prop in target) return target[prop];
      target[prop] = new Proxy(
        {},
        {
          get: (_, val: string) => val,
        },
      );
      return target[prop];
    },
  });
});

import { KbttController } from "../api/kbtt.controller";
import { KbttService } from "../application/kbtt.service";
import { HotelStayOccupantsReadService } from "../../property/application/hotel-stay-occupants-read.service";
import { HotelRoomsRepository } from "../../property/infrastructure/repositories/hotel-rooms.repository";
import { getDayBounds, VIETNAM_TIME_ZONE } from "../../../common/time/vietnam-temporal";
import type { RequestWithRequiredUser } from "../../../shared/security/request-with-authenticated-user";

describe("KBTT Daily Movements (T08A)", () => {
  let controller: KbttController;
  let service: KbttService;
  let occupantsReadService: HotelStayOccupantsReadService;
  let repository: HotelRoomsRepository;

  let mockPrisma: any;
  let mockAccess: any;
  let mockProvider: any;
  let mockCipher: any;
  let mockKbttRepo: any;

  const mockUserRequest = (userId = "user-1", roleId = "role-owner"): RequestWithRequiredUser =>
    ({
      user: {
        userId,
        roleId,
        username: "testuser",
        tenantId: "tenant-1",
      },
    }) as any;

  beforeEach(() => {
    mockPrisma = {
      room: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      reservation: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      guestStay: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    mockAccess = {
      assertHotelAccess: jest.fn().mockResolvedValue({ id: "hotel-1", tenantId: "tenant-1" }),
      resolveRoomScope: jest.fn().mockResolvedValue({
        hotel: { id: "hotel-1" },
        allowedRoomId: null,
        mode: "HOTEL_WIDE",
      }),
    };

    mockProvider = {
      invoke: jest.fn(),
      revoke: jest.fn(),
    };

    mockCipher = {
      encrypt: jest.fn(),
      decrypt: jest.fn(),
    };

    mockKbttRepo = {
      findDeclarationsByHotel: jest.fn().mockResolvedValue([]),
      findOccupant: jest.fn(),
    };

    repository = new HotelRoomsRepository(mockPrisma);
    occupantsReadService = new HotelStayOccupantsReadService(repository);
    service = new KbttService(
      mockAccess,
      mockKbttRepo,
      mockCipher,
      mockProvider,
      occupantsReadService,
    );
    controller = new KbttController(service);
  });

  describe("Validation", () => {
    it("should reject missing date", () => {
      const req = mockUserRequest();
      expect(() =>
        controller.getDailyMovements(req, "hotel-1", {
          kind: "ARRIVAL",
        }),
      ).toThrow(BadRequestException);
    });

    it("should reject invalid date formats or calendar dates", () => {
      const req = mockUserRequest();
      expect(() =>
        controller.getDailyMovements(req, "hotel-1", {
          date: "not-a-date",
          kind: "ARRIVAL",
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        controller.getDailyMovements(req, "hotel-1", {
          date: "2026-02-31",
          kind: "ARRIVAL",
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        controller.getDailyMovements(req, "hotel-1", {
          date: "2026-13-01",
          kind: "ARRIVAL",
        }),
      ).toThrow(BadRequestException);
    });

    it("should reject missing or invalid kind", () => {
      const req = mockUserRequest();
      expect(() =>
        controller.getDailyMovements(req, "hotel-1", {
          date: "2026-10-27",
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        controller.getDailyMovements(req, "hotel-1", {
          date: "2026-10-27",
          kind: "UNKNOWN",
        }),
      ).toThrow(BadRequestException);
    });

    it("should accept valid query with defaults", async () => {
      const req = mockUserRequest();
      mockPrisma.reservation.count.mockResolvedValueOnce(0);
      mockPrisma.reservation.findMany.mockResolvedValueOnce([]);

      const result = await controller.getDailyMovements(req, "hotel-1", {
        date: "2026-10-27",
        kind: "ARRIVAL",
      });

      expect(result).toEqual({
        items: [],
        total: 0,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
    });

    it("should trim search query and coerce pagination numbers", async () => {
      const req = mockUserRequest();
      mockPrisma.reservation.count.mockResolvedValueOnce(0);
      mockPrisma.reservation.findMany.mockResolvedValueOnce([]);

      const result = await controller.getDailyMovements(req, "hotel-1", {
        date: "2026-10-27",
        kind: "ARRIVAL",
        q: "   Nguyen   ",
        page: "2",
        limit: "10",
      });

      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(mockPrisma.reservation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  describe("Access & Room Scope", () => {
    it("should fail closed when user has no hotel access", async () => {
      mockAccess.assertHotelAccess.mockRejectedValueOnce(
        new ForbiddenException("Bạn không thể truy cập khách sạn này"),
      );
      const req = mockUserRequest();

      await expect(
        controller.getDailyMovements(req, "hotel-1", {
          date: "2026-10-27",
          kind: "ARRIVAL",
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should push room-exclusive role scope to DB query before count/pagination", async () => {
      mockAccess.resolveRoomScope.mockResolvedValueOnce({
        hotel: { id: "hotel-1" },
        allowedRoomId: "room-101",
        mode: "ROOM_EXCLUSIVE",
      });

      mockPrisma.reservation.count.mockResolvedValueOnce(1);
      mockPrisma.reservation.findMany.mockResolvedValueOnce([
        {
          id: "res-1",
          hotelId: "hotel-1",
          roomId: "room-101",
          reservationCode: "RES-101",
          groupCode: null,
          guestDisplayName: "Test Guest",
          guestPhone: "0901234567",
          status: ReservationStatus.CONFIRMED,
          plannedCheckInAt: new Date("2026-10-27T07:00:00Z"),
          plannedCheckOutAt: new Date("2026-10-29T05:00:00Z"),
          checkedInAt: null,
        },
      ]);
      mockPrisma.room.findMany.mockResolvedValueOnce([{ id: "room-101", roomNumber: "101" }]);

      const req = mockUserRequest();
      const res = await controller.getDailyMovements(req, "hotel-1", {
        date: "2026-10-27",
        kind: "ARRIVAL",
      });

      expect(mockPrisma.reservation.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ roomId: "room-101" }]),
        }),
      });
      expect(mockPrisma.reservation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([{ roomId: "room-101" }]),
          }),
        }),
      );
      expect(res.items).toHaveLength(1);
      expect(res.items[0].roomNumber).toBe("101");
    });

    it("should fail closed with empty items when room-exclusive actor has no assigned room", async () => {
      mockAccess.resolveRoomScope.mockResolvedValueOnce({
        hotel: { id: "hotel-1" },
        allowedRoomId: null,
        mode: "ROOM_EXCLUSIVE",
      });

      const req = mockUserRequest();
      const res = await controller.getDailyMovements(req, "hotel-1", {
        date: "2026-10-27",
        kind: "ARRIVAL",
      });

      expect(res.items).toEqual([]);
      expect(res.total).toBe(0);
      expect(mockPrisma.reservation.count).not.toHaveBeenCalled();
    });
  });

  describe("Arrival Semantics", () => {
    it("should query CONFIRMED and ARRIVAL_READY within Asia/Ho_Chi_Minh day bounds", async () => {
      const { start, end } = getDayBounds("2026-10-27", VIETNAM_TIME_ZONE);

      mockPrisma.reservation.count.mockResolvedValueOnce(2);
      mockPrisma.reservation.findMany.mockResolvedValueOnce([
        {
          id: "res-1",
          hotelId: "hotel-1",
          roomId: "room-1",
          reservationCode: "RES-001",
          groupCode: "GRP-A",
          guestDisplayName: "Nguyen Van A",
          guestPhone: "0912345678",
          status: ReservationStatus.CONFIRMED,
          plannedCheckInAt: new Date(start.getTime() + 3600000),
          plannedCheckOutAt: new Date(end.getTime() + 86400000),
          checkedInAt: null,
        },
        {
          id: "res-2",
          hotelId: "hotel-1",
          roomId: "room-2",
          reservationCode: "RES-002",
          groupCode: null,
          guestDisplayName: "Tran Thi B",
          guestPhone: "0987654321",
          status: ReservationStatus.ARRIVAL_READY,
          plannedCheckInAt: new Date(start.getTime() + 7200000),
          plannedCheckOutAt: new Date(end.getTime() + 86400000),
          checkedInAt: null,
        },
      ]);
      mockPrisma.room.findMany.mockResolvedValueOnce([
        { id: "room-1", roomNumber: "101" },
        { id: "room-2", roomNumber: "102" },
      ]);

      const req = mockUserRequest();
      const res = await controller.getDailyMovements(req, "hotel-1", {
        date: "2026-10-27",
        kind: "ARRIVAL",
      });

      expect(mockPrisma.reservation.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { hotelId: "hotel-1" },
            {
              status: {
                in: [ReservationStatus.CONFIRMED, ReservationStatus.ARRIVAL_READY],
              },
            },
            { plannedCheckInAt: { gte: start, lt: end } },
          ]),
        }),
      });

      expect(res.items).toHaveLength(2);
      expect(res.items[0]).toMatchObject({
        kind: "ARRIVAL",
        reservationId: "res-1",
        stayId: null,
        reservationCode: "RES-001",
        groupCode: "GRP-A",
        roomId: "room-1",
        roomNumber: "101",
        guestDisplayName: "Nguyen Van A",
        guestPhone: "0912345678",
        status: ReservationStatus.CONFIRMED,
        occupantCount: 1,
        canCheckIn: true,
        canCheckOut: false,
      });

      expect(res.items[1]).toMatchObject({
        kind: "ARRIVAL",
        reservationId: "res-2",
        stayId: null,
        reservationCode: "RES-002",
        groupCode: null,
        roomId: "room-2",
        roomNumber: "102",
        guestDisplayName: "Tran Thi B",
        guestPhone: "0987654321",
        status: ReservationStatus.ARRIVAL_READY,
        occupantCount: 1,
        canCheckIn: true,
        canCheckOut: false,
      });
    });
  });

  describe("Departure Semantics & Deduplication", () => {
    it("should query planned active/pending stays plus actually checked out stays", async () => {
      const { start, end } = getDayBounds("2026-10-27", VIETNAM_TIME_ZONE);

      mockPrisma.guestStay.count.mockResolvedValueOnce(3);
      mockPrisma.guestStay.findMany.mockResolvedValueOnce([
        {
          id: "stay-active",
          hotelId: "hotel-1",
          roomId: "room-101",
          reservationCode: "STAY-01",
          guestDisplayName: "Active Planned Departure",
          guestPhone: "0911111111",
          status: GuestStayStatus.ACTIVE,
          plannedCheckInAt: new Date("2026-10-25T07:00:00Z"),
          plannedCheckOutAt: new Date(start.getTime() + 18000000),
          checkedInAt: new Date("2026-10-25T07:00:00Z"),
          checkedOutAt: null,
          room: { id: "room-101", roomNumber: "101" },
          occupants: [{ id: "occ-1" }, { id: "occ-2" }],
        },
        {
          id: "stay-checkout-pending",
          hotelId: "hotel-1",
          roomId: "room-102",
          reservationCode: "STAY-02",
          guestDisplayName: "Pending Checkout",
          guestPhone: "0922222222",
          status: GuestStayStatus.CHECKOUT_PENDING,
          plannedCheckInAt: new Date("2026-10-26T07:00:00Z"),
          plannedCheckOutAt: new Date(start.getTime() + 20000000),
          checkedInAt: new Date("2026-10-26T07:00:00Z"),
          checkedOutAt: null,
          room: { id: "room-102", roomNumber: "102" },
          occupants: [{ id: "occ-3" }],
        },
        {
          id: "stay-already-checked-out",
          hotelId: "hotel-1",
          roomId: "room-103",
          reservationCode: "STAY-03",
          guestDisplayName: "Completed Checkout Today",
          guestPhone: "0933333333",
          status: GuestStayStatus.CHECKED_OUT,
          plannedCheckInAt: new Date("2026-10-24T07:00:00Z"),
          plannedCheckOutAt: new Date(start.getTime() + 10000000),
          checkedInAt: new Date("2026-10-24T07:00:00Z"),
          checkedOutAt: new Date(start.getTime() + 11000000),
          room: { id: "room-103", roomNumber: "103" },
          occupants: [{ id: "occ-4" }],
        },
      ]);

      const req = mockUserRequest();
      const res = await controller.getDailyMovements(req, "hotel-1", {
        date: "2026-10-27",
        kind: "DEPARTURE",
      });

      expect(mockPrisma.guestStay.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { hotelId: "hotel-1" },
            {
              OR: [
                {
                  plannedCheckOutAt: { gte: start, lt: end },
                  status: {
                    in: [
                      GuestStayStatus.ACTIVE,
                      GuestStayStatus.CHECKED_IN,
                      GuestStayStatus.CHECKOUT_PENDING,
                    ],
                  },
                },
                {
                  checkedOutAt: { gte: start, lt: end },
                },
              ],
            },
          ]),
        }),
      });

      expect(res.items).toHaveLength(3);

      // Active stay: canCheckOut is true
      expect(res.items[0]).toMatchObject({
        kind: "DEPARTURE",
        stayId: "stay-active",
        reservationId: null,
        reservationCode: "STAY-01",
        roomNumber: "101",
        occupantCount: 2,
        canCheckIn: false,
        canCheckOut: true,
      });

      // Checkout pending stay: canCheckOut is true
      expect(res.items[1]).toMatchObject({
        kind: "DEPARTURE",
        stayId: "stay-checkout-pending",
        roomNumber: "102",
        occupantCount: 1,
        canCheckIn: false,
        canCheckOut: true,
      });

      // Checked out stay: canCheckOut is false
      expect(res.items[2]).toMatchObject({
        kind: "DEPARTURE",
        stayId: "stay-already-checked-out",
        roomNumber: "103",
        occupantCount: 1,
        canCheckIn: false,
        canCheckOut: false,
      });
    });
  });

  describe("Search Filtering", () => {
    it("should search ARRIVAL by guest name, phone, reservation code, group code, room number", async () => {
      mockPrisma.room.findMany.mockResolvedValueOnce([{ id: "room-202" }]);
      mockPrisma.reservation.count.mockResolvedValueOnce(1);
      mockPrisma.reservation.findMany.mockResolvedValueOnce([
        {
          id: "res-found",
          hotelId: "hotel-1",
          roomId: "room-202",
          reservationCode: "RES-SEARCH",
          groupCode: null,
          guestDisplayName: "Searched Guest",
          guestPhone: "0912000000",
          status: ReservationStatus.CONFIRMED,
          plannedCheckInAt: new Date("2026-10-27T07:00:00Z"),
          plannedCheckOutAt: new Date("2026-10-28T05:00:00Z"),
          checkedInAt: null,
        },
      ]);

      const req = mockUserRequest();
      const res = await controller.getDailyMovements(req, "hotel-1", {
        date: "2026-10-27",
        kind: "ARRIVAL",
        q: "202",
      });

      expect(mockPrisma.room.findMany).toHaveBeenCalledWith({
        where: {
          hotelId: "hotel-1",
          roomNumber: { contains: "202", mode: "insensitive" },
        },
        select: { id: true },
      });

      expect(mockPrisma.reservation.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: expect.arrayContaining([
                { guestDisplayName: { contains: "202", mode: "insensitive" } },
                { guestPhone: { contains: "202", mode: "insensitive" } },
                { reservationCode: { contains: "202", mode: "insensitive" } },
                { groupCode: { contains: "202", mode: "insensitive" } },
                { roomId: { in: ["room-202"] } },
              ]),
            },
          ]),
        }),
      });

      expect(res.items).toHaveLength(1);
    });

    it("should search DEPARTURE by guest name, phone, reservation code, room number", async () => {
      mockPrisma.guestStay.count.mockResolvedValueOnce(1);
      mockPrisma.guestStay.findMany.mockResolvedValueOnce([
        {
          id: "stay-found",
          hotelId: "hotel-1",
          roomId: "room-303",
          reservationCode: "RES-303",
          guestDisplayName: "Departing Guest",
          guestPhone: "0999999999",
          status: GuestStayStatus.ACTIVE,
          plannedCheckInAt: new Date("2026-10-25T07:00:00Z"),
          plannedCheckOutAt: new Date("2026-10-27T05:00:00Z"),
          checkedInAt: new Date("2026-10-25T07:00:00Z"),
          checkedOutAt: null,
          room: { id: "room-303", roomNumber: "303" },
          occupants: [],
        },
      ]);

      const req = mockUserRequest();
      const res = await controller.getDailyMovements(req, "hotel-1", {
        date: "2026-10-27",
        kind: "DEPARTURE",
        q: "Departing",
      });

      expect(mockPrisma.guestStay.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: expect.arrayContaining([
                { guestDisplayName: { contains: "Departing", mode: "insensitive" } },
                { guestPhone: { contains: "Departing", mode: "insensitive" } },
                { reservationCode: { contains: "Departing", mode: "insensitive" } },
                { room: { roomNumber: { contains: "Departing", mode: "insensitive" } } },
              ]),
            },
          ]),
        }),
      });

      expect(res.items).toHaveLength(1);
    });
  });

  describe("Invariants: No Provider Calls or DB Mutations", () => {
    it("should never call KBTT provider client or perform write operations", async () => {
      mockPrisma.reservation.count.mockResolvedValueOnce(0);
      mockPrisma.reservation.findMany.mockResolvedValueOnce([]);

      const req = mockUserRequest();
      await controller.getDailyMovements(req, "hotel-1", {
        date: "2026-10-27",
        kind: "ARRIVAL",
      });

      expect(mockProvider.invoke).not.toHaveBeenCalled();
      expect(mockProvider.revoke).not.toHaveBeenCalled();
      expect(mockPrisma.reservation.create).not.toHaveBeenCalled();
      expect(mockPrisma.reservation.update).not.toHaveBeenCalled();
      expect(mockPrisma.reservation.delete).not.toHaveBeenCalled();
      expect(mockPrisma.guestStay.create).not.toHaveBeenCalled();
      expect(mockPrisma.guestStay.update).not.toHaveBeenCalled();
      expect(mockPrisma.guestStay.delete).not.toHaveBeenCalled();
    });
  });
});
