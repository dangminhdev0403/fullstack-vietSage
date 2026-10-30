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
import {
  FolioStatus,
  GuestStayStatus,
  Prisma,
  ReservationStatus,
  RoomStatus,
} from "@prisma/client";
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

  it("searches arrivals by guest, phone, reservation code, group code, or room number", async () => {
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
          { groupCode: { contains: "Minh", mode: "insensitive" } },
          { room: { roomNumber: { contains: "Minh", mode: "insensitive" } } },
        ],
      }),
    });
  });

  it("searches arrivals across all dates without date filtering when from and to are omitted", async () => {
    const prisma = {
      reservation: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const repository = new ReservationsRepository(prisma as never);

    await repository.listArrivals({
      hotelId: "hotel-1",
      q: " VSH_GROUP_0017 ",
      skip: 0,
      take: 20,
    });

    expect(prisma.reservation.count).toHaveBeenCalledWith({
      where: {
        hotelId: "hotel-1",
        status: { in: expect.any(Array) },
        OR: [
          { guestDisplayName: { contains: "VSH_GROUP_0017", mode: "insensitive" } },
          { guestPhone: { contains: "VSH_GROUP_0017" } },
          { reservationCode: { contains: "VSH_GROUP_0017", mode: "insensitive" } },
          { groupCode: { contains: "VSH_GROUP_0017", mode: "insensitive" } },
          { room: { roomNumber: { contains: "VSH_GROUP_0017", mode: "insensitive" } } },
        ],
      },
    });
  });

  it("includes case-insensitive groupCode search while preserving hotel, date, status, and room scope", async () => {
    const prisma = {
      reservation: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const repository = new ReservationsRepository(prisma as never);
    const from = new Date("2026-09-19T00:00:00.000Z");
    const to = new Date("2026-09-20T00:00:00.000Z");

    await repository.listArrivals({
      hotelId: "hotel-1",
      from,
      to,
      roomId: "room-1",
      q: " GRP-99 ",
      skip: 0,
      take: 20,
    });

    expect(prisma.reservation.count).toHaveBeenCalledWith({
      where: {
        hotelId: "hotel-1",
        status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.ARRIVAL_READY] },
        plannedCheckInAt: { gte: from, lt: to },
        roomId: "room-1",
        OR: [
          { guestDisplayName: { contains: "GRP-99", mode: "insensitive" } },
          { guestPhone: { contains: "GRP-99" } },
          { reservationCode: { contains: "GRP-99", mode: "insensitive" } },
          { groupCode: { contains: "GRP-99", mode: "insensitive" } },
          { room: { roomNumber: { contains: "GRP-99", mode: "insensitive" } } },
        ],
      },
    });
  });

  describe("Confirmation Queries (Lane C)", () => {
    it("returns reservation confirmation data when hotelId matches", async () => {
      const mockReservation = {
        id: "res-1",
        hotelId: "hotel-1",
        reservationCode: "RES001",
        chargeLines: [],
        bookingPayments: [],
      };
      const prisma = {
        reservation: {
          findUnique: jest.fn().mockResolvedValue(mockReservation),
        },
      };
      const repository = new ReservationsRepository(prisma as never);

      const result = await repository.findReservationConfirmation("hotel-1", "res-1");
      expect(result).toBe(mockReservation);
    });

    it("throws NotFoundException when reservation is not found", async () => {
      const prisma = {
        reservation: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };
      const repository = new ReservationsRepository(prisma as never);

      await expect(repository.findReservationConfirmation("hotel-1", "missing-id")).rejects.toThrow(
        "Không tìm thấy thông tin đặt phòng",
      );
    });

    it("throws NotFoundException when reservation belongs to another hotelId (cross-hotel rejection)", async () => {
      const prisma = {
        reservation: {
          findUnique: jest.fn().mockResolvedValue({
            id: "res-1",
            hotelId: "other-hotel",
          }),
        },
      };
      const repository = new ReservationsRepository(prisma as never);

      await expect(repository.findReservationConfirmation("hotel-1", "res-1")).rejects.toThrow(
        "Đặt phòng không thuộc khách sạn này",
      );
    });

    it("returns group confirmation when reservations belong to hotelId", async () => {
      const mockHotel = { id: "hotel-1", name: "Hotel 1" };
      const mockReservations = [{ id: "res-1", hotelId: "hotel-1", groupCode: "GRP1" }];
      const prisma = {
        hotel: { findUnique: jest.fn().mockResolvedValue(mockHotel) },
        reservation: { findMany: jest.fn().mockResolvedValue(mockReservations) },
        reservationGroup: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      const repository = new ReservationsRepository(prisma as never);

      const result = await repository.findGroupConfirmation("hotel-1", "GRP1");
      expect(result.hotel).toBe(mockHotel);
      expect(result.reservations).toBe(mockReservations);
    });

    it("throws NotFoundException for group confirmation cross-hotel access", async () => {
      const prisma = {
        hotel: { findUnique: jest.fn().mockResolvedValue({ id: "hotel-1" }) },
        reservation: {
          findMany: jest.fn().mockResolvedValue([]),
          findFirst: jest.fn().mockResolvedValue({ hotelId: "other-hotel" }),
        },
      };
      const repository = new ReservationsRepository(prisma as never);

      await expect(repository.findGroupConfirmation("hotel-1", "GRP1")).rejects.toThrow(
        "Đoàn đặt phòng không thuộc khách sạn này",
      );
    });
  });
});

describe("ReservationsRepository transactional lifecycle", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-01T12:00:00.000Z"));
  });

  afterAll(() => {
    jest.useRealTimers();
  });
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

  it("rejects reservation check-in while the room is still PROCESSING", async () => {
    const reservation = {
      id: "reservation-1",
      hotelId: "hotel-1",
      roomId: "room-1",
      status: ReservationStatus.ARRIVAL_READY,
      plannedCheckInAt: new Date("2026-08-01T07:00:00.000Z"),
    };
    const tx = {
      $queryRawUnsafe: jest.fn(),
      reservation: { findFirst: jest.fn().mockResolvedValue(reservation) },
      room: {
        findFirst: jest.fn().mockResolvedValue({
          id: "room-1",
          status: RoomStatus.PROCESSING,
        }),
        updateMany: jest.fn(),
      },
      guestStay: { create: jest.fn() },
      folio: { create: jest.fn() },
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
    ).rejects.toThrow(new ConflictException("ROOM_NOT_READY_FOR_CHECK_IN"));

    expect(tx.room.updateMany).not.toHaveBeenCalled();
    expect(tx.guestStay.create).not.toHaveBeenCalled();
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

  it("auto-completes overdue dangling past stays and permits incoming check-in", async () => {
    const reservation = {
      id: "reservation-new",
      hotelId: "hotel-1",
      roomId: "room-1",
      status: ReservationStatus.ARRIVAL_READY,
      reservationCode: "RES-NEW",
      guestDisplayName: "Khách Mới",
      plannedCheckInAt: new Date(),
      plannedCheckOutAt: new Date(Date.now() + 86400000),
    };
    const pastOverdueStay = {
      id: "stay-past-overdue",
      reservationId: "reservation-old",
      plannedCheckOutAt: new Date(Date.now() - 3600000), // 1 hour ago
      status: GuestStayStatus.ACTIVE,
    };
    const newStay = { id: "stay-new", status: GuestStayStatus.ACTIVE };
    const newFolio = { id: "folio-new", folioNumber: "VSH_FOLIO_0002" };
    const checkedInRes = { ...reservation, status: ReservationStatus.CHECKED_IN };

    const tx = {
      $queryRawUnsafe: jest.fn(),
      reservation: {
        findFirst: jest.fn().mockResolvedValue(reservation),
        update: jest.fn().mockResolvedValue(checkedInRes),
      },
      room: {
        findFirst: jest.fn().mockResolvedValue({ id: "room-1", status: RoomStatus.OCCUPIED }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      guestStay: {
        findMany: jest.fn().mockResolvedValue([pastOverdueStay]),
        update: jest
          .fn()
          .mockResolvedValue({ ...pastOverdueStay, status: GuestStayStatus.CHECKED_OUT }),
        create: jest.fn().mockResolvedValue(newStay),
      },
      folio: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue(newFolio),
      },
      roomQRCode: {
        findFirst: jest.fn().mockResolvedValue({ id: "qr-1", version: 1 }),
        updateMany: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: "qr-1", status: "ACTIVE" }),
      },
      domainEvent: { create: jest.fn() },
    };
    const { repository } = createRepository(tx);

    const result = await repository.checkInReservation({
      hotelId: "hotel-1",
      tenantId: "tenant-1",
      reservationId: "reservation-new",
      actorUserId: "actor-1",
      accessCodeHash: "access-hash",
      accessCodeExpiresAt: new Date(Date.now() + 86400000),
      generateFolioNumber: jest.fn().mockResolvedValue("VSH_FOLIO_0002"),
    });

    expect(result.stay).toEqual(newStay);
    expect(tx.guestStay.update).toHaveBeenCalledWith({
      where: { id: "stay-past-overdue" },
      data: expect.objectContaining({
        status: GuestStayStatus.CHECKED_OUT,
      }),
    });
    expect(tx.folio.updateMany).toHaveBeenCalledWith({
      where: {
        stayId: "stay-past-overdue",
        status: { in: [FolioStatus.OPEN, FolioStatus.CHECKOUT_PENDING] },
      },
      data: expect.objectContaining({
        status: FolioStatus.CLOSED,
      }),
    });
  });

  it("auto-closes lingering folios from completed CHECKED_OUT stays and permits check-in", async () => {
    const reservation = {
      id: "res-dangling-folio",
      hotelId: "hotel-1",
      roomId: "room-1",
      status: ReservationStatus.ARRIVAL_READY,
      reservationCode: "RES-DANGLING",
      guestDisplayName: "Khách Mới",
      plannedCheckInAt: new Date(),
      plannedCheckOutAt: new Date(Date.now() + 86400000),
    };
    const newStay = { id: "stay-new", status: GuestStayStatus.ACTIVE };
    const newFolio = { id: "folio-new", folioNumber: "VSH_FOLIO_0003" };
    const checkedInRes = { ...reservation, status: ReservationStatus.CHECKED_IN };

    const tx = {
      $queryRawUnsafe: jest.fn(),
      reservation: {
        findFirst: jest.fn().mockResolvedValue(reservation),
        update: jest.fn().mockResolvedValue(checkedInRes),
      },
      room: {
        findFirst: jest.fn().mockResolvedValue({ id: "room-1", status: RoomStatus.AVAILABLE }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      guestStay: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(newStay),
      },
      folio: {
        findMany: jest.fn().mockResolvedValue([{ id: "folio-dangling-1" }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(newFolio),
      },
      roomQRCode: {
        findFirst: jest.fn().mockResolvedValue({ id: "qr-1", version: 1 }),
        updateMany: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: "qr-1", status: "ACTIVE" }),
      },
      domainEvent: { create: jest.fn() },
    };
    const { repository } = createRepository(tx);

    const result = await repository.checkInReservation({
      hotelId: "hotel-1",
      tenantId: "tenant-1",
      reservationId: "res-dangling-folio",
      actorUserId: "actor-1",
      accessCodeHash: "access-hash",
      accessCodeExpiresAt: new Date(Date.now() + 86400000),
      generateFolioNumber: jest.fn().mockResolvedValue("VSH_FOLIO_0003"),
    });

    expect(result.stay).toEqual(newStay);
    expect(tx.folio.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["folio-dangling-1"] } },
      data: expect.objectContaining({ status: FolioStatus.CLOSED }),
    });
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
        findFirst: jest.fn().mockResolvedValueOnce(reservation).mockResolvedValueOnce(null),
        update: jest
          .fn()
          .mockResolvedValue({ id: "res-future", roomId: "room-occ", status: "ARRIVAL_READY" }),
      },
      room: {
        findFirst: jest.fn().mockResolvedValue({
          id: "room-occ",
          status: RoomStatus.OCCUPIED,
          price: new Prisma.Decimal(1000000),
        }),
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
        findFirst: jest.fn().mockResolvedValueOnce(reservation).mockResolvedValueOnce(null),
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
    ).rejects.toThrow(new ConflictException("EARLY_CHECK_IN_CONFIRMATION_REQUIRED"));
  });

  it("succeeds early check-in on confirmed retry with confirmEarlyCheckIn = true", async () => {
    const futureDate = new Date(Date.now() + 86400000 * 5);
    const reservation = {
      id: "res-future-confirmed",
      hotelId: "hotel-1",
      roomId: "room-1",
      reservationCode: "VSH_RES_EARLY",
      guestDisplayName: "Early Guest",
      status: ReservationStatus.ARRIVAL_READY,
      plannedCheckInAt: futureDate,
      hotel: { timezone: "Asia/Ho_Chi_Minh" },
    };
    const tx = {
      $queryRawUnsafe: jest.fn(),
      reservation: {
        findFirst: jest.fn().mockResolvedValue(reservation),
        update: jest
          .fn()
          .mockResolvedValue({ ...reservation, status: ReservationStatus.CHECKED_IN }),
      },
      room: {
        findFirst: jest.fn().mockResolvedValue({
          id: "room-1",
          status: RoomStatus.AVAILABLE,
          price: new Prisma.Decimal(1000000),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      guestStay: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: "stay-early", status: "ACTIVE" }),
      },
      folio: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: "folio-early", status: "OPEN" }),
      },
      roomQRCode: {
        findFirst: jest.fn().mockResolvedValue({ id: "qr-1", version: 1 }),
        updateMany: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: "qr-1", status: "ACTIVE" }),
      },
      domainEvent: { create: jest.fn() },
    };
    const { repository } = createRepository(tx);

    const result = await repository.checkInReservation({
      hotelId: "hotel-1",
      tenantId: "tenant-1",
      reservationId: "res-future-confirmed",
      actorUserId: "actor-1",
      accessCodeHash: "hash",
      accessCodeExpiresAt: new Date(),
      generateFolioNumber: jest.fn().mockResolvedValue("FOL-EARLY"),
      timezone: "Asia/Ho_Chi_Minh",
      dto: { confirmEarlyCheckIn: true },
    });

    expect(result.reservation.status).toBe(ReservationStatus.CHECKED_IN);
    expect(result.stay.status).toBe("ACTIVE");
  });

  it("rejects late check-in when plannedCheckInAt was in the past and requires confirmation", async () => {
    const pastDate = new Date("2026-07-20T10:00:00.000Z");
    const reservation = {
      id: "res-past",
      hotelId: "hotel-1",
      roomId: "room-1",
      status: ReservationStatus.ARRIVAL_READY,
      plannedCheckInAt: pastDate,
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
        reservationId: "res-past",
        actorUserId: "actor-1",
        accessCodeHash: "hash",
        accessCodeExpiresAt: new Date(),
        generateFolioNumber: jest.fn(),
        timezone: "Asia/Ho_Chi_Minh",
      }),
    ).rejects.toThrow(new ConflictException("LATE_CHECK_IN_CONFIRMATION_REQUIRED"));
  });

  it("succeeds late check-in on confirmed retry with confirmLateCheckIn = true", async () => {
    const pastDate = new Date("2026-07-20T10:00:00.000Z");
    const reservation = {
      id: "res-past-confirmed",
      hotelId: "hotel-1",
      roomId: "room-1",
      reservationCode: "VSH_RES_LATE",
      guestDisplayName: "Late Guest",
      status: ReservationStatus.ARRIVAL_READY,
      plannedCheckInAt: pastDate,
      hotel: { timezone: "Asia/Ho_Chi_Minh" },
    };
    const tx = {
      $queryRawUnsafe: jest.fn(),
      reservation: {
        findFirst: jest.fn().mockResolvedValue(reservation),
        update: jest
          .fn()
          .mockResolvedValue({ ...reservation, status: ReservationStatus.CHECKED_IN }),
      },
      room: {
        findFirst: jest.fn().mockResolvedValue({
          id: "room-1",
          status: RoomStatus.AVAILABLE,
          price: new Prisma.Decimal(1000000),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      guestStay: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: "stay-late", status: "ACTIVE" }),
      },
      folio: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: "folio-late", status: "OPEN" }),
      },
      roomQRCode: {
        findFirst: jest.fn().mockResolvedValue({ id: "qr-1", version: 1 }),
        updateMany: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: "qr-1", status: "ACTIVE" }),
      },
      domainEvent: { create: jest.fn() },
    };
    const { repository } = createRepository(tx);

    const result = await repository.checkInReservation({
      hotelId: "hotel-1",
      tenantId: "tenant-1",
      reservationId: "res-past-confirmed",
      actorUserId: "actor-1",
      accessCodeHash: "hash",
      accessCodeExpiresAt: new Date(),
      generateFolioNumber: jest.fn().mockResolvedValue("FOL-LATE"),
      timezone: "Asia/Ho_Chi_Minh",
      dto: { confirmLateCheckIn: true },
    });

    expect(result.reservation.status).toBe(ReservationStatus.CHECKED_IN);
    expect(result.stay.status).toBe("ACTIVE");
  });

  it("blocks check-in when reservation is CANCELLED or NO_SHOW", async () => {
    const cancelledRes = {
      id: "res-cancelled",
      hotelId: "hotel-1",
      roomId: "room-1",
      status: ReservationStatus.CANCELLED,
      hotel: { timezone: "Asia/Ho_Chi_Minh" },
    };
    const noShowRes = {
      id: "res-noshow",
      hotelId: "hotel-1",
      roomId: "room-1",
      status: ReservationStatus.NO_SHOW,
      hotel: { timezone: "Asia/Ho_Chi_Minh" },
    };
    const tx = {
      $queryRawUnsafe: jest.fn(),
      reservation: {
        findFirst: jest.fn().mockResolvedValueOnce(cancelledRes).mockResolvedValueOnce(noShowRes),
      },
    };
    const { repository } = createRepository(tx);

    await expect(
      repository.checkInReservation({
        hotelId: "hotel-1",
        tenantId: "tenant-1",
        reservationId: "res-cancelled",
        actorUserId: "actor-1",
        accessCodeHash: "hash",
        accessCodeExpiresAt: new Date(),
        generateFolioNumber: jest.fn(),
      }),
    ).rejects.toThrow(new ConflictException("RESERVATION_CANCELLED"));

    await expect(
      repository.checkInReservation({
        hotelId: "hotel-1",
        tenantId: "tenant-1",
        reservationId: "res-noshow",
        actorUserId: "actor-1",
        accessCodeHash: "hash",
        accessCodeExpiresAt: new Date(),
        generateFolioNumber: jest.fn(),
      }),
    ).rejects.toThrow(new ConflictException("RESERVATION_NO_SHOW"));
  });

  it("blocks check-in when expectedUpdatedAt or expectedRoomId is stale", async () => {
    const reservation = {
      id: "res-stale",
      hotelId: "hotel-1",
      roomId: "room-1",
      status: ReservationStatus.ARRIVAL_READY,
      updatedAt: new Date("2026-08-01T10:00:00.000Z"),
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
        reservationId: "res-stale",
        actorUserId: "actor-1",
        accessCodeHash: "hash",
        accessCodeExpiresAt: new Date(),
        generateFolioNumber: jest.fn(),
        dto: { expectedUpdatedAt: new Date("2026-08-01T09:00:00.000Z") },
      }),
    ).rejects.toThrow(new ConflictException("STALE_RESERVATION_RECORD"));

    await expect(
      repository.checkInReservation({
        hotelId: "hotel-1",
        tenantId: "tenant-1",
        reservationId: "res-stale",
        actorUserId: "actor-1",
        accessCodeHash: "hash",
        accessCodeExpiresAt: new Date(),
        generateFolioNumber: jest.fn(),
        dto: { expectedRoomId: "room-different" },
      }),
    ).rejects.toThrow(new ConflictException("STALE_ROOM_ASSIGNMENT"));
  });

  it("blocks assignRoom when expectedUpdatedAt or expectedRoomId is stale", async () => {
    const reservation = {
      id: "res-stale-assign",
      hotelId: "hotel-1",
      roomId: "room-old",
      status: ReservationStatus.CONFIRMED,
      updatedAt: new Date("2026-08-01T10:00:00.000Z"),
    };
    const tx = {
      $queryRawUnsafe: jest.fn(),
      reservation: { findFirst: jest.fn().mockResolvedValue(reservation) },
    };
    const { repository } = createRepository(tx);

    await expect(
      repository.assignRoom({
        hotelId: "hotel-1",
        reservationId: "res-stale-assign",
        roomId: "room-new",
        actorUserId: "actor-1",
        expectedUpdatedAt: new Date("2026-08-01T08:00:00.000Z"),
      }),
    ).rejects.toThrow(new ConflictException("STALE_RESERVATION_RECORD"));

    await expect(
      repository.assignRoom({
        hotelId: "hotel-1",
        reservationId: "res-stale-assign",
        roomId: "room-new",
        actorUserId: "actor-1",
        expectedRoomId: "room-wrong",
      }),
    ).rejects.toThrow(new ConflictException("STALE_ROOM_ASSIGNMENT"));
  });

  it("blocks assignRoom when reservation is CANCELLED or NO_SHOW", async () => {
    const cancelledRes = {
      id: "res-cancelled",
      hotelId: "hotel-1",
      roomId: null,
      status: ReservationStatus.CANCELLED,
    };
    const noShowRes = {
      id: "res-noshow",
      hotelId: "hotel-1",
      roomId: null,
      status: ReservationStatus.NO_SHOW,
    };
    const tx = {
      $queryRawUnsafe: jest.fn(),
      reservation: {
        findFirst: jest.fn().mockResolvedValueOnce(cancelledRes).mockResolvedValueOnce(noShowRes),
      },
    };
    const { repository } = createRepository(tx);

    await expect(
      repository.assignRoom({
        hotelId: "hotel-1",
        reservationId: "res-cancelled",
        roomId: "room-1",
        actorUserId: "actor-1",
      }),
    ).rejects.toThrow(new ConflictException("RESERVATION_CANCELLED"));

    await expect(
      repository.assignRoom({
        hotelId: "hotel-1",
        reservationId: "res-noshow",
        roomId: "room-1",
        actorUserId: "actor-1",
      }),
    ).rejects.toThrow(new ConflictException("RESERVATION_NO_SHOW"));
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
      baseNightlyRateSnapshot: new Prisma.Decimal(900000),
      nightlyRateSnapshot: new Prisma.Decimal(1250000),
      hotel: { timezone: "Asia/Ho_Chi_Minh" },
    };
    const tx = {
      $queryRawUnsafe: jest.fn(),
      reservation: {
        findFirst: jest.fn().mockResolvedValue(reservation),
        update: jest
          .fn()
          .mockResolvedValue({ ...reservation, status: ReservationStatus.CHECKED_IN }),
      },
      room: {
        findFirst: jest.fn().mockResolvedValue({
          id: "room-1",
          status: RoomStatus.AVAILABLE,
          price: new Prisma.Decimal(900000),
        }),
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
        baseNightlyRateSnapshot: new Prisma.Decimal(900000),
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
        update: jest
          .fn()
          .mockResolvedValue({ ...reservation, status: ReservationStatus.CHECKED_IN }),
      },
      room: {
        findFirst: jest.fn().mockResolvedValue({
          id: "room-1",
          status: RoomStatus.AVAILABLE,
          price: new Prisma.Decimal(800000),
        }),
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
        update: jest
          .fn()
          .mockResolvedValue({ ...reservation, status: ReservationStatus.CHECKED_IN }),
      },
      room: {
        findFirst: jest.fn().mockResolvedValue({
          id: "room-1",
          status: RoomStatus.AVAILABLE,
          price: new Prisma.Decimal(800000),
        }),
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

  it("saves identity profile and accompanying occupants in guest stay and occupants in transaction", async () => {
    const reservation = {
      id: "res-identity",
      hotelId: "hotel-1",
      roomId: "room-1",
      status: ReservationStatus.ARRIVAL_READY,
      reservationCode: "RES-IDENT",
      guestDisplayName: "Nguyễn Văn A",
      guestPhone: "0901234567",
      plannedCheckInAt: new Date("2026-08-01T07:00:00.000Z"),
      plannedCheckOutAt: new Date("2026-08-03T05:00:00.000Z"),
      nightlyRateSnapshot: new Prisma.Decimal(500000),
      hotel: { timezone: "Asia/Ho_Chi_Minh" },
    };
    const tx = {
      $queryRawUnsafe: jest.fn(),
      reservation: {
        findFirst: jest.fn().mockResolvedValue(reservation),
        update: jest
          .fn()
          .mockResolvedValue({ ...reservation, status: ReservationStatus.CHECKED_IN }),
      },
      room: {
        findFirst: jest.fn().mockResolvedValue({
          id: "room-1",
          status: RoomStatus.AVAILABLE,
          price: new Prisma.Decimal(500000),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      guestStay: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: "stay-ident", status: "ACTIVE" }),
      },
      folio: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: "folio-ident", status: "OPEN" }),
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
      reservationId: "res-identity",
      actorUserId: "actor-1",
      accessCodeHash: "hash",
      accessCodeExpiresAt: new Date(),
      generateFolioNumber: jest.fn().mockResolvedValue("FOL-IDENT"),
      timezone: "Asia/Ho_Chi_Minh",
      dto: {
        guestDisplayName: "Nguyễn Văn A",
        guestPhone: "0901234567",
        guestIdentityNumber: "079090001234",
        guestDateOfBirth: "1990-01-15",
        guestGender: "MALE",
        guestNationality: "VNM",
        guestResidencePlace: "123 Lê Lợi, Q1, TP.HCM",
        occupants: [
          {
            fullName: "Trần Thị B",
            phone: "0909999888",
            identityNumber: "079192004567",
            dateOfBirth: "1992-05-20",
            gender: "FEMALE",
            nationality: "VNM",
            residencePlace: "123 Lê Lợi, Q1, TP.HCM",
            isPrimary: false,
          },
        ],
      },
    });

    expect(tx.guestStay.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        guestDisplayName: "Nguyễn Văn A",
        guestPhone: "0901234567",
        guestIdentityNumber: "079090001234",
        guestDateOfBirth: "1990-01-15",
        guestGender: "MALE",
        guestNationality: "VNM",
        guestResidencePlace: "123 Lê Lợi, Q1, TP.HCM",
        occupants: {
          create: [
            expect.objectContaining({
              fullName: "Nguyễn Văn A",
              identityNumber: "079090001234",
              citizenshipKind: "VIETNAMESE",
              isPrimary: true,
            }),
            expect.objectContaining({
              fullName: "Trần Thị B",
              identityNumber: "079192004567",
              citizenshipKind: "VIETNAMESE",
              isPrimary: false,
            }),
          ],
        },
      }),
    });
  });

  describe("createBulkReservations transactional group booking", () => {
    it("locks rooms in sorted order and creates all reservations atomically with one shared groupCode", async () => {
      const lockOrder: string[] = [];
      const tx = {
        $queryRawUnsafe: jest.fn(async (_sql: string, roomId: string) => {
          lockOrder.push(roomId);
        }),
        room: {
          findMany: jest.fn().mockResolvedValue([
            { id: "room-2", status: RoomStatus.AVAILABLE, price: 1000000 },
            { id: "room-1", status: RoomStatus.AVAILABLE, price: 1000000 },
          ]),
        },
        reservation: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(async ({ data }: any) => ({
            id: `res-${data.roomId}`,
            ...data,
          })),
        },
        guestStay: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };
      const { repository } = createRepository(tx);

      let seq = 1;
      const generateReservationCode = jest.fn(async () => `VSH_RES_${seq++}`);

      const result = await repository.createBulkReservations({
        hotelId: "hotel-1",
        groupCode: "VSH_GROUP_0001",
        leadGuestName: "Doan Dai Bieu",
        leadGuestPhone: "0900111222",
        checkInDate: new Date("2026-09-10T14:00:00.000Z"),
        checkOutDate: new Date("2026-09-15T12:00:00.000Z"),
        roomIds: ["room-2", "room-1"], // Unsorted input
        createdByUserId: "actor-1",
        nightlyRateSnapshot: "1000000.00",
        generateReservationCode,
      });

      expect(result.groupCode).toBe("VSH_GROUP_0001");
      expect(result.reservations).toHaveLength(2);

      // Verify sorted locking order
      expect(lockOrder).toEqual(["room-1", "room-2"]);

      // Verify shared groupCode and copied lead details
      expect(result.reservations[0]).toMatchObject({
        roomId: "room-2",
        groupCode: "VSH_GROUP_0001",
        guestDisplayName: "Doan Dai Bieu",
        guestPhone: "0900111222",
        reservationCode: "VSH_RES_1",
        status: ReservationStatus.ARRIVAL_READY,
      });
      expect(result.reservations[1]).toMatchObject({
        roomId: "room-1",
        groupCode: "VSH_GROUP_0001",
        guestDisplayName: "Doan Dai Bieu",
        guestPhone: "0900111222",
        reservationCode: "VSH_RES_2",
        status: ReservationStatus.ARRIVAL_READY,
      });
    });

    it("rejects when less than 2 or more than 50 unique rooms requested", async () => {
      const tx = {};
      const { repository } = createRepository(tx);

      await expect(
        repository.createBulkReservations({
          hotelId: "hotel-1",
          groupCode: "GRP-1",
          leadGuestName: "Guest",
          checkInDate: new Date("2026-09-10T14:00:00.000Z"),
          checkOutDate: new Date("2026-09-15T12:00:00.000Z"),
          roomIds: ["room-1"],
          createdByUserId: "actor-1",
          generateReservationCode: jest.fn(),
        }),
      ).rejects.toThrow();
    });

    it("rejects and rolls back completely when any room is non-sellable", async () => {
      const tx = {
        $queryRawUnsafe: jest.fn(),
        room: {
          findMany: jest.fn().mockResolvedValue([
            { id: "room-1", status: RoomStatus.AVAILABLE, price: 1000000 },
            { id: "room-2", status: RoomStatus.MAINTENANCE, price: 1000000 },
          ]),
        },
        reservation: {
          findFirst: jest.fn(),
          create: jest.fn(),
        },
      };
      const { repository } = createRepository(tx);

      await expect(
        repository.createBulkReservations({
          hotelId: "hotel-1",
          groupCode: "GRP-1",
          leadGuestName: "Guest",
          checkInDate: new Date("2026-09-10T14:00:00.000Z"),
          checkOutDate: new Date("2026-09-15T12:00:00.000Z"),
          roomIds: ["room-1", "room-2"],
          createdByUserId: "actor-1",
          generateReservationCode: jest.fn(),
        }),
      ).rejects.toThrow(new ConflictException("ROOM_NOT_AVAILABLE"));

      expect(tx.reservation.create).not.toHaveBeenCalled();
    });

    it("rejects and rolls back when any room has overlapping active reservation", async () => {
      const tx = {
        $queryRawUnsafe: jest.fn(),
        room: {
          findMany: jest.fn().mockResolvedValue([
            { id: "room-1", status: RoomStatus.AVAILABLE, price: 1000000 },
            { id: "room-2", status: RoomStatus.AVAILABLE, price: 1000000 },
          ]),
        },
        reservation: {
          findFirst: jest.fn().mockResolvedValue({ id: "overlap-res", roomId: "room-2" }),
          create: jest.fn(),
        },
      };
      const { repository } = createRepository(tx);

      await expect(
        repository.createBulkReservations({
          hotelId: "hotel-1",
          groupCode: "GRP-1",
          leadGuestName: "Guest",
          checkInDate: new Date("2026-09-10T14:00:00.000Z"),
          checkOutDate: new Date("2026-09-15T12:00:00.000Z"),
          roomIds: ["room-1", "room-2"],
          createdByUserId: "actor-1",
          generateReservationCode: jest.fn(),
        }),
      ).rejects.toThrow(new ConflictException("ROOM_RESERVATION_OVERLAP"));

      expect(tx.reservation.create).not.toHaveBeenCalled();
    });

    it("rejects and rolls back when any room has overlapping active stay", async () => {
      const tx = {
        $queryRawUnsafe: jest.fn(),
        room: {
          findMany: jest.fn().mockResolvedValue([
            { id: "room-1", status: RoomStatus.AVAILABLE, price: 1000000 },
            { id: "room-2", status: RoomStatus.AVAILABLE, price: 1000000 },
          ]),
        },
        reservation: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
        },
        guestStay: {
          findFirst: jest.fn().mockResolvedValue({ id: "overlap-stay", roomId: "room-1" }),
        },
      };
      const { repository } = createRepository(tx);

      await expect(
        repository.createBulkReservations({
          hotelId: "hotel-1",
          groupCode: "GRP-1",
          leadGuestName: "Guest",
          checkInDate: new Date("2026-09-10T14:00:00.000Z"),
          checkOutDate: new Date("2026-09-15T12:00:00.000Z"),
          roomIds: ["room-1", "room-2"],
          createdByUserId: "actor-1",
          generateReservationCode: jest.fn(),
        }),
      ).rejects.toThrow(new ConflictException("ROOM_RESERVATION_OVERLAP"));

      expect(tx.reservation.create).not.toHaveBeenCalled();
    });
  });

  describe("cancelReservation transactional lifecycle", () => {
    it("cancels a reservation, clears roomId, and creates auditLog and domainEvent", async () => {
      const reservation = {
        id: "reservation-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        status: ReservationStatus.ARRIVAL_READY,
      };
      const updatedReservation = {
        ...reservation,
        roomId: null,
        status: ReservationStatus.CANCELLED,
      };
      const tx = {
        $queryRawUnsafe: jest.fn(),
        reservation: {
          findFirst: jest.fn().mockResolvedValue(reservation),
          update: jest.fn().mockResolvedValue(updatedReservation),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: "audit-1" }),
        },
        domainEvent: {
          create: jest.fn().mockResolvedValue({ id: "event-1" }),
        },
      };
      const { repository } = createRepository(tx);

      const result = await repository.cancelReservation({
        hotelId: "hotel-1",
        tenantId: "tenant-1",
        reservationId: "reservation-1",
        actorUserId: "actor-1",
        reason: "Khách bận việc đột xuất",
      });

      expect(result.status).toBe(ReservationStatus.CANCELLED);
      expect(result.roomId).toBeNull();
      expect(tx.reservation.update).toHaveBeenCalledWith({
        where: { id: "reservation-1" },
        data: {
          status: ReservationStatus.CANCELLED,
          roomId: null,
        },
        include: { room: true },
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "RESERVATION_CANCELLED",
          actorId: "actor-1",
          entityType: "Reservation",
          entityId: "reservation-1",
          metadata: expect.objectContaining({
            actorUserId: "actor-1",
            reason: "Khách bận việc đột xuất",
            previousStatus: ReservationStatus.ARRIVAL_READY,
            previousRoomId: "room-1",
          }),
        }),
      });
      expect(tx.domainEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: "RESERVATION_CANCELLED",
          aggregateType: "Reservation",
          aggregateId: "reservation-1",
          payload: expect.objectContaining({
            actorUserId: "actor-1",
            reason: "Khách bận việc đột xuất",
          }),
        }),
      });
    });

    it("rejects cancellation if reservation is already CHECKED_IN", async () => {
      const reservation = {
        id: "reservation-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        status: ReservationStatus.CHECKED_IN,
      };
      const tx = {
        $queryRawUnsafe: jest.fn(),
        reservation: {
          findFirst: jest.fn().mockResolvedValue(reservation),
          update: jest.fn(),
        },
      };
      const { repository } = createRepository(tx);

      await expect(
        repository.cancelReservation({
          hotelId: "hotel-1",
          tenantId: "tenant-1",
          reservationId: "reservation-1",
          actorUserId: "actor-1",
        }),
      ).rejects.toThrow(ConflictException);
      expect(tx.reservation.update).not.toHaveBeenCalled();
    });
  });

  describe("markNoShow transactional lifecycle", () => {
    it("marks reservation as no-show, clears roomId, and creates auditLog and domainEvent", async () => {
      const reservation = {
        id: "reservation-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        status: ReservationStatus.ARRIVAL_READY,
      };
      const updatedReservation = {
        ...reservation,
        roomId: null,
        status: ReservationStatus.NO_SHOW,
      };
      const tx = {
        $queryRawUnsafe: jest.fn(),
        reservation: {
          findFirst: jest.fn().mockResolvedValue(reservation),
          update: jest.fn().mockResolvedValue(updatedReservation),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: "audit-1" }),
        },
        domainEvent: {
          create: jest.fn().mockResolvedValue({ id: "event-1" }),
        },
      };
      const { repository } = createRepository(tx);

      const result = await repository.markNoShow({
        hotelId: "hotel-1",
        tenantId: "tenant-1",
        reservationId: "reservation-1",
        actorUserId: "actor-1",
        reason: "Quá giờ nhận phòng không liên lạc được",
      });

      expect(result.status).toBe(ReservationStatus.NO_SHOW);
      expect(result.roomId).toBeNull();
      expect(tx.reservation.update).toHaveBeenCalledWith({
        where: { id: "reservation-1" },
        data: {
          status: ReservationStatus.NO_SHOW,
          roomId: null,
        },
        include: { room: true },
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "RESERVATION_NO_SHOW",
          actorId: "actor-1",
          entityType: "Reservation",
          entityId: "reservation-1",
          metadata: expect.objectContaining({
            actorUserId: "actor-1",
            reason: "Quá giờ nhận phòng không liên lạc được",
            previousStatus: ReservationStatus.ARRIVAL_READY,
            previousRoomId: "room-1",
          }),
        }),
      });
      expect(tx.domainEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: "RESERVATION_NO_SHOW",
          aggregateType: "Reservation",
          aggregateId: "reservation-1",
          payload: expect.objectContaining({
            actorUserId: "actor-1",
            reason: "Quá giờ nhận phòng không liên lạc được",
          }),
        }),
      });
    });
  });

  describe("getRoomPlan canonical reservation guestCount", () => {
    it("preserves canonical reservation guestCount and preserves null instead of fabricating 1", async () => {
      const rooms = [
        {
          id: "room-1",
          roomNumber: "101",
          floor: "1",
          roomTypeId: "type-1",
          roomType: { name: "Deluxe" },
          status: RoomStatus.AVAILABLE,
          price: new Prisma.Decimal(500000),
        },
      ];
      const reservations = [
        {
          id: "res-unknown-count",
          roomId: "room-1",
          groupCode: null,
          status: ReservationStatus.CONFIRMED,
          plannedCheckInAt: new Date("2026-10-21T07:00:00.000Z"),
          plannedCheckOutAt: new Date("2026-10-23T05:00:00.000Z"),
          guestDisplayName: "Guest Unknown",
          guestPhone: "0900000001",
          guestCount: null,
          nightlyRateSnapshot: new Prisma.Decimal(500000),
          updatedAt: new Date("2026-10-21T00:00:00.000Z"),
          room: {
            roomNumber: "101",
            roomTypeId: "type-1",
            roomType: { name: "Deluxe" },
          },
        },
        {
          id: "res-known-count",
          roomId: "room-1",
          groupCode: "OTA-Agoda",
          status: ReservationStatus.CONFIRMED,
          plannedCheckInAt: new Date("2026-10-24T07:00:00.000Z"),
          plannedCheckOutAt: new Date("2026-10-26T05:00:00.000Z"),
          guestDisplayName: "Guest Known",
          guestPhone: "0900000002",
          guestCount: 3,
          nightlyRateSnapshot: new Prisma.Decimal(500000),
          updatedAt: new Date("2026-10-21T00:00:00.000Z"),
          room: {
            roomNumber: "101",
            roomTypeId: "type-1",
            roomType: { name: "Deluxe" },
          },
        },
      ];

      const prisma = {
        room: { findMany: jest.fn().mockResolvedValue(rooms) },
        reservation: { findMany: jest.fn().mockResolvedValue(reservations) },
        guestStay: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const repository = new ReservationsRepository(prisma as never);

      const result = await repository.getRoomPlan({
        hotelId: "hotel-1",
        from: new Date("2026-10-20T00:00:00.000Z"),
        to: new Date("2026-10-30T00:00:00.000Z"),
      });

      expect(result.blocks).toHaveLength(2);

      const unknownBlock = result.blocks.find((b) => b.reservationId === "res-unknown-count");
      expect(unknownBlock).toBeDefined();
      expect(unknownBlock?.guestCount).toBeNull();
      expect(unknownBlock?.groupCode).toBeNull();

      const knownBlock = result.blocks.find((b) => b.reservationId === "res-known-count");
      expect(knownBlock).toBeDefined();
      expect(knownBlock?.guestCount).toBe(3);
      expect(knownBlock?.groupCode).toBe("OTA-Agoda");
    });
  });

  describe("updateReservationDates transactional lifecycle", () => {
    it("updates reservation planned dates and creates audit log", async () => {
      const res = {
        id: "res-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        status: ReservationStatus.CONFIRMED,
        plannedCheckInAt: new Date("2026-10-21T14:00:00.000Z"),
        plannedCheckOutAt: new Date("2026-10-23T12:00:00.000Z"),
        updatedAt: new Date("2026-10-21T00:00:00.000Z"),
      };
      const tx = {
        reservation: {
          findFirst: jest.fn().mockImplementation(({ where }) => {
            if (where.id === "res-1") return Promise.resolve(res);
            return Promise.resolve(null);
          }),
          update: jest.fn().mockResolvedValue({
            ...res,
            plannedCheckOutAt: new Date("2026-10-25T12:00:00.000Z"),
          }),
        },
        guestStay: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: "audit-1" }),
        },
      };
      const prisma = {
        $transaction: jest.fn().mockImplementation(async (cb) => cb(tx)),
      };
      const repository = new ReservationsRepository(prisma as never);

      const result = await repository.updateReservationDates({
        hotelId: "hotel-1",
        tenantId: "tenant-1",
        reservationId: "res-1",
        endDate: "2026-10-25",
        expectedUpdatedAt: "2026-10-21T00:00:00.000Z",
        actorUserId: "user-1",
      });

      expect(result.plannedCheckOutAt).toEqual(new Date("2026-10-25T12:00:00.000Z"));
      expect(tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "RESERVATION_DATES_UPDATED",
            entityId: "res-1",
          }),
        }),
      );
    });

    it("rejects date update when new check-in is after check-out", async () => {
      const res = {
        id: "res-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        status: ReservationStatus.CONFIRMED,
        plannedCheckInAt: new Date("2026-10-21T14:00:00.000Z"),
        plannedCheckOutAt: new Date("2026-10-23T12:00:00.000Z"),
        updatedAt: new Date("2026-10-21T00:00:00.000Z"),
      };
      const tx = {
        reservation: {
          findFirst: jest.fn().mockResolvedValue(res),
        },
      };
      const prisma = {
        $transaction: jest.fn().mockImplementation(async (cb) => cb(tx)),
      };
      const repository = new ReservationsRepository(prisma as never);

      await expect(
        repository.updateReservationDates({
          hotelId: "hotel-1",
          tenantId: "tenant-1",
          reservationId: "res-1",
          startDate: "2026-10-24",
          expectedUpdatedAt: "2026-10-21T00:00:00.000Z",
          actorUserId: "user-1",
        }),
      ).rejects.toThrow("Ngày trả phòng phải sau ngày nhận phòng");
    });
  });

  describe("createReservation atomic charge line persistence (F2)", () => {
    it("persists assigned reservation and charge lines atomically and returns reservation", async () => {
      const room = {
        id: "room-1",
        hotelId: "hotel-1",
        roomTypeId: "rt-1",
        price: new Prisma.Decimal(500000),
        status: RoomStatus.AVAILABLE,
      };
      const createdRes = {
        id: "res-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        status: ReservationStatus.ARRIVAL_READY,
      };
      const tx = {
        $queryRawUnsafe: jest.fn().mockResolvedValue([]),
        room: {
          findFirst: jest.fn().mockResolvedValue(room),
        },
        reservation: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue(createdRes),
        },
        guestStay: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        reservationChargeLine: {
          createMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
      };
      const prisma = {
        $transaction: jest.fn().mockImplementation(async (cb) => cb(tx)),
      };
      const repository = new ReservationsRepository(prisma as never);

      const result = await repository.createReservation({
        hotelId: "hotel-1",
        reservationCode: "RES-101",
        guestDisplayName: "Test Guest",
        plannedCheckInAt: new Date("2026-10-21T14:00:00.000Z"),
        plannedCheckOutAt: new Date("2026-10-23T12:00:00.000Z"),
        createdByUserId: "user-1",
        roomId: "room-1",
        chargeLines: [
          {
            lineType: "ROOM_NIGHT",
            serviceDate: "2026-10-21",
            nameSnapshot: "Night 1",
            quantity: 1,
            unitPriceSnapshot: 500000,
            totalSnapshot: 500000,
          },
          {
            lineType: "EXTRA",
            nameSnapshot: "Breakfast",
            quantity: 1,
            unitPriceSnapshot: 100000,
            totalSnapshot: 100000,
          },
        ],
      });

      expect(result).toEqual(createdRes);
      expect(tx.reservation.create).toHaveBeenCalledTimes(1);
      expect(tx.reservationChargeLine.createMany).toHaveBeenCalledTimes(1);
      expect(tx.reservationChargeLine.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ reservationId: "res-1", lineType: "ROOM_NIGHT" }),
          expect.objectContaining({ reservationId: "res-1", lineType: "EXTRA" }),
        ]),
      });
    });

    it("rolls back unassigned reservation when charge line persistence fails", async () => {
      const createdRes = {
        id: "res-unassigned",
        hotelId: "hotel-1",
        roomId: null,
        status: ReservationStatus.CONFIRMED,
      };
      const tx = {
        roomType: {
          findFirst: jest.fn().mockResolvedValue({ basePrice: new Prisma.Decimal(600000) }),
        },
        reservation: {
          create: jest.fn().mockResolvedValue(createdRes),
        },
        reservationChargeLine: {
          createMany: jest.fn().mockRejectedValue(new Error("CHARGE_LINE_WRITE_FAILED")),
        },
      };
      const prisma = {
        $transaction: jest.fn().mockImplementation(async (cb) => cb(tx)),
      };
      const repository = new ReservationsRepository(prisma as never);

      await expect(
        repository.createReservation({
          hotelId: "hotel-1",
          reservationCode: "RES-UNASSIGNED",
          guestDisplayName: "Unassigned Guest",
          plannedCheckInAt: new Date("2026-10-21T14:00:00.000Z"),
          plannedCheckOutAt: new Date("2026-10-23T12:00:00.000Z"),
          createdByUserId: "user-1",
          roomTypeId: "rt-1",
          chargeLines: [
            {
              lineType: "EXTRA",
              nameSnapshot: "Airport Pickup",
              quantity: 1,
              unitPriceSnapshot: 200000,
              totalSnapshot: 200000,
            },
          ],
        }),
      ).rejects.toThrow("CHARGE_LINE_WRITE_FAILED");

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.reservation.create).toHaveBeenCalledTimes(1);
      expect(tx.reservationChargeLine.createMany).toHaveBeenCalledTimes(1);
    });
  });

  describe("createBulkReservations & createReservation restricted actor scope (F1)", () => {
    it("allocates assigned room A when room B sorts first in candidates (positive candidate restriction)", async () => {
      // Room B sorts first alphabetically ("101" vs "102"), but actor is restricted to room A ("room-A")
      const roomA = {
        id: "room-A",
        hotelId: "hotel-1",
        roomNumber: "102",
        price: new Prisma.Decimal(500000),
        status: RoomStatus.AVAILABLE,
      };
      const createdRes = {
        id: "res-A",
        hotelId: "hotel-1",
        roomId: "room-A",
        status: ReservationStatus.CONFIRMED,
      };
      const roomAllocationService = {
        allocateRoom: jest.fn().mockImplementation(async (_tx, input) => {
          // Verify candidate restriction: requestedRoomId should be room-A and mode manual
          if (input.requestedRoomId === "room-A") {
            return {
              roomId: "room-A",
              roomNumber: "102",
              price: 500000,
              status: RoomStatus.AVAILABLE,
            };
          }
          // Otherwise would have returned room B sorting first
          return {
            roomId: "room-B",
            roomNumber: "101",
            price: 500000,
            status: RoomStatus.AVAILABLE,
          };
        }),
      };
      const tx = {
        $queryRawUnsafe: jest.fn().mockResolvedValue([]),
        room: {
          findMany: jest.fn().mockResolvedValue([roomA]),
        },
        reservation: {
          create: jest.fn().mockResolvedValue(createdRes),
        },
        guestStay: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };
      const prisma = {
        $transaction: jest.fn().mockImplementation(async (cb) => cb(tx)),
        reservation: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      const repository = new ReservationsRepository(prisma as never);

      const result = await repository.createBulkReservations({
        hotelId: "hotel-1",
        groupCode: "GRP-TEST",
        leadGuestName: "Lead Guest",
        checkInDate: new Date("2026-10-21T14:00:00.000Z"),
        checkOutDate: new Date("2026-10-23T12:00:00.000Z"),
        createdByUserId: "user-1",
        allocations: [{ roomTypeId: "rt-1", quantity: 1, rate: 500000 }],
        roomAllocationService,
        allowedRoomId: "room-A",
        generateReservationCode: jest.fn().mockResolvedValue("RES-001"),
      });

      expect(roomAllocationService.allocateRoom).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          requestedRoomId: "room-A",
          mode: "manual",
        }),
      );
      expect(result.reservations).toHaveLength(1);
      expect(result.reservations[0].roomId).toBe("room-A");
    });

    it("rejects restricted actor allocating room B while assigned A and performs no write on denial", async () => {
      const roomAllocationService = {
        allocateRoom: jest.fn().mockResolvedValue({
          roomId: "room-B", // Allocates room-B
          roomNumber: "101",
          price: 500000,
          status: RoomStatus.AVAILABLE,
        }),
      };
      const tx = {
        $queryRawUnsafe: jest.fn().mockResolvedValue([]),
        room: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        reservation: {
          create: jest.fn(),
        },
      };
      const prisma = {
        $transaction: jest.fn().mockImplementation(async (cb) => cb(tx)),
        reservation: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      const repository = new ReservationsRepository(prisma as never);

      const assertRoomAccessMock = jest.fn().mockImplementation((roomId: string) => {
        if (roomId !== "room-A") {
          throw new ConflictException("FORBIDDEN_ROOM_ACCESS");
        }
      });

      await expect(
        repository.createBulkReservations({
          hotelId: "hotel-1",
          groupCode: "GRP-TEST-DENY",
          leadGuestName: "Lead Guest",
          checkInDate: new Date("2026-10-21T14:00:00.000Z"),
          checkOutDate: new Date("2026-10-23T12:00:00.000Z"),
          createdByUserId: "user-1",
          allocations: [{ roomTypeId: "rt-1", quantity: 1, rate: 500000 }],
          roomAllocationService,
          assertRoomAccess: assertRoomAccessMock,
          generateReservationCode: jest.fn().mockResolvedValue("RES-001"),
        }),
      ).rejects.toThrow("FORBIDDEN_ROOM_ACCESS");

      // Verify no write on denial
      expect(tx.reservation.create).not.toHaveBeenCalled();
    });
  });
});
