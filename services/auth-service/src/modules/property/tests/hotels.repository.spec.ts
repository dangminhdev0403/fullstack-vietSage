import { BadRequestException, ConflictException } from "@nestjs/common";
import { readFileSync } from "fs";
import { join } from "path";
import { HotelsRepository } from "../infrastructure/repositories/hotels.repository";

function createRepository(tx: Record<string, unknown>) {
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };

  return new HotelsRepository(prisma as never);
}

describe("HotelsRepository stay creation", () => {
  it("generates and saves reservationCode inside the stay transaction", async () => {
    const tx = {
      guestStay: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: "stay-1",
          status: "RESERVED",
          checkedInAt: null,
          activatedAt: null,
          checkedOutAt: null,
          accessCodeExpiresAt: null,
          createdAt: new Date("2026-06-04T00:00:00.000Z"),
          updatedAt: new Date("2026-06-04T00:00:00.000Z"),
          ...data,
        })),
      },
      room: {
        update: jest.fn(),
      },
      folio: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "folio-1" }),
      },
      domainEvent: {
        create: jest.fn(),
      },
    };
    const repository = createRepository(tx);
    const generateReservationCode = jest.fn().mockResolvedValue("VSH_RESERVATION_0001");
    const generateFolioNumber = jest.fn().mockResolvedValue("VSH_FOLIO_0001");

    const result = await repository.createStay({
      hotelId: "hotel-1",
      roomId: "room-1",
      guestDisplayName: "Nguyen Van A",
      guestPhone: "0901234567",
      plannedCheckInAt: new Date("2026-06-10T07:00:00.000Z"),
      plannedCheckOutAt: new Date("2026-06-12T05:00:00.000Z"),
      createdByUserId: "actor-1",
      tenantId: "tenant-1",
      generateReservationCode,
      generateFolioNumber,
    });

    expect(generateReservationCode).toHaveBeenCalledWith(tx);
    expect(tx.guestStay.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reservationCode: "VSH_RESERVATION_0001",
        status: "RESERVED",
      }),
    });
    expect(result).toMatchObject({ reservationCode: "VSH_RESERVATION_0001" });
  });
});

describe("HotelsRepository QR activation", () => {
  it("activates the latest QR without an active stay and leaves it without expiry", async () => {
    const qr = { id: "qr-1" };
    const tx = {
      guestStay: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      roomQRCode: {
        findFirst: jest.fn().mockResolvedValue(qr),
        create: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => ({ ...qr, ...data })),
      },
      domainEvent: {
        create: jest.fn(),
      },
    };
    const repository = createRepository(tx);

    await expect(
      repository.activateQr({
        hotelId: "hotel-1",
        roomId: "room-1",
        tenantId: "tenant-1",
        publicCode: "token_new",
      }),
    ).resolves.toMatchObject({ id: "qr-1", status: "ACTIVE", expiresAt: null });

    expect(tx.guestStay.findFirst).toHaveBeenCalledWith({
      where: {
        hotelId: "hotel-1",
        roomId: "room-1",
        status: "ACTIVE",
      },
    });
    expect(tx.roomQRCode.create).not.toHaveBeenCalled();
  });

  it("creates and activates a room QR when none exists", async () => {
    const createdQr = { id: "qr-created" };
    const tx = {
      guestStay: {
        findFirst: jest.fn().mockResolvedValue({
          id: "stay-1",
          plannedCheckOutAt: new Date("2026-06-10T05:00:00.000Z"),
        }),
      },
      roomQRCode: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(createdQr),
        updateMany: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => ({ ...createdQr, ...data })),
      },
      domainEvent: {
        create: jest.fn(),
      },
    };
    const repository = createRepository(tx);

    await expect(
      repository.activateQr({
        hotelId: "hotel-1",
        roomId: "room-1",
        tenantId: "tenant-1",
        publicCode: "token_new",
      }),
    ).resolves.toMatchObject({
      id: "qr-created",
      status: "ACTIVE",
      expiresAt: new Date("2026-06-10T05:00:00.000Z"),
    });

    expect(tx.roomQRCode.findFirst).toHaveBeenCalledWith({
      where: {
        hotelId: "hotel-1",
        roomId: "room-1",
        status: { not: "REVOKED" },
      },
      orderBy: { version: "desc" },
    });
    expect(tx.roomQRCode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        hotelId: "hotel-1",
        roomId: "room-1",
        publicCode: "token_new",
        status: "INACTIVE",
        version: 1,
      }),
    });
  });
});
describe("HotelsRepository check-in QR creation", () => {
  it("activates an existing usable QR during check-in", async () => {
    const existingQr = {
      id: "qr-1",
      hotelId: "hotel-1",
      roomId: "room-1",
      publicCode: "token_existing",
      status: "INACTIVE",
      version: 1,
      activatedAt: null,
      deactivatedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: new Date("2026-06-10T00:00:00.000Z"),
      updatedAt: new Date("2026-06-10T00:00:00.000Z"),
    };
    const stay = {
      id: "stay-1",
      hotelId: "hotel-1",
      roomId: "room-1",
      reservationCode: "VSH_RESERVATION_0001",
      guestDisplayName: "Nguyen Van A",
      guestPhone: "0901234567",
      status: "ACTIVE",
      plannedCheckInAt: new Date("2026-06-10T07:00:00.000Z"),
      plannedCheckOutAt: new Date("2026-06-12T05:00:00.000Z"),
      checkedInAt: new Date("2026-06-10T07:00:00.000Z"),
      activatedAt: new Date("2026-06-10T07:00:00.000Z"),
      checkedOutAt: null,
      accessCodeExpiresAt: new Date("2026-06-11T07:00:00.000Z"),
      createdAt: new Date("2026-06-10T00:00:00.000Z"),
      updatedAt: new Date("2026-06-10T07:00:00.000Z"),
    };
    const tx = {
      roomQRCode: {
        findFirst: jest.fn().mockResolvedValue(existingQr),
        create: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => ({ ...existingQr, ...data })),
      },
      guestStay: {
        findFirst: jest.fn().mockResolvedValue({
          id: "stay-1",
          hotelId: "hotel-1",
          roomId: "room-1",
          status: "RESERVED",
        }),
        update: jest.fn().mockResolvedValue(stay),
      },
      room: {
        findFirst: jest.fn().mockResolvedValue({ id: "room-1", status: "AVAILABLE" }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      folio: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "folio-1" }),
      },
      domainEvent: {
        create: jest.fn(),
      },
    };
    const repository = createRepository(tx);

    const result = await repository.checkInStay({
      hotelId: "hotel-1",
      roomId: "room-1",
      stayId: "stay-1",
      actorUserId: "actor-1",
      accessCodeHash: "hash",
      accessCodeExpiresAt: new Date("2026-06-11T07:00:00.000Z"),
      tenantId: "tenant-1",
      generateFolioNumber: jest.fn().mockResolvedValue("VSH_FOLIO_0001"),
    });

    expect(tx.roomQRCode.create).not.toHaveBeenCalled();
    expect(tx.roomQRCode.update).toHaveBeenCalledWith({
      where: { id: "qr-1" },
      data: expect.objectContaining({
        status: "ACTIVE",
        deactivatedAt: null,
        expiresAt: stay.plannedCheckOutAt,
      }),
    });
    expect(result.roomQrCode).toMatchObject({ id: "qr-1", status: "ACTIVE" });
  });

  it("fails before changing an AVAILABLE room when QR config is missing", async () => {
    const tx = {
      room: {
        findFirst: jest.fn().mockResolvedValue({ id: "room-1", status: "AVAILABLE" }),
        updateMany: jest.fn(),
      },
      roomQRCode: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      guestStay: {
        create: jest.fn(),
      },
      domainEvent: {
        create: jest.fn(),
      },
    };
    const repository = createRepository(tx);

    await expect(
      repository.createAndCheckInStay({
        hotelId: "hotel-1",
        roomId: "room-1",
        guestDisplayName: "Nguyen Van A",
        plannedCheckInAt: new Date("2026-06-10T07:00:00.000Z"),
        plannedCheckOutAt: new Date("2026-06-12T05:00:00.000Z"),
        createdByUserId: "actor-1",
        actorUserId: "actor-1",
        accessCodeHash: "hash",
        accessCodeExpiresAt: new Date("2026-06-11T07:00:00.000Z"),
        tenantId: "tenant-1",
        generateReservationCode: jest.fn(),
      }),
    ).rejects.toThrow(
      new BadRequestException("Phòng chưa có QR. Vui lòng tạo QR trước khi check-in."),
    );

    expect(tx.room.updateMany).not.toHaveBeenCalled();
    expect(tx.guestStay.create).not.toHaveBeenCalled();
    expect(tx.roomQRCode.create).not.toHaveBeenCalled();
  });

  it("rejects missing stay input before creating stay or updating room", async () => {
    const tx = {
      room: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
      roomQRCode: {
        findFirst: jest.fn(),
      },
      guestStay: {
        create: jest.fn(),
      },
      domainEvent: {
        create: jest.fn(),
      },
    };
    const repository = createRepository(tx);

    await expect(
      repository.createAndCheckInStay({
        hotelId: "hotel-1",
        roomId: "room-1",
        guestDisplayName: " ",
        plannedCheckInAt: new Date("2026-06-10T07:00:00.000Z"),
        plannedCheckOutAt: new Date("2026-06-12T05:00:00.000Z"),
        createdByUserId: "actor-1",
        actorUserId: "actor-1",
        accessCodeHash: "hash",
        accessCodeExpiresAt: new Date("2026-06-11T07:00:00.000Z"),
        publicCode: "token_new",
        tenantId: "tenant-1",
        generateReservationCode: jest.fn(),
      }),
    ).rejects.toThrow(new BadRequestException("Tên khách là bắt buộc để check-in"));

    expect(tx.room.findFirst).not.toHaveBeenCalled();
    expect(tx.room.updateMany).not.toHaveBeenCalled();
    expect(tx.guestStay.create).not.toHaveBeenCalled();
  });

  it("reopens a checked-out RESERVED room when no active stay or blocking folio remains", async () => {
    const qr = {
      id: "qr-1",
      hotelId: "hotel-1",
      roomId: "room-1",
      publicCode: "token_existing",
      status: "INACTIVE",
      version: 1,
    };
    const stay = {
      id: "stay-new",
      hotelId: "hotel-1",
      roomId: "room-1",
      reservationCode: "VSH_RESERVATION_0002",
      guestDisplayName: "Tran Van B",
      guestPhone: null,
      status: "ACTIVE",
      plannedCheckInAt: new Date("2026-06-13T07:00:00.000Z"),
      plannedCheckOutAt: new Date("2026-06-15T05:00:00.000Z"),
      checkedInAt: new Date("2026-06-13T07:00:00.000Z"),
      activatedAt: new Date("2026-06-13T07:00:00.000Z"),
      checkedOutAt: null,
      accessCodeExpiresAt: new Date("2026-06-14T07:00:00.000Z"),
      createdAt: new Date("2026-06-13T00:00:00.000Z"),
      updatedAt: new Date("2026-06-13T07:00:00.000Z"),
    };
    const tx = {
      room: {
        findFirst: jest.fn().mockResolvedValue({ id: "room-1", status: "RESERVED" }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      guestStay: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(stay),
      },
      folio: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "folio-new" }),
      },
      roomQRCode: {
        findFirst: jest.fn().mockResolvedValue(qr),
        create: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => ({ ...qr, ...data })),
      },
      domainEvent: {
        create: jest.fn(),
      },
    };
    const repository = createRepository(tx);

    await expect(
      repository.createAndCheckInStay({
        hotelId: "hotel-1",
        roomId: "room-1",
        guestDisplayName: "Tran Van B",
        plannedCheckInAt: new Date("2026-06-13T07:00:00.000Z"),
        plannedCheckOutAt: new Date("2026-06-15T05:00:00.000Z"),
        createdByUserId: "actor-1",
        actorUserId: "actor-1",
        accessCodeHash: "hash",
        accessCodeExpiresAt: new Date("2026-06-14T07:00:00.000Z"),
        publicCode: "token_new",
        tenantId: "tenant-1",
        generateReservationCode: jest.fn().mockResolvedValue("VSH_RESERVATION_0002"),
        generateFolioNumber: jest.fn().mockResolvedValue("VSH_FOLIO_0002"),
      }),
    ).resolves.toMatchObject({ stay: { id: "stay-new" } });

    expect(tx.guestStay.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        roomId: "room-1",
        status: { in: ["ACTIVE", "CHECKED_IN", "CHECKOUT_PENDING"] },
      }),
    });
    expect(tx.folio.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        roomId: "room-1",
        status: { in: ["OPEN", "CHECKOUT_PENDING"] },
      }),
    });
    expect(tx.room.update).toHaveBeenCalledWith({
      where: { id: "room-1" },
      data: { status: "AVAILABLE" },
    });
    expect(tx.room.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "room-1",
        status: { in: ["AVAILABLE", "PROCESSING"] },
      }),
      data: { status: "OCCUPIED" },
    });
  });

  it("allows only one concurrent submit to claim an available room", async () => {
    const qr = {
      id: "qr-1",
      hotelId: "hotel-1",
      roomId: "room-1",
      publicCode: "token_existing",
      status: "INACTIVE",
      version: 1,
    };
    const stay = {
      id: "stay-1",
      hotelId: "hotel-1",
      roomId: "room-1",
      reservationCode: "VSH_RESERVATION_0001",
      guestDisplayName: "Nguyen Van A",
      guestPhone: null,
      status: "ACTIVE",
      plannedCheckInAt: new Date("2026-06-10T07:00:00.000Z"),
      plannedCheckOutAt: new Date("2026-06-12T05:00:00.000Z"),
      checkedInAt: new Date("2026-06-10T07:00:00.000Z"),
      activatedAt: new Date("2026-06-10T07:00:00.000Z"),
      checkedOutAt: null,
      accessCodeExpiresAt: new Date("2026-06-11T07:00:00.000Z"),
      createdAt: new Date("2026-06-10T00:00:00.000Z"),
      updatedAt: new Date("2026-06-10T07:00:00.000Z"),
    };
    const tx = {
      room: {
        findFirst: jest.fn().mockResolvedValue({ id: "room-1", status: "AVAILABLE" }),
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
      },
      roomQRCode: {
        findFirst: jest.fn().mockResolvedValue(qr),
        create: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => ({ ...qr, ...data })),
      },
      guestStay: {
        create: jest.fn().mockResolvedValue(stay),
      },
      folio: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "folio-1" }),
      },
      domainEvent: {
        create: jest.fn(),
      },
    };
    const repository = createRepository(tx);
    const input = {
      hotelId: "hotel-1",
      roomId: "room-1",
      guestDisplayName: "Nguyen Van A",
      plannedCheckInAt: new Date("2026-06-10T07:00:00.000Z"),
      plannedCheckOutAt: new Date("2026-06-12T05:00:00.000Z"),
      createdByUserId: "actor-1",
      actorUserId: "actor-1",
      accessCodeHash: "hash",
      accessCodeExpiresAt: new Date("2026-06-11T07:00:00.000Z"),
      publicCode: "token_new",
      tenantId: "tenant-1",
      generateReservationCode: jest.fn().mockResolvedValue("VSH_RESERVATION_0001"),
      generateFolioNumber: jest.fn().mockResolvedValue("VSH_FOLIO_0001"),
    };

    await expect(repository.createAndCheckInStay(input)).resolves.toMatchObject({
      stay: { id: "stay-1" },
      roomQrCode: { id: "qr-1", status: "ACTIVE" },
    });
    await expect(repository.createAndCheckInStay(input)).rejects.toThrow(
      new ConflictException("Phòng đang được check-in bởi yêu cầu khác"),
    );
  });

  it("includes a repair query for PROCESSING rooms without active stay or QR", () => {
    const sql = readFileSync(
      join(process.cwd(), "scripts", "repair-processing-rooms-without-active-stay-or-qr.sql"),
      "utf8",
    );

    expect(sql).toContain('UPDATE "Room" r');
    expect(sql).toContain("r.\"status\" = 'PROCESSING'");
    expect(sql).toContain("s.\"status\" IN ('RESERVED', 'ACTIVE', 'CHECKED_IN')");
    expect(sql).toContain("q.\"status\" = 'ACTIVE'");
    expect(sql).toContain("SET \"status\" = 'AVAILABLE'");
  });
});

describe("HotelsRepository QR rotation", () => {
  it("revokes old QR records and creates a new active QR record", async () => {
    const expiresAt = new Date("2026-06-10T05:00:00.000Z");
    const existingQr = {
      id: "qr-1",
      hotelId: "hotel-1",
      roomId: "room-1",
      publicCode: "token_old",
      status: "ACTIVE",
      version: 3,
      activatedAt: new Date("2026-06-09T08:00:00.000Z"),
      deactivatedAt: null,
      expiresAt,
      revokedAt: null,
      createdAt: new Date("2026-06-09T00:00:00.000Z"),
      updatedAt: new Date("2026-06-09T08:00:00.000Z"),
    };
    const tx = {
      roomQRCode: {
        findFirst: jest.fn().mockResolvedValue(existingQr),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
        create: jest.fn().mockImplementation(({ data }) => ({
          id: "qr-new",
          createdAt: new Date("2026-06-09T09:00:00.000Z"),
          updatedAt: new Date("2026-06-09T09:00:00.000Z"),
          ...data,
        })),
      },
      domainEvent: {
        create: jest.fn(),
      },
    };
    const repository = createRepository(tx);
    const newPublicCode = "token_new";

    const result = await repository.rotateQr({
      hotelId: "hotel-1",
      roomId: "room-1",
      tenantId: "tenant-1",
      publicCode: newPublicCode,
      reason: "Reset QR",
    });

    expect(tx.roomQRCode.findFirst).toHaveBeenCalledWith({
      where: { hotelId: "hotel-1", roomId: "room-1" },
      orderBy: { version: "desc" },
    });
    expect(tx.roomQRCode.updateMany).toHaveBeenCalledWith({
      where: {
        hotelId: "hotel-1",
        roomId: "room-1",
        status: { not: "REVOKED" },
      },
      data: {
        status: "REVOKED",
        deactivatedAt: expect.any(Date),
        revokedAt: expect.any(Date),
      },
    });
    expect(tx.roomQRCode.update).not.toHaveBeenCalled();
    expect(tx.roomQRCode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        hotelId: "hotel-1",
        roomId: "room-1",
        publicCode: newPublicCode,
        status: "ACTIVE",
        version: 4,
        expiresAt,
        revokedAt: null,
      }),
    });
    expect(result).toMatchObject({
      id: "qr-new",
      publicCode: newPublicCode,
      status: "ACTIVE",
      version: 4,
    });
    expect(result.publicCode).not.toBe("token_old");
    expect(tx.domainEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "ROOM_QR_ROTATED",
        aggregateId: "qr-new",
        payload: { roomId: "room-1", reason: "Reset QR", previousQrCodeId: "qr-1" },
      }),
    });
  });

  it("creates an inactive replacement when rotating an inactive QR", async () => {
    const existingQr = {
      id: "qr-1",
      hotelId: "hotel-1",
      roomId: "room-1",
      publicCode: "token_old",
      status: "INACTIVE",
      version: 1,
    };
    const tx = {
      roomQRCode: {
        findFirst: jest.fn().mockResolvedValue(existingQr),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
        create: jest.fn().mockImplementation(({ data }) => ({ id: "qr-new", ...data })),
      },
      domainEvent: {
        create: jest.fn(),
      },
    };
    const repository = createRepository(tx);

    await expect(
      repository.rotateQr({
        hotelId: "hotel-1",
        roomId: "room-1",
        tenantId: "tenant-1",
        publicCode: "token_new",
      }),
    ).resolves.toMatchObject({
      id: "qr-new",
      status: "INACTIVE",
      version: 2,
    });

    expect(tx.roomQRCode.update).not.toHaveBeenCalled();
    expect(tx.roomQRCode.create.mock.calls[0][0].data).toMatchObject({
      publicCode: "token_new",
      status: "INACTIVE",
      version: 2,
      activatedAt: null,
      expiresAt: null,
      revokedAt: null,
    });
  });

  it("creates the first room QR when rotating a room without QR", async () => {
    const tx = {
      roomQRCode: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn(),
        create: jest.fn().mockImplementation(({ data }) => ({
          id: "qr-created",
          activatedAt: null,
          deactivatedAt: null,
          expiresAt: null,
          revokedAt: null,
          createdAt: new Date("2026-06-10T00:00:00.000Z"),
          updatedAt: new Date("2026-06-10T00:00:00.000Z"),
          ...data,
        })),
      },
      domainEvent: {
        create: jest.fn(),
      },
    };
    const repository = createRepository(tx);

    await expect(
      repository.rotateQr({
        hotelId: "hotel-1",
        roomId: "room-1",
        tenantId: "tenant-1",
        publicCode: "token_new",
      }),
    ).resolves.toMatchObject({
      id: "qr-created",
      hotelId: "hotel-1",
      roomId: "room-1",
      publicCode: "token_new",
      status: "INACTIVE",
      version: 1,
    });

    expect(tx.roomQRCode.update).not.toHaveBeenCalled();
    expect(tx.roomQRCode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        hotelId: "hotel-1",
        roomId: "room-1",
        publicCode: "token_new",
        status: "INACTIVE",
        version: 1,
      }),
    });
  });
});
