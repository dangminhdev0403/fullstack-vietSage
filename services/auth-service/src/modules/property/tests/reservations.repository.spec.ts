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
import { GuestStayStatus, Prisma, ReservationStatus, RoomStatus } from "@prisma/client";
import { ReservationsRepository } from "../infrastructure/repositories/reservations.repository";

function createRepository(tx: Record<string, unknown>) {
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return { repository: new ReservationsRepository(prisma as never), prisma };
}

describe("ReservationsRepository arrival reads", () => {
  it("runs count and list without an interactive transaction", async () => {
    const items = [{ id: "reservation-1" }];
    const prisma = {
      reservation: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue(items),
      },
    };
    const repository = new ReservationsRepository(prisma as never);

    await expect(
      repository.listArrivals({
        hotelId: "hotel-1",
        from: new Date("2026-09-19T00:00:00.000Z"),
        to: new Date("2026-09-20T00:00:00.000Z"),
        skip: 0,
        take: 100,
      }),
    ).resolves.toEqual([1, items]);

    expect(prisma.reservation.count).toHaveBeenCalledTimes(1);
    expect(prisma.reservation.findMany).toHaveBeenCalledTimes(1);
  });

  it("searches arrivals by guest, phone, reservation code, or room number", async () => {
    const prisma = {
      reservation: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const repository = new ReservationsRepository(prisma as never);

    await repository.listArrivals({
      hotelId: "hotel-1",
      from: new Date("2026-09-19T00:00:00.000Z"),
      to: new Date("2026-09-20T00:00:00.000Z"),
      q: " Minh ",
      skip: 0,
      take: 20,
    });

    expect(prisma.reservation.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: [
          { guestDisplayName: { contains: "Minh", mode: "insensitive" } },
          { guestPhone: { contains: "Minh" } },
          { reservationCode: { contains: "Minh", mode: "insensitive" } },
          { room: { roomNumber: { contains: "Minh", mode: "insensitive" } } },
        ],
      }),
    });
  });
});

describe("ReservationsRepository transactional lifecycle", () => {
  it("rejects an overlapping active reservation without mutating the room", async () => {
    const reservation = {
      id: "reservation-1",
      hotelId: "hotel-1",
      roomId: null,
      status: ReservationStatus.CONFIRMED,
      plannedCheckInAt: new Date("2026-08-01T07:00:00.000Z"),
      plannedCheckOutAt: new Date("2026-08-03T05:00:00.000Z"),
    };
    const tx = {
      $queryRawUnsafe: jest.fn(),
      reservation: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(reservation)
          .mockResolvedValueOnce({ id: "reservation-overlap" }),
        update: jest.fn(),
      },
      room: {
        findFirst: jest.fn().mockResolvedValue({ id: "room-1", status: RoomStatus.AVAILABLE }),
      },
    };
    const { repository } = createRepository(tx);

    await expect(
      repository.assignRoom({
        hotelId: "hotel-1",
        reservationId: "reservation-1",
        roomId: "room-1",
        actorUserId: "actor-1",
      }),
    ).rejects.toThrow(new ConflictException("ROOM_RESERVATION_OVERLAP"));

    expect(tx.reservation.update).not.toHaveBeenCalled();
  });

  it("checks in once by creating ACTIVE stay, OPEN folio and occupying the room atomically", async () => {
    const reservation = {
      id: "reservation-1",
      hotelId: "hotel-1",
      roomId: "room-1",
      reservationCode: "VSH_RESERVATION_0001",
      guestDisplayName: "Nguyen Van A",
      guestPhone: "0900000000",
      status: ReservationStatus.ARRIVAL_READY,
      plannedCheckInAt: new Date("2026-08-01T07:00:00.000Z"),
      plannedCheckOutAt: new Date("2026-08-03T05:00:00.000Z"),
    };
    const stay = { id: "stay-1", status: "ACTIVE" };
    const folio = { id: "folio-1", status: "OPEN" };
    const checkedInReservation = { ...reservation, status: ReservationStatus.CHECKED_IN };
    const tx = {
      $queryRawUnsafe: jest.fn(),
      reservation: {
        findFirst: jest.fn().mockResolvedValue(reservation),
        update: jest.fn().mockResolvedValue(checkedInReservation),
      },
      room: {
        findFirst: jest.fn().mockResolvedValue({ id: "room-1", status: RoomStatus.AVAILABLE }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      guestStay: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(stay),
        findUnique: jest.fn(),
      },
      folio: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(folio),
        findFirst: jest.fn(),
      },
      roomQRCode: {
        findFirst: jest.fn().mockResolvedValue({ id: "qr-1", version: 1 }),
        updateMany: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: "qr-1", status: "ACTIVE" }),
      },
      domainEvent: { create: jest.fn() },
    };
    const { repository } = createRepository(tx);

    await expect(
      repository.checkInReservation({
        hotelId: "hotel-1",
        tenantId: "tenant-1",
        reservationId: "reservation-1",
        actorUserId: "actor-1",
        accessCodeHash: "access-hash",
        accessCodeExpiresAt: new Date("2026-08-02T07:00:00.000Z"),
        generateFolioNumber: jest.fn().mockResolvedValue("VSH_FOLIO_0001"),
      }),
    ).resolves.toEqual({
      idempotent: false,
      reservation: checkedInReservation,
      stay,
      folio,
      roomQrCode: { id: "qr-1", status: "ACTIVE" },
    });

    expect(tx.room.updateMany).toHaveBeenCalledWith({
      where: { id: "room-1", hotelId: "hotel-1", status: RoomStatus.AVAILABLE },
      data: { status: RoomStatus.OCCUPIED },
    });
    expect(tx.guestStay.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reservationId: "reservation-1",
        status: "ACTIVE",
        roomId: "room-1",
      }),
    });
    expect(tx.folio.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stayId: "stay-1",
        status: "OPEN",
        folioNumber: "VSH_FOLIO_0001",
      }),
    });
    expect(tx.roomQRCode.update).toHaveBeenCalledWith({
      where: { id: "qr-1" },
      data: {
        status: "ACTIVE",
        activatedAt: expect.any(Date),
        deactivatedAt: null,
        expiresAt: null,
      },
    });
  });

  it("rejects check-in when an active stay or blocking folio already owns the room", async () => {
    const reservation = {
      id: "reservation-1",
      hotelId: "hotel-1",
      roomId: "room-1",
      status: ReservationStatus.ARRIVAL_READY,
    };
    const tx = {
      $queryRawUnsafe: jest.fn(),
      reservation: { findFirst: jest.fn().mockResolvedValue(reservation) },
      room: {
        findFirst: jest.fn().mockResolvedValue({ id: "room-1", status: RoomStatus.AVAILABLE }),
        updateMany: jest.fn(),
      },
      guestStay: { count: jest.fn().mockResolvedValue(1), create: jest.fn() },
      folio: { count: jest.fn().mockResolvedValue(0), create: jest.fn() },
    };
    const { repository } = createRepository(tx);

    await expect(
      repository.checkInReservation({
        hotelId: "hotel-1",
        tenantId: "tenant-1",
        reservationId: "reservation-1",
        actorUserId: "actor-1",
        accessCodeHash: "access-hash",
        accessCodeExpiresAt: new Date("2026-08-02T07:00:00.000Z"),
        generateFolioNumber: jest.fn(),
      }),
    ).rejects.toThrow(new ConflictException("ROOM_ALREADY_HAS_ACTIVE_STAY_OR_FOLIO"));
    expect(tx.room.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a room without an inactive or active QR before creating a stay", async () => {
    const reservation = {
      id: "reservation-1",
      hotelId: "hotel-1",
      roomId: "room-1",
      status: ReservationStatus.ARRIVAL_READY,
    };
    const tx = {
      $queryRawUnsafe: jest.fn(),
      reservation: { findFirst: jest.fn().mockResolvedValue(reservation) },
      room: {
        findFirst: jest.fn().mockResolvedValue({ id: "room-1", status: RoomStatus.AVAILABLE }),
        updateMany: jest.fn(),
      },
      guestStay: { count: jest.fn().mockResolvedValue(0), create: jest.fn() },
      folio: { count: jest.fn().mockResolvedValue(0), create: jest.fn() },
      roomQRCode: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const { repository } = createRepository(tx);

    await expect(
      repository.checkInReservation({
        hotelId: "hotel-1",
        tenantId: "tenant-1",
        reservationId: "reservation-1",
        actorUserId: "actor-1",
        accessCodeHash: "access-hash",
        accessCodeExpiresAt: new Date("2026-08-02T07:00:00.000Z"),
        generateFolioNumber: jest.fn(),
      }),
    ).rejects.toThrow("Phòng chưa có QR khả dụng");

    expect(tx.roomQRCode.findFirst).toHaveBeenCalledWith({
      where: {
        hotelId: "hotel-1",
        roomId: "room-1",
        status: { in: ["INACTIVE", "ACTIVE"] },
      },
      orderBy: { version: "desc" },
    });
    expect(tx.guestStay.create).not.toHaveBeenCalled();
  });

  it("retries serializable conflicts and converts exhaustion to 409", async () => {
    const error = new Prisma.PrismaClientKnownRequestError("write conflict", {
      code: "P2034",
      clientVersion: "test",
    });
    const prisma = { $transaction: jest.fn().mockRejectedValue(error) };
    const repository = new ReservationsRepository(prisma as never);

    await expect(
      repository.checkInReservation({
        hotelId: "hotel-1",
        tenantId: "tenant-1",
        reservationId: "reservation-1",
        actorUserId: "actor-1",
        accessCodeHash: "access-hash",
        accessCodeExpiresAt: new Date("2026-08-02T07:00:00.000Z"),
        generateFolioNumber: jest.fn(),
      }),
    ).rejects.toThrow(new ConflictException("RESERVATION_CHECK_IN_CONCURRENCY_CONFLICT"));
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it("returns the existing stay and folio when check-in is repeated", async () => {
    const reservation = {
      id: "reservation-1",
      hotelId: "hotel-1",
      roomId: "room-1",
      status: ReservationStatus.CHECKED_IN,
    };
    const stay = { id: "stay-1" };
    const folio = { id: "folio-1" };
    const tx = {
      $queryRawUnsafe: jest.fn(),
      reservation: { findFirst: jest.fn().mockResolvedValue(reservation) },
      guestStay: { findUnique: jest.fn().mockResolvedValue(stay), create: jest.fn() },
      folio: { findFirst: jest.fn().mockResolvedValue(folio), create: jest.fn() },
      room: { findFirst: jest.fn(), updateMany: jest.fn() },
    };
    const { repository } = createRepository(tx);

    await expect(
      repository.checkInReservation({
        hotelId: "hotel-1",
        tenantId: "tenant-1",
        reservationId: "reservation-1",
        actorUserId: "actor-1",
        accessCodeHash: "access-hash",
        accessCodeExpiresAt: new Date("2026-08-02T07:00:00.000Z"),
        generateFolioNumber: jest.fn(),
      }),
    ).resolves.toEqual({ idempotent: true, reservation, stay, folio });

    expect(tx.room.updateMany).not.toHaveBeenCalled();
    expect(tx.guestStay.create).not.toHaveBeenCalled();
    expect(tx.folio.create).not.toHaveBeenCalled();
  });

  it("assignRoom allows future non-overlapping interval for currently OCCUPIED room", async () => {
    const reservation = {
      id: "res-future",
      hotelId: "hotel-1",
      roomId: null,
      status: ReservationStatus.CONFIRMED,
      plannedCheckInAt: new Date("2026-11-01T07:00:00.000Z"),
      plannedCheckOutAt: new Date("2026-11-03T05:00:00.000Z"),
    };
    const tx = {
      $queryRawUnsafe: jest.fn(),
      reservation: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(reservation)
          .mockResolvedValueOnce(null),
        update: jest.fn().mockResolvedValue({ id: "res-future", roomId: "room-occ", status: "ARRIVAL_READY" }),
      },
      room: {
        findFirst: jest.fn().mockResolvedValue({ id: "room-occ", status: RoomStatus.OCCUPIED, price: new Prisma.Decimal(1000000) }),
      },
      guestStay: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const { repository } = createRepository(tx);

    await expect(
      repository.assignRoom({
        hotelId: "hotel-1",
        reservationId: "res-future",
        roomId: "room-occ",
        actorUserId: "actor-1",
      }),
    ).resolves.toMatchObject({ id: "res-future", status: "ARRIVAL_READY" });

    expect(tx.reservation.update).toHaveBeenCalled();
  });

  it("assignRoom rejects assignment to non-sellable room status (BLOCKED / MAINTENANCE / OUT_OF_SERVICE)", async () => {
    const reservation = {
      id: "res-1",
      hotelId: "hotel-1",
      roomId: null,
      status: ReservationStatus.CONFIRMED,
      plannedCheckInAt: new Date("2026-11-01T07:00:00.000Z"),
      plannedCheckOutAt: new Date("2026-11-03T05:00:00.000Z"),
    };
    const tx = {
      $queryRawUnsafe: jest.fn(),
      reservation: { findFirst: jest.fn().mockResolvedValue(reservation) },
      room: {
        findFirst: jest.fn().mockResolvedValue({ id: "room-blocked", status: RoomStatus.BLOCKED }),
      },
    };
    const { repository } = createRepository(tx);

    await expect(
      repository.assignRoom({
        hotelId: "hotel-1",
        reservationId: "res-1",
        roomId: "room-blocked",
        actorUserId: "actor-1",
      }),
    ).rejects.toThrow(new ConflictException("ROOM_NOT_AVAILABLE"));
  });

  it("assignRoom rejects assignment when an active stay overlaps the interval", async () => {
    const reservation = {
      id: "res-1",
      hotelId: "hotel-1",
      roomId: null,
      status: ReservationStatus.CONFIRMED,
      plannedCheckInAt: new Date("2026-11-01T07:00:00.000Z"),
      plannedCheckOutAt: new Date("2026-11-03T05:00:00.000Z"),
    };
    const tx = {
      $queryRawUnsafe: jest.fn(),
      reservation: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(reservation)
          .mockResolvedValueOnce(null),
        update: jest.fn(),
      },
      room: {
        findFirst: jest.fn().mockResolvedValue({ id: "room-1", status: RoomStatus.OCCUPIED }),
      },
      guestStay: {
        findFirst: jest.fn().mockResolvedValue({ id: "stay-overlapping" }),
      },
    };
    const { repository } = createRepository(tx);

    await expect(
      repository.assignRoom({
        hotelId: "hotel-1",
        reservationId: "res-1",
        roomId: "room-1",
        actorUserId: "actor-1",
      }),
    ).rejects.toThrow(new ConflictException("ROOM_RESERVATION_OVERLAP"));
  });

  it("rejects check-in before reservation date in Hotel.timezone (early check-in)", async () => {
    const futureDate = new Date(Date.now() + 86400000 * 5); // 5 days in the future
    const reservation = {
      id: "res-future",
      hotelId: "hotel-1",
      roomId: "room-1",
      status: ReservationStatus.ARRIVAL_READY,
      plannedCheckInAt: futureDate,
      hotel: { timezone: "Asia/Ho_Chi_Minh" },
    };
    const tx = {
      $queryRawUnsafe: jest.fn(),
      reservation: { findFirst: jest.fn().mockResolvedValue(reservation) },
    };
    const { repository } = createRepository(tx);

    await expect(
      repository.checkInReservation({
        hotelId: "hotel-1",
        tenantId: "tenant-1",
        reservationId: "res-future",
        actorUserId: "actor-1",
        accessCodeHash: "hash",
        accessCodeExpiresAt: new Date(),
        generateFolioNumber: jest.fn(),
        timezone: "Asia/Ho_Chi_Minh",
      }),
    ).rejects.toThrow(new ConflictException("EARLY_CHECK_IN_NOT_ALLOWED"));
  });

  it("check-in snapshots explicit reservation nightlyRateSnapshot to guest stay", async () => {
    const reservation = {
      id: "res-snapshot",
      hotelId: "hotel-1",
      roomId: "room-1",
      reservationCode: "VSH_RES_001",
      guestDisplayName: "Nguyen Van A",
      status: ReservationStatus.ARRIVAL_READY,
      plannedCheckInAt: new Date("2026-08-01T07:00:00.000Z"),
      plannedCheckOutAt: new Date("2026-08-03T05:00:00.000Z"),
      nightlyRateSnapshot: new Prisma.Decimal(1250000),
      hotel: { timezone: "Asia/Ho_Chi_Minh" },
    };
    const tx = {
      $queryRawUnsafe: jest.fn(),
      reservation: {
        findFirst: jest.fn().mockResolvedValue(reservation),
        update: jest.fn().mockResolvedValue({ ...reservation, status: ReservationStatus.CHECKED_IN }),
      },
      room: {
        findFirst: jest.fn().mockResolvedValue({ id: "room-1", status: RoomStatus.AVAILABLE, price: new Prisma.Decimal(900000) }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      guestStay: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: "stay-1", status: "ACTIVE" }),
      },
      folio: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: "folio-1", status: "OPEN" }),
      },
      roomQRCode: {
        findFirst: jest.fn().mockResolvedValue({ id: "qr-1", version: 1 }),
        updateMany: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: "qr-1", status: "ACTIVE" }),
      },
      domainEvent: { create: jest.fn() },
    };
    const { repository } = createRepository(tx);

    await repository.checkInReservation({
      hotelId: "hotel-1",
      tenantId: "tenant-1",
      reservationId: "res-snapshot",
      actorUserId: "actor-1",
      accessCodeHash: "hash",
      accessCodeExpiresAt: new Date(),
      generateFolioNumber: jest.fn().mockResolvedValue("FOL-1"),
      timezone: "Asia/Ho_Chi_Minh",
    });

    expect(tx.guestStay.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        nightlyRateSnapshot: new Prisma.Decimal(1250000),
      }),
    });
  });

  it("check-in snapshots room.price to stay when reservation rate is null", async () => {
    const reservation = {
      id: "res-null-rate",
      hotelId: "hotel-1",
      roomId: "room-1",
      reservationCode: "VSH_RES_002",
      guestDisplayName: "Nguyen Van B",
      status: ReservationStatus.ARRIVAL_READY,
      plannedCheckInAt: new Date("2026-08-01T07:00:00.000Z"),
      plannedCheckOutAt: new Date("2026-08-03T05:00:00.000Z"),
      nightlyRateSnapshot: null,
      hotel: { timezone: "Asia/Ho_Chi_Minh" },
    };
    const tx = {
      $queryRawUnsafe: jest.fn(),
      reservation: {
        findFirst: jest.fn().mockResolvedValue(reservation),
        update: jest.fn().mockResolvedValue({ ...reservation, status: ReservationStatus.CHECKED_IN }),
      },
      room: {
        findFirst: jest.fn().mockResolvedValue({ id: "room-1", status: RoomStatus.AVAILABLE, price: new Prisma.Decimal(800000) }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      guestStay: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: "stay-2", status: "ACTIVE" }),
      },
      folio: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: "folio-2", status: "OPEN" }),
      },
      roomQRCode: {
        findFirst: jest.fn().mockResolvedValue({ id: "qr-1", version: 1 }),
        updateMany: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: "qr-1", status: "ACTIVE" }),
      },
      domainEvent: { create: jest.fn() },
    };
    const { repository } = createRepository(tx);

    await repository.checkInReservation({
      hotelId: "hotel-1",
      tenantId: "tenant-1",
      reservationId: "res-null-rate",
      actorUserId: "actor-1",
      accessCodeHash: "hash",
      accessCodeExpiresAt: new Date(),
      generateFolioNumber: jest.fn().mockResolvedValue("FOL-2"),
      timezone: "Asia/Ho_Chi_Minh",
    });

    expect(tx.guestStay.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        nightlyRateSnapshot: new Prisma.Decimal(800000),
      }),
    });
  });

  it("check-in preserves 0 as free stay in guest stay nightlyRateSnapshot", async () => {
    const reservation = {
      id: "res-zero-rate",
      hotelId: "hotel-1",
      roomId: "room-1",
      reservationCode: "VSH_RES_003",
      guestDisplayName: "Nguyen Van Free",
      status: ReservationStatus.ARRIVAL_READY,
      plannedCheckInAt: new Date("2026-08-01T07:00:00.000Z"),
      plannedCheckOutAt: new Date("2026-08-03T05:00:00.000Z"),
      nightlyRateSnapshot: new Prisma.Decimal(0),
      hotel: { timezone: "Asia/Ho_Chi_Minh" },
    };
    const tx = {
      $queryRawUnsafe: jest.fn(),
      reservation: {
        findFirst: jest.fn().mockResolvedValue(reservation),
        update: jest.fn().mockResolvedValue({ ...reservation, status: ReservationStatus.CHECKED_IN }),
      },
      room: {
        findFirst: jest.fn().mockResolvedValue({ id: "room-1", status: RoomStatus.AVAILABLE, price: new Prisma.Decimal(800000) }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      guestStay: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: "stay-3", status: "ACTIVE" }),
      },
      folio: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: "folio-3", status: "OPEN" }),
      },
      roomQRCode: {
        findFirst: jest.fn().mockResolvedValue({ id: "qr-1", version: 1 }),
        updateMany: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: "qr-1", status: "ACTIVE" }),
      },
      domainEvent: { create: jest.fn() },
    };
    const { repository } = createRepository(tx);

    await repository.checkInReservation({
      hotelId: "hotel-1",
      tenantId: "tenant-1",
      reservationId: "res-zero-rate",
      actorUserId: "actor-1",
      accessCodeHash: "hash",
      accessCodeExpiresAt: new Date(),
      generateFolioNumber: jest.fn().mockResolvedValue("FOL-3"),
      timezone: "Asia/Ho_Chi_Minh",
    });

    expect(tx.guestStay.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        nightlyRateSnapshot: new Prisma.Decimal(0),
      }),
    });
  });
});
