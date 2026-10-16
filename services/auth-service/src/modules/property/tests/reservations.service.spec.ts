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
  });
});
