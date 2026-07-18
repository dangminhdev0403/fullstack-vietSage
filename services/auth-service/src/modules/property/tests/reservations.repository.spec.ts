import { ConflictException } from "@nestjs/common";
import { Prisma, ReservationStatus, RoomStatus } from "@prisma/client";
import { ReservationsRepository } from "../infrastructure/repositories/reservations.repository";

function createRepository(tx: Record<string, unknown>) {
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return { repository: new ReservationsRepository(prisma as never), prisma };
}

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

  it("rejects expired or already-expired QR codes before creating a stay", async () => {
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
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
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
});
