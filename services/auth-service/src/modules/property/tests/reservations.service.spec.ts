import { ConflictException, NotFoundException } from "@nestjs/common";
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
    listArrivals: jest.fn().mockResolvedValue([1, [{ id: "reservation-1" }]]),
    assignRoom: jest.fn().mockResolvedValue({ id: "reservation-1", roomId: "room-1" }),
    checkInReservation: jest.fn().mockResolvedValue({
      idempotent: false,
      reservation: { id: "reservation-1", status: "CHECKED_IN" },
      stay: { id: "stay-1", status: "ACTIVE" },
      folio: { id: "folio-1", status: "OPEN" },
    }),
    ...overrides,
  };
}

function createService(repository = createRepository()) {
  const accessService = {
    assertHotelAccess: jest.fn().mockResolvedValue({ id: "hotel-1", tenantId: "tenant-1" }),
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
      expect.objectContaining({ hotelId: "hotel-1", from, to, skip: 0, take: 20 }),
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
      }),
    );
  });
});
