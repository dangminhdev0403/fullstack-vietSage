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

import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ReservationsService } from "../application/reservations.service";

function createRepository(overrides: Record<string, jest.Mock> = {}) {
  return {
    createReservation: jest.fn().mockResolvedValue({
      id: "reservation-1",
      hotelId: "hotel-1",
      roomId: null,
      reservationCode: "VSH_RESERVATION_0001",
      guestDisplayName: "Nguyen Van A",
      status: "CONFIRMED",
    }),
    findReservationById: jest.fn().mockResolvedValue({
      id: "reservation-1",
      hotelId: "hotel-1",
      roomId: "room-1",
      status: "CONFIRMED",
    }),
    listArrivals: jest.fn().mockResolvedValue([1, [{ id: "reservation-1" }]]),
    assignRoom: jest.fn().mockResolvedValue({ id: "reservation-1", roomId: "room-1" }),
    checkInReservation: jest.fn().mockResolvedValue({
      idempotent: false,
      reservation: { id: "reservation-1", status: "CHECKED_IN" },
      stay: { id: "stay-1", status: "ACTIVE" },
      folio: { id: "folio-1", status: "OPEN" },
    }),
    createBulkReservations: jest.fn().mockResolvedValue({
      groupCode: "VSH_GROUP_0001",
      reservations: [],
    }),
    cancelReservation: jest.fn().mockResolvedValue({
      id: "reservation-1",
      hotelId: "hotel-1",
      roomId: null,
      status: "CANCELLED",
    }),
    markNoShow: jest.fn().mockResolvedValue({
      id: "reservation-1",
      hotelId: "hotel-1",
      roomId: null,
      status: "NO_SHOW",
    }),
    findReservationConfirmation: jest.fn().mockResolvedValue({
      id: "reservation-1",
      hotelId: "hotel-1",
      reservationCode: "VSH_RES_001",
      guestDisplayName: "Nguyen Van A",
      guestPhone: "0901234567",
      guestCount: 2,
      status: "CONFIRMED",
      plannedCheckInAt: new Date("2026-11-01T14:00:00.000Z"),
      plannedCheckOutAt: new Date("2026-11-03T12:00:00.000Z"),
      nightlyRateSnapshot: "1200000",
      notes: "Tang cao",
      createdAt: new Date("2026-10-27T08:00:00.000Z"),
      hotel: {
        id: "hotel-1",
        name: "Khach San Sai Gon",
        code: "SG01",
        timezone: "Asia/Ho_Chi_Minh",
        province: "TP. Hồ Chí Minh",
        area: "Quận 1",
        brandSettings: {
          address: "123 Le Loi, Q1, TP.HCM",
          phone: "028 1234 5678",
          email: "saigon@hotel.vn",
          logoUrl: "https://example.com/logo.png",
          checkInTime: "14:00",
          checkOutTime: "12:00",
        },
      },
      room: {
        id: "room-101",
        roomNumber: "101",
        floor: "1",
        price: "1200000",
      },
      roomType: {
        id: "rt-1",
        name: "Deluxe King",
        normalizedKey: "deluxe-king",
        basePrice: "1200000",
      },
      chargeLines: [],
      bookingPayments: [
        {
          id: "pay-1",
          status: "COMPLETED",
          receivedAmount: "1000000",
        },
      ],
    }),
    findGroupConfirmation: jest.fn().mockResolvedValue({
      hotel: {
        id: "hotel-1",
        name: "Khach San Sai Gon",
        code: "SG01",
        timezone: "Asia/Ho_Chi_Minh",
        brandSettings: {
          address: "123 Le Loi, Q1, TP.HCM",
        },
      },
      groupRecord: {
        groupCode: "GRP_TOUR_01",
        groupName: "Doan Du Lich Ha Noi",
        leadGuestName: "Tran Van B",
        leadGuestPhone: "0987654321",
        notes: "Can phong gan nhau",
        bookingPayments: [
          {
            id: "pay-group-1",
            status: "COMPLETED",
            receivedAmount: "2000000",
          },
        ],
      },
      reservations: [
        {
          id: "res-g-1",
          hotelId: "hotel-1",
          groupCode: "GRP_TOUR_01",
          reservationCode: "VSH_GRP_001",
          guestDisplayName: "Tran Van B",
          guestPhone: "0987654321",
          guestCount: 2,
          status: "CONFIRMED",
          plannedCheckInAt: new Date("2026-11-05T14:00:00.000Z"),
          plannedCheckOutAt: new Date("2026-11-07T12:00:00.000Z"),
          nightlyRateSnapshot: "1000000",
          room: { id: "room-101", roomNumber: "101", floor: "1", price: "1000000" },
          roomType: { id: "rt-1", name: "Standard", normalizedKey: "standard", basePrice: "1000000" },
          bookingPayments: [],
        },
        {
          id: "res-g-2",
          hotelId: "hotel-1",
          groupCode: "GRP_TOUR_01",
          reservationCode: "VSH_GRP_002",
          guestDisplayName: "Le Thi C",
          guestPhone: "0912345678",
          guestCount: 2,
          status: "CONFIRMED",
          plannedCheckInAt: new Date("2026-11-05T14:00:00.000Z"),
          plannedCheckOutAt: new Date("2026-11-07T12:00:00.000Z"),
          nightlyRateSnapshot: "1000000",
          room: { id: "room-102", roomNumber: "102", floor: "1", price: "1000000" },
          roomType: { id: "rt-1", name: "Standard", normalizedKey: "standard", basePrice: "1000000" },
          bookingPayments: [],
        },
      ],
    }),
    updateReservation: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function createService(repository = createRepository()) {
  const accessService = {
    assertHotelAccess: jest.fn().mockResolvedValue({
      id: "hotel-1",
      tenantId: "tenant-1",
      timezone: "Asia/Ho_Chi_Minh",
    }),
    resolveRoomScope: jest.fn().mockResolvedValue({
      hotel: { id: "hotel-1", tenantId: "tenant-1" },
      allowedRoomId: null,
    }),
    assertRoomAccess: jest.fn().mockResolvedValue({ id: "hotel-1", tenantId: "tenant-1" }),
  };
  const codesService = {
    generateEntityCode: jest
      .fn()
      .mockResolvedValueOnce("VSH_RESERVATION_0001")
      .mockResolvedValueOnce("VSH_FOLIO_0001"),
  };
  return {
    service: new ReservationsService(
      repository as never,
      codesService as never,
      accessService as never,
    ),
    repository,
  };
}

describe("ReservationsService front-desk lifecycle", () => {
  it("creates a confirmed reservation without assigning or changing a room", async () => {
    const { service, repository } = createService();

    await expect(
      service.createReservation("actor-1", "active-role", "hotel-1", {
        guestDisplayName: " Nguyen Van A ",
        guestPhone: " 0900000000 ",
        plannedCheckInAt: new Date("2026-08-01T07:00:00.000Z"),
        plannedCheckOutAt: new Date("2026-08-03T05:00:00.000Z"),
      }),
    ).resolves.toMatchObject({ status: "CONFIRMED", roomId: null });

    expect(repository.createReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        hotelId: "hotel-1",
        guestDisplayName: "Nguyen Van A",
        guestPhone: "0900000000",
        reservationCode: "VSH_RESERVATION_0001",
        bookingOwnerUserId: "actor-1",
      }),
    );
  });

  it("lists arrivals in hotel scope for an explicit business date", async () => {
    const { service, repository } = createService();
    const from = new Date("2026-08-01T00:00:00.000Z");
    const to = new Date("2026-08-02T00:00:00.000Z");

    await service.listArrivals("actor-1", "active-role", "hotel-1", {
      from,
      to,
      page: 1,
      limit: 20,
    });

    expect(repository.listArrivals).toHaveBeenCalledWith(
      expect.objectContaining({
        hotelId: "hotel-1",
        from: new Date("2026-07-31T17:00:00.000Z"),
        to: new Date("2026-08-01T17:00:00.000Z"),
        skip: 0,
        take: 20,
      }),
    );
  });

  it("assigns only an available non-overlapping room", async () => {
    const { service, repository } = createService();

    await service.assignRoom("actor-1", "active-role", "hotel-1", "reservation-1", {
      roomId: "room-1",
    });

    expect(repository.assignRoom).toHaveBeenCalledWith({
      hotelId: "hotel-1",
      reservationId: "reservation-1",
      roomId: "room-1",
      actorUserId: "actor-1",
    });
  });

  it("assigns room through injected allocation service when provided", async () => {
    const mockAllocation = { allocateRoom: jest.fn() };
    const repository = createRepository();
    const accessService = {
      assertHotelAccess: jest.fn().mockResolvedValue({ id: "hotel-1", tenantId: "tenant-1" }),
      resolveRoomScope: jest.fn().mockResolvedValue({ hotel: { id: "hotel-1" }, allowedRoomId: null }),
      assertRoomAccess: jest.fn().mockResolvedValue({ id: "hotel-1" }),
    };
    const codesService = { generateEntityCode: jest.fn() };
    const service = new ReservationsService(
      repository as never,
      codesService as never,
      accessService as never,
      undefined,
      mockAllocation as never,
    );

    await service.assignRoom("actor-1", "active-role", "hotel-1", "reservation-1", {
      roomId: "room-1",
      expectedUpdatedAt: "2026-08-01T10:00:00.000Z",
      expectedRoomId: "room-old",
    });

    expect(repository.assignRoom).toHaveBeenCalledWith({
      hotelId: "hotel-1",
      reservationId: "reservation-1",
      roomId: "room-1",
      actorUserId: "actor-1",
      expectedUpdatedAt: "2026-08-01T10:00:00.000Z",
      expectedRoomId: "room-old",
      roomAllocationService: mockAllocation,
    });
  });

  it("blocks checkIn when reservation is CANCELLED or NO_SHOW", async () => {
    const { service } = createService(
      createRepository({
        findReservationById: jest
          .fn()
          .mockResolvedValueOnce({
            id: "res-cancelled",
            hotelId: "hotel-1",
            status: "CANCELLED",
          })
          .mockResolvedValueOnce({
            id: "res-noshow",
            hotelId: "hotel-1",
            status: "NO_SHOW",
          }),
      }),
    );

    await expect(
      service.checkIn("actor-1", "active-role", "hotel-1", "res-cancelled"),
    ).rejects.toThrow(new ConflictException("Đặt phòng đã bị hủy hoặc báo vắng mặt"));

    await expect(
      service.checkIn("actor-1", "active-role", "hotel-1", "res-noshow"),
    ).rejects.toThrow(new ConflictException("Đặt phòng đã bị hủy hoặc báo vắng mặt"));
  });

  it("persists and returns roomTypeId, guestCount, and notes on reservation creation", async () => {
    const { service, repository } = createService();

    await service.createReservation("actor-1", "active-role", "hotel-1", {
      guestDisplayName: "Le Van C",
      plannedCheckInAt: new Date("2026-08-01T07:00:00.000Z"),
      plannedCheckOutAt: new Date("2026-08-03T05:00:00.000Z"),
      roomTypeId: "type-deluxe",
      guestCount: 2,
      notes: "Late arrival requested",
    });

    expect(repository.createReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        hotelId: "hotel-1",
        roomTypeId: "type-deluxe",
        guestCount: 2,
        notes: "Late arrival requested",
      }),
    );
  });

  it("maps missing reservation during assignment to 404", async () => {
    const { service } = createService(
      createRepository({ assignRoom: jest.fn().mockResolvedValue(null) }),
    );

    await expect(
      service.assignRoom("actor-1", "active-role", "hotel-1", "missing", { roomId: "room-1" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("maps unavailable or overlapping room assignment to 409", async () => {
    const { service } = createService(
      createRepository({
        assignRoom: jest.fn().mockRejectedValue(new ConflictException("ROOM_NOT_AVAILABLE")),
      }),
    );

    await expect(
      service.assignRoom("actor-1", "active-role", "hotel-1", "reservation-1", {
        roomId: "room-1",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("does not expose accessCodeHash or raw credential fields in check-in response", async () => {
    const repository = createRepository({
      checkInReservation: jest.fn().mockResolvedValue({
        idempotent: false,
        reservation: { id: "reservation-1", status: "CHECKED_IN" },
        stay: {
          id: "stay-1",
          status: "ACTIVE",
          accessCodeHash: "must-not-leak",
          accessCodeExpiresAt: new Date("2026-08-02T07:00:00.000Z"),
        },
        folio: { id: "folio-1", status: "OPEN" },
        roomQrCode: { id: "qr-1", status: "ACTIVE", publicCode: "must-not-leak" },
      }),
    });
    const { service } = createService(repository);

    const result = await service.checkIn("actor-1", "active-role", "hotel-1", "reservation-1");

    expect(result).toEqual({
      idempotent: false,
      accessCode: expect.any(String),
      reservation: { id: "reservation-1", status: "CHECKED_IN" },
      stay: { id: "stay-1", status: "ACTIVE" },
      folio: { id: "folio-1", status: "OPEN" },
      roomQrCode: { id: "qr-1", status: "ACTIVE" },
    });
    expect(JSON.stringify(result)).not.toContain("accessCodeHash");
    expect(JSON.stringify(result)).not.toContain("publicCode");
  });

  it("checks in transactionally and returns stay plus open folio", async () => {
    const { service, repository } = createService();

    await expect(
      service.checkIn("actor-1", "active-role", "hotel-1", "reservation-1"),
    ).resolves.toMatchObject({
      idempotent: false,
      reservation: { status: "CHECKED_IN" },
      stay: { status: "ACTIVE" },
      folio: { status: "OPEN" },
    });

    expect(repository.checkInReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        hotelId: "hotel-1",
        reservationId: "reservation-1",
        actorUserId: "actor-1",
        timezone: "Asia/Ho_Chi_Minh",
      }),
    );
  });

  it("creates a confirmed reservation with optional roomId and explicit nightly rate snapshot", async () => {
    const { service, repository } = createService();

    await service.createReservation("actor-1", "active-role", "hotel-1", {
      guestDisplayName: "Tran Van B",
      plannedCheckInAt: new Date("2026-08-01T07:00:00.000Z"),
      plannedCheckOutAt: new Date("2026-08-03T05:00:00.000Z"),
      roomId: "room-1",
      rate: 1500000,
    });

    expect(repository.createReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        hotelId: "hotel-1",
        roomId: "room-1",
        nightlyRateSnapshot: "1500000.00",
      }),
    );
  });

  it("preserves 0 as free reservation nightly rate snapshot", async () => {
    const { service, repository } = createService();

    await service.createReservation("actor-1", "active-role", "hotel-1", {
      guestDisplayName: "Tran Van Free",
      plannedCheckInAt: new Date("2026-08-01T07:00:00.000Z"),
      plannedCheckOutAt: new Date("2026-08-03T05:00:00.000Z"),
      rate: 0,
    });

    expect(repository.createReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        nightlyRateSnapshot: "0.00",
      }),
    );
  });

  it("maps early check-in conflict from repository to 409", async () => {
    const { service } = createService(
      createRepository({
        checkInReservation: jest
          .fn()
          .mockRejectedValue(new ConflictException("EARLY_CHECK_IN_NOT_ALLOWED")),
      }),
    );

    await expect(
      service.checkIn("actor-1", "active-role", "hotel-1", "reservation-1"),
    ).rejects.toThrow(new ConflictException("EARLY_CHECK_IN_NOT_ALLOWED"));
  });

  describe("createBulkReservations group booking", () => {
    it("creates bulk reservations sharing one groupCode and asserting access for all rooms", async () => {
      const mockResult = {
        groupCode: "VSH_GROUP_0001",
        reservations: [
          {
            id: "res-1",
            hotelId: "hotel-1",
            roomId: "room-1",
            reservationCode: "VSH_RESERVATION_0001",
            groupCode: "VSH_GROUP_0001",
            guestDisplayName: "Doan Du Lich Viet",
            status: "ARRIVAL_READY",
          },
          {
            id: "res-2",
            hotelId: "hotel-1",
            roomId: "room-2",
            reservationCode: "VSH_RESERVATION_0002",
            groupCode: "VSH_GROUP_0001",
            guestDisplayName: "Doan Du Lich Viet",
            status: "ARRIVAL_READY",
          },
        ],
      };
      const repo = createRepository({
        createBulkReservations: jest.fn().mockResolvedValue(mockResult),
      });
      const { service } = createService(repo);

      const result = await service.createBulkReservations("actor-1", "active-role", "hotel-1", {
        leadGuestName: " Doan Du Lich Viet ",
        leadGuestPhone: " 0912345678 ",
        checkInDate: new Date("2026-09-01T14:00:00.000Z"),
        checkOutDate: new Date("2026-09-04T12:00:00.000Z"),
        roomIds: ["room-1", "room-2"],
        rate: 1200000,
      });

      expect(result).toEqual(mockResult);
      expect(repo.createBulkReservations).toHaveBeenCalledWith(
        expect.objectContaining({
          hotelId: "hotel-1",
          groupCode: expect.any(String),
          leadGuestName: "Doan Du Lich Viet",
          leadGuestPhone: "0912345678",
          roomIds: ["room-1", "room-2"],
          createdByUserId: "actor-1",
          bookingOwnerUserId: "actor-1",
          nightlyRateSnapshot: "1200000.00",
        }),
      );
    });

    it("uses provided groupCode when explicitly passed in input", async () => {
      const repo = createRepository({
        createBulkReservations: jest.fn().mockResolvedValue({
          groupCode: "CUSTOM_GRP_999",
          reservations: [],
        }),
      });
      const { service } = createService(repo);

      await service.createBulkReservations("actor-1", "active-role", "hotel-1", {
        leadGuestName: "Doan Hop Tac",
        checkInDate: new Date("2026-09-01T14:00:00.000Z"),
        checkOutDate: new Date("2026-09-04T12:00:00.000Z"),
        roomIds: ["room-1", "room-2"],
        groupCode: "CUSTOM_GRP_999",
      });

      expect(repo.createBulkReservations).toHaveBeenCalledWith(
        expect.objectContaining({
          groupCode: "CUSTOM_GRP_999",
        }),
      );
    });

    it("passes custom roomRates per room when specified in group booking", async () => {
      const repo = createRepository({
        createBulkReservations: jest.fn().mockResolvedValue({
          groupCode: "CUSTOM_GRP_1",
          reservations: [],
        }),
      });
      const { service } = createService(repo);

      await service.createBulkReservations("actor-1", "active-role", "hotel-1", {
        leadGuestName: "Doan Du Lich",
        checkInDate: new Date("2026-09-01T14:00:00.000Z"),
        checkOutDate: new Date("2026-09-04T12:00:00.000Z"),
        roomIds: ["room-1", "room-2"],
        roomRates: {
          "room-1": 800000,
          "room-2": 950000,
        },
      });

      expect(repo.createBulkReservations).toHaveBeenCalledWith(
        expect.objectContaining({
          roomRates: {
            "room-1": 800000,
            "room-2": 950000,
          },
        }),
      );
    });
  });

  describe("cancelReservation", () => {
    it("cancels a confirmed reservation successfully and releases assigned room", async () => {
      const { service, repository } = createService();

      const result = await service.cancelReservation("actor-1", "active-role", "hotel-1", "reservation-1", {
        reason: "Khách đổi lịch",
      });

      expect(repository.cancelReservation).toHaveBeenCalledWith({
        hotelId: "hotel-1",
        tenantId: "tenant-1",
        reservationId: "reservation-1",
        actorUserId: "actor-1",
        reason: "Khách đổi lịch",
      });
      expect(result).toMatchObject({
        status: "CANCELLED",
        roomId: null,
      });
    });

    it("cancels an arrival_ready reservation successfully and releases room", async () => {
      const { service, repository } = createService(
        createRepository({
          findReservationById: jest.fn().mockResolvedValue({
            id: "reservation-1",
            hotelId: "hotel-1",
            roomId: "room-1",
            status: "ARRIVAL_READY",
          }),
        }),
      );

      const result = await service.cancelReservation("actor-1", "active-role", "hotel-1", "reservation-1", {});

      expect(repository.cancelReservation).toHaveBeenCalledWith(
        expect.objectContaining({
          reservationId: "reservation-1",
        }),
      );
      expect(result).toMatchObject({
        status: "CANCELLED",
        roomId: null,
      });
    });

    it("rejects when reservation is already CHECKED_IN with 409 ConflictException", async () => {
      const { service } = createService(
        createRepository({
          findReservationById: jest.fn().mockResolvedValue({
            id: "reservation-1",
            hotelId: "hotel-1",
            roomId: "room-1",
            status: "CHECKED_IN",
          }),
        }),
      );

      await expect(
        service.cancelReservation("actor-1", "active-role", "hotel-1", "reservation-1", {}),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("rejects when reservation is already CANCELLED with 409 ConflictException", async () => {
      const { service } = createService(
        createRepository({
          findReservationById: jest.fn().mockResolvedValue({
            id: "reservation-1",
            hotelId: "hotel-1",
            roomId: null,
            status: "CANCELLED",
          }),
        }),
      );

      await expect(
        service.cancelReservation("actor-1", "active-role", "hotel-1", "reservation-1", {}),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("rejects when reservation is already NO_SHOW with 409 ConflictException", async () => {
      const { service } = createService(
        createRepository({
          findReservationById: jest.fn().mockResolvedValue({
            id: "reservation-1",
            hotelId: "hotel-1",
            roomId: null,
            status: "NO_SHOW",
          }),
        }),
      );

      await expect(
        service.cancelReservation("actor-1", "active-role", "hotel-1", "reservation-1", {}),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("throws NotFoundException when reservation does not exist", async () => {
      const { service } = createService(
        createRepository({
          findReservationById: jest.fn().mockResolvedValue(null),
        }),
      );

      await expect(
        service.cancelReservation("actor-1", "active-role", "hotel-1", "missing-res", {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("markNoShow", () => {
    it("marks a confirmed reservation as no-show successfully and releases assigned room", async () => {
      const { service, repository } = createService();

      const result = await service.markNoShow("actor-1", "active-role", "hotel-1", "reservation-1", {
        reason: "Khách không đến nhận phòng",
      });

      expect(repository.markNoShow).toHaveBeenCalledWith({
        hotelId: "hotel-1",
        tenantId: "tenant-1",
        reservationId: "reservation-1",
        actorUserId: "actor-1",
        reason: "Khách không đến nhận phòng",
      });
      expect(result).toMatchObject({
        status: "NO_SHOW",
        roomId: null,
      });
    });

    it("marks an arrival_ready reservation as no-show successfully and releases room", async () => {
      const { service, repository } = createService(
        createRepository({
          findReservationById: jest.fn().mockResolvedValue({
            id: "reservation-1",
            hotelId: "hotel-1",
            roomId: "room-1",
            status: "ARRIVAL_READY",
          }),
        }),
      );

      const result = await service.markNoShow("actor-1", "active-role", "hotel-1", "reservation-1", {});

      expect(repository.markNoShow).toHaveBeenCalledWith(
        expect.objectContaining({
          reservationId: "reservation-1",
        }),
      );
      expect(result).toMatchObject({
        status: "NO_SHOW",
        roomId: null,
      });
    });

    it("rejects when reservation is already CHECKED_IN with 409 ConflictException", async () => {
      const { service } = createService(
        createRepository({
          findReservationById: jest.fn().mockResolvedValue({
            id: "reservation-1",
            hotelId: "hotel-1",
            roomId: "room-1",
            status: "CHECKED_IN",
          }),
        }),
      );

      await expect(
        service.markNoShow("actor-1", "active-role", "hotel-1", "reservation-1", {}),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("rejects when reservation is already CANCELLED with 409 ConflictException", async () => {
      const { service } = createService(
        createRepository({
          findReservationById: jest.fn().mockResolvedValue({
            id: "reservation-1",
            hotelId: "hotel-1",
            roomId: null,
            status: "CANCELLED",
          }),
        }),
      );

      await expect(
        service.markNoShow("actor-1", "active-role", "hotel-1", "reservation-1", {}),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("rejects when reservation is already NO_SHOW with 409 ConflictException", async () => {
      const { service } = createService(
        createRepository({
          findReservationById: jest.fn().mockResolvedValue({
            id: "reservation-1",
            hotelId: "hotel-1",
            roomId: null,
            status: "NO_SHOW",
          }),
        }),
      );

      await expect(
        service.markNoShow("actor-1", "active-role", "hotel-1", "reservation-1", {}),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("throws NotFoundException when reservation does not exist", async () => {
      const { service } = createService(
        createRepository({
          findReservationById: jest.fn().mockResolvedValue(null),
        }),
      );

      await expect(
        service.markNoShow("actor-1", "active-role", "hotel-1", "missing-res", {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("Confirmation Projections (Lane C)", () => {
    it("returns an accurate individual reservation confirmation projection", async () => {
      const { service } = createService();

      const result = await service.getReservationConfirmation(
        "actor-1",
        "active-role",
        "hotel-1",
        "reservation-1",
      );

      // Hotel projection
      expect(result.hotel).toMatchObject({
        id: "hotel-1",
        name: "Khach San Sai Gon",
        code: "SG01",
        address: "123 Le Loi, Q1, TP.HCM",
        phone: "028 1234 5678",
        email: "saigon@hotel.vn",
        checkInTimePolicy: "14:00",
        checkOutTimePolicy: "12:00",
      });

      // Reservation projection
      expect(result.reservation).toMatchObject({
        id: "reservation-1",
        reservationCode: "VSH_RES_001",
        guestDisplayName: "Nguyen Van A",
        guestPhone: "0901234567",
        guestCount: 2,
        status: "CONFIRMED",
        nights: 2,
        notes: "Tang cao",
        room: {
          id: "room-101",
          roomNumber: "101",
          floor: "1",
        },
        roomType: {
          id: "rt-1",
          name: "Deluxe King",
          code: "deluxe-king",
        },
      });

      // Pricing projection: 2 nights x 1,200,000 = 2,400,000; paid: 1,000,000; balance: 1,400,000
      expect(result.pricing).toMatchObject({
        roomSubtotal: 2400000,
        totalAmount: 2400000,
        paidAmount: 1000000,
        balanceAmount: 1400000,
        currency: "VND",
      });
      expect(result.pricing.nightlyBreakdown).toHaveLength(2);
      expect(result.pricing.nightlyBreakdown[0]).toMatchObject({
        date: "2026-11-01",
        rate: 1200000,
        lineType: "ROOM_NIGHT",
      });
      expect(result.pricing.nightlyBreakdown[1]).toMatchObject({
        date: "2026-11-02",
        rate: 1200000,
        lineType: "ROOM_NIGHT",
      });

      // Policies
      expect(result.policies).toMatchObject({
        checkInTime: "14:00",
        checkOutTime: "12:00",
      });
      expect(result.policies.terms.length).toBeGreaterThan(0);
    });

    it("projects custom chargeLines when present on reservation", async () => {
      const { service } = createService(
        createRepository({
          findReservationConfirmation: jest.fn().mockResolvedValue({
            id: "reservation-2",
            hotelId: "hotel-1",
            reservationCode: "VSH_RES_002",
            guestDisplayName: "Le Thi C",
            plannedCheckInAt: new Date("2026-11-01T14:00:00.000Z"),
            plannedCheckOutAt: new Date("2026-11-03T12:00:00.000Z"),
            status: "CONFIRMED",
            hotel: {
              id: "hotel-1",
              name: "Hotel Test",
              code: "HT01",
              timezone: "Asia/Ho_Chi_Minh",
            },
            chargeLines: [
              {
                id: "line-1",
                lineType: "ROOM_NIGHT",
                serviceDate: new Date("2026-11-01T00:00:00.000Z"),
                nameSnapshot: "Đêm 1 - Ưu đãi",
                unitPriceSnapshot: "900000",
                totalSnapshot: "900000",
                taxAmountSnapshot: "90000",
              },
              {
                id: "line-2",
                lineType: "ROOM_NIGHT",
                serviceDate: new Date("2026-11-02T00:00:00.000Z"),
                nameSnapshot: "Đêm 2 - Cuối tuần",
                unitPriceSnapshot: "1100000",
                totalSnapshot: "1100000",
                taxAmountSnapshot: "110000",
              },
              {
                id: "line-3",
                lineType: "EXTRA",
                nameSnapshot: "Đón sân bay",
                totalSnapshot: "350000",
                taxAmountSnapshot: "35000",
              },
            ],
            bookingPayments: [
              { id: "p1", status: "COMPLETED", receivedAmount: "1500000" },
            ],
          }),
        }),
      );

      const result = await service.getReservationConfirmation(
        "actor-1",
        "active-role",
        "hotel-1",
        "reservation-2",
      );

      expect(result.pricing.roomSubtotal).toBe(2000000);
      expect(result.pricing.serviceAmount).toBe(350000);
      expect(result.pricing.taxAmount).toBe(235000);
      expect(result.pricing.totalAmount).toBe(2585000);
      expect(result.pricing.paidAmount).toBe(1500000);
      expect(result.pricing.balanceAmount).toBe(1085000);
    });

    it("rejects cross-hotel access when reservation does not belong to hotelId", async () => {
      const { service } = createService(
        createRepository({
          findReservationConfirmation: jest
            .fn()
            .mockRejectedValue(new NotFoundException("Đặt phòng không thuộc khách sạn này")),
        }),
      );

      await expect(
        service.getReservationConfirmation("actor-1", "active-role", "hotel-cross", "reservation-1"),
      ).rejects.toThrow("Đặt phòng không thuộc khách sạn này");
    });

    it("returns accurate group confirmation projection with all rooms and totals", async () => {
      const { service } = createService();

      const result = await service.getGroupConfirmation(
        "actor-1",
        "active-role",
        "hotel-1",
        "GRP_TOUR_01",
      );

      // Group info
      expect(result.group).toMatchObject({
        groupCode: "GRP_TOUR_01",
        groupName: "Doan Du Lich Ha Noi",
        leadGuestName: "Tran Van B",
        leadGuestPhone: "0987654321",
        totalRooms: 2,
        nights: 2,
      });

      // Rooms list
      expect(result.rooms).toHaveLength(2);
      expect(result.rooms[0]).toMatchObject({
        reservationCode: "VSH_GRP_001",
        guestDisplayName: "Tran Van B",
        roomNumber: "P.101",
        nights: 2,
        nightlyRate: 1000000,
        roomSubtotal: 2000000,
      });
      expect(result.rooms[1]).toMatchObject({
        reservationCode: "VSH_GRP_002",
        guestDisplayName: "Le Thi C",
        roomNumber: "P.102",
        nights: 2,
        nightlyRate: 1000000,
        roomSubtotal: 2000000,
      });

      // Pricing: 2 rooms x 2,000,000 = 4,000,000; paid = 2,000,000 (group payment); balance = 2,000,000
      expect(result.pricing).toMatchObject({
        totalRooms: 2,
        totalGuests: 4,
        roomSubtotal: 4000000,
        totalAmount: 4000000,
        paidAmount: 2000000,
        balanceAmount: 2000000,
        currency: "VND",
      });
    });

    it("reconciles group confirmation with nightly overrides, extra services, and room categories (QA Case B & C)", async () => {
      const { service } = createService(
        createRepository({
          findGroupConfirmation: jest.fn().mockResolvedValue({
            hotel: {
              id: "hotel-1",
              name: "Khách sạn minh 123",
              code: "HT123",
              timezone: "Asia/Ho_Chi_Minh",
            },
            groupRecord: {
              groupCode: "VSH_GROUP_0015",
              groupName: "QA GROUP AUTO 3010 B",
              leadGuestName: "Nguyễn Minh Anh",
              leadGuestPhone: "0901234567",
              bookingPayments: [],
            },
            reservations: [
              {
                id: "res-b-1",
                hotelId: "hotel-1",
                groupCode: "VSH_GROUP_0015",
                reservationCode: "VSH_RESERVATION_0104",
                guestDisplayName: "Nguyễn Minh Anh",
                status: "CONFIRMED",
                plannedCheckInAt: new Date("2026-10-31T14:00:00.000Z"),
                plannedCheckOutAt: new Date("2026-11-02T12:00:00.000Z"),
                room: { id: "room-1003", roomNumber: "1003", floor: "10", price: "850000" },
                roomType: { id: "rt-single", name: "Single Room", normalizedKey: "single" },
                chargeLines: [
                  {
                    id: "cl-1",
                    lineType: "ROOM_NIGHT",
                    serviceDate: new Date("2026-10-31T00:00:00.000Z"),
                    nameSnapshot: "Tiền phòng đêm 31/10",
                    unitPriceSnapshot: "800000",
                    totalSnapshot: "800000",
                  },
                  {
                    id: "cl-2",
                    lineType: "ROOM_NIGHT",
                    serviceDate: new Date("2026-11-01T00:00:00.000Z"),
                    nameSnapshot: "Tiền phòng đêm 01/11",
                    unitPriceSnapshot: "1000000",
                    totalSnapshot: "1000000",
                  },
                  {
                    id: "cl-extra",
                    lineType: "EXTRA",
                    nameSnapshot: "Đưa đón sân bay",
                    quantity: 1,
                    unitPriceSnapshot: "250000",
                    totalSnapshot: "250000",
                  },
                ],
                bookingPayments: [],
              },
              {
                id: "res-b-2",
                hotelId: "hotel-1",
                groupCode: "VSH_GROUP_0015",
                reservationCode: "VSH_RESERVATION_0105",
                guestDisplayName: "Nguyễn Minh Anh",
                status: "CONFIRMED",
                plannedCheckInAt: new Date("2026-10-31T14:00:00.000Z"),
                plannedCheckOutAt: new Date("2026-11-02T12:00:00.000Z"),
                room: { id: "room-1004", roomNumber: "1004", floor: "10", price: "850000" },
                roomType: { id: "rt-single", name: "Single Room", normalizedKey: "single" },
                chargeLines: [
                  {
                    id: "cl-3",
                    lineType: "ROOM_NIGHT",
                    serviceDate: new Date("2026-10-31T00:00:00.000Z"),
                    nameSnapshot: "Tiền phòng đêm 31/10",
                    unitPriceSnapshot: "800000",
                    totalSnapshot: "800000",
                  },
                  {
                    id: "cl-4",
                    lineType: "ROOM_NIGHT",
                    serviceDate: new Date("2026-11-01T00:00:00.000Z"),
                    nameSnapshot: "Tiền phòng đêm 01/11",
                    unitPriceSnapshot: "1000000",
                    totalSnapshot: "1000000",
                  },
                ],
                bookingPayments: [],
              },
            ],
          }),
        }),
      );

      const result = await service.getGroupConfirmation(
        "actor-1",
        "active-role",
        "hotel-1",
        "VSH_GROUP_0015",
      );

      // Verify room categories preserved
      expect(result.rooms[0].roomTypeName).toBe("Single Room");
      expect(result.rooms[1].roomTypeName).toBe("Single Room");

      // Verify each room's subtotal from charge lines (800k + 1M = 1,800,000)
      expect(result.rooms[0].roomSubtotal).toBe(1800000);
      expect(result.rooms[1].roomSubtotal).toBe(1800000);

      // Verify group pricing: 2 rooms x 1,800,000 = 3,600,000 + 250,000 service = 3,850,000
      expect(result.pricing.roomSubtotal).toBe(3600000);
      expect(result.pricing.serviceAmount).toBe(250000);
      expect(result.pricing.serviceBreakdown).toHaveLength(1);
      expect(result.pricing.serviceBreakdown?.[0]).toMatchObject({
        name: "Đưa đón sân bay",
        quantity: 1,
        unitPrice: 250000,
        total: 250000,
      });
      expect(result.pricing.totalAmount).toBe(3850000);
      expect(result.pricing.balanceAmount).toBe(3850000);
    });

    it("sanitizes placeholder contact info in confirmation projection (UI-06)", async () => {
      const { service } = createService(
        createRepository({
          findReservationConfirmation: jest.fn().mockResolvedValue({
            id: "reservation-placeholder",
            hotelId: "hotel-1",
            reservationCode: "VSH_RES_PH",
            guestDisplayName: "Test Guest",
            plannedCheckInAt: new Date("2026-11-01T14:00:00.000Z"),
            plannedCheckOutAt: new Date("2026-11-02T12:00:00.000Z"),
            status: "CONFIRMED",
            hotel: {
              id: "hotel-1",
              name: "Hotel With Placeholders",
              code: "HWP01",
              timezone: "Asia/Ho_Chi_Minh",
              brandSettings: {
                phone: "Số điện thoại liên hệ",
                email: "Email liên hệ",
                address: "Địa chỉ khách sạn",
              },
            },
            chargeLines: [],
            bookingPayments: [],
          }),
        }),
      );

      const result = await service.getReservationConfirmation(
        "actor-1",
        "active-role",
        "hotel-1",
        "reservation-placeholder",
      );

      expect(result.hotel.phone).toBeNull();
      expect(result.hotel.email).toBeNull();
    });

    it("rejects cross-hotel access when group does not belong to hotelId", async () => {
      const { service } = createService(
        createRepository({
          findGroupConfirmation: jest
            .fn()
            .mockRejectedValue(new NotFoundException("Đoàn đặt phòng không thuộc khách sạn này")),
        }),
      );

      await expect(
        service.getGroupConfirmation("actor-1", "active-role", "hotel-cross", "GRP_TOUR_01"),
      ).rejects.toThrow("Đoàn đặt phòng không thuộc khách sạn này");
    });
  });

  describe("updateReservation and getReservation lifecycle", () => {
    it("updates reservation guest info, room, dates, and rate", async () => {
      const mockUpdated = {
        id: "reservation-1",
        hotelId: "hotel-1",
        guestDisplayName: "Tran Thi B",
        guestPhone: "0908888888",
        guestCount: 2,
        notes: "Yeu cau phong yen tinh",
        roomId: "room-2",
        status: "ARRIVAL_READY",
      };
      const repo = createRepository({
        updateReservation: jest.fn().mockResolvedValue(mockUpdated),
      });
      const { service } = createService(repo);

      const result = await service.updateReservation(
        "actor-1",
        "active-role",
        "hotel-1",
        "reservation-1",
        {
          guestDisplayName: "Tran Thi B",
          guestPhone: "0908888888",
          guestCount: 2,
          notes: "Yeu cau phong yen tinh",
          roomId: "room-2",
        },
      );

      expect(result).toEqual(mockUpdated);
      expect(repo.updateReservation).toHaveBeenCalledWith(
        expect.objectContaining({
          hotelId: "hotel-1",
          reservationId: "reservation-1",
          guestDisplayName: "Tran Thi B",
          guestPhone: "0908888888",
          guestCount: 2,
          notes: "Yeu cau phong yen tinh",
          roomId: "room-2",
        }),
      );
    });

    it("retrieves full reservation details by id", async () => {
      const mockRes = {
        id: "reservation-1",
        hotelId: "hotel-1",
        guestDisplayName: "Nguyen Van A",
        room: { roomNumber: "101" },
        chargeLines: [],
      };
      const repo = createRepository({
        findReservationById: jest.fn().mockResolvedValue(mockRes),
      });
      const { service } = createService(repo);

      const result = await service.getReservation(
        "actor-1",
        "active-role",
        "hotel-1",
        "reservation-1",
      );

      expect(result).toEqual(mockRes);
      expect(repo.findReservationById).toHaveBeenCalledWith("hotel-1", "reservation-1");
    });

    it("throws NotFoundException when reservation is not found", async () => {
      const repo = createRepository({
        findReservationById: jest.fn().mockResolvedValue(null),
      });
      const { service } = createService(repo);

      await expect(
        service.getReservation("actor-1", "active-role", "hotel-1", "res-nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
