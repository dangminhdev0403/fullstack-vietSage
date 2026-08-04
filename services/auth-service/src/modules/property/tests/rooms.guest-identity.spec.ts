import { createStayBodySchema } from "../domain/schemas/rooms.schema";
import { HotelRoomsRepository } from "../infrastructure/repositories/hotel-rooms.repository";

const stayInput = {
  roomId: "room-1",
  guestDisplayName: "Nguyen Van A",
  plannedCheckInAt: "2026-07-31T10:00:00.000Z",
  plannedCheckOutAt: "2026-08-01T10:00:00.000Z",
};

describe("guest stay CCCD identity", () => {
  it.each(["123456789", " 034205005951 "])(
    "accepts and trims a valid identity number: %s",
    (value) => {
      expect(
        createStayBodySchema.parse({ ...stayInput, guestIdentityNumber: value })
          .guestIdentityNumber,
      ).toBe(value.trim());
    },
  );

  it.each(["12345678", "1234567890123", "03420A005951"])(
    "rejects an invalid identity number: %s",
    (value) => {
      expect(
        createStayBodySchema.safeParse({ ...stayInput, guestIdentityNumber: value }).success,
      ).toBe(false);
    },
  );

  it("keeps manual check-in valid without an identity number", () => {
    expect(createStayBodySchema.safeParse(stayInput).success).toBe(true);
  });

  it("persists the identity number when creating a reservation stay", async () => {
    const tx = {
      guestStay: { create: jest.fn().mockResolvedValue({ id: "stay-1" }) },
      folio: {
        findFirst: jest.fn().mockResolvedValue({ id: "folio-1" }),
        create: jest.fn(),
      },
      room: { update: jest.fn() },
      domainEvent: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new HotelRoomsRepository(prisma as never);

    await repository.createStay({
      hotelId: "hotel-1",
      roomId: "room-1",
      guestDisplayName: "Nguyen Van A",
      guestIdentityNumber: "034205005951",
      plannedCheckInAt: new Date(stayInput.plannedCheckInAt),
      plannedCheckOutAt: new Date(stayInput.plannedCheckOutAt),
      createdByUserId: "staff-1",
      tenantId: "tenant-1",
      generateReservationCode: async () => "RES-1",
      generateFolioNumber: async () => "FOLIO-1",
    });

    expect(tx.guestStay.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ guestIdentityNumber: "034205005951" }),
      }),
    );
  });

  it("accepts and persists optional guest identity attributes", async () => {
    const fullPayload = {
      ...stayInput,
      guestIdentityNumber: "034205005951",
      guestDateOfBirth: "1990-01-01",
      guestGender: "Nam",
      guestNationality: "Việt Nam",
      guestResidencePlace: "Lào Cai, Việt Nam",
    };
    const parsed = createStayBodySchema.parse(fullPayload);
    expect(parsed.guestDateOfBirth).toBe("1990-01-01");
    expect(parsed.guestGender).toBe("Nam");
    expect(parsed.guestNationality).toBe("Việt Nam");
    expect(parsed.guestResidencePlace).toBe("Lào Cai, Việt Nam");

    const tx = {
      guestStay: { create: jest.fn().mockResolvedValue({ id: "stay-1" }) },
      folio: {
        findFirst: jest.fn().mockResolvedValue({ id: "folio-1" }),
        create: jest.fn(),
      },
      room: { update: jest.fn() },
      domainEvent: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new HotelRoomsRepository(prisma as never);

    await repository.createStay({
      hotelId: "hotel-1",
      roomId: "room-1",
      guestDisplayName: "Nguyen Van A",
      guestIdentityNumber: "034205005951",
      guestDateOfBirth: "1990-01-01",
      guestGender: "Nam",
      guestNationality: "Việt Nam",
      guestResidencePlace: "Lào Cai, Việt Nam",
      plannedCheckInAt: new Date(stayInput.plannedCheckInAt),
      plannedCheckOutAt: new Date(stayInput.plannedCheckOutAt),
      createdByUserId: "staff-1",
      tenantId: "tenant-1",
      generateReservationCode: async () => "RES-1",
      generateFolioNumber: async () => "FOLIO-1",
    });

    expect(tx.guestStay.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          guestIdentityNumber: "034205005951",
          guestDateOfBirth: "1990-01-01",
          guestGender: "Nam",
          guestNationality: "Việt Nam",
          guestResidencePlace: "Lào Cai, Việt Nam",
        }),
      }),
    );
  });

  it("persists the primary guest and every co-guest in a reservation stay", async () => {
    const tx = {
      guestStay: { create: jest.fn().mockResolvedValue({ id: "stay-1" }) },
      folio: {
        findFirst: jest.fn().mockResolvedValue({ id: "folio-1" }),
        create: jest.fn(),
      },
      room: { update: jest.fn() },
      domainEvent: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new HotelRoomsRepository(prisma as never);

    await repository.createStay({
      hotelId: "hotel-1",
      roomId: "room-1",
      guestDisplayName: "Nguyen Van A",
      guestIdentityNumber: "034205005951",
      guestNationality: "Việt Nam",
      guestResidencePlace: "Lào Cai",
      occupants: [
        { fullName: "Tran Thi B", identityNumber: "034205005952", nationality: "Việt Nam", residencePlace: "Hà Nội" },
        { fullName: "Le Van C", identityNumber: "034205005953", nationality: "Việt Nam", residencePlace: "Đà Nẵng" },
      ],
      plannedCheckInAt: new Date(stayInput.plannedCheckInAt),
      plannedCheckOutAt: new Date(stayInput.plannedCheckOutAt),
      createdByUserId: "staff-1",
      tenantId: "tenant-1",
      generateReservationCode: async () => "RES-1",
      generateFolioNumber: async () => "FOLIO-1",
    });

    expect(tx.guestStay.create.mock.calls[0][0].data.occupants.create).toEqual([
      expect.objectContaining({ fullName: "Nguyen Van A", isPrimary: true, nationality: "Việt Nam", residencePlace: "Lào Cai" }),
      expect.objectContaining({ fullName: "Tran Thi B", isPrimary: false, nationality: "Việt Nam", residencePlace: "Hà Nội" }),
      expect.objectContaining({ fullName: "Le Van C", isPrimary: false, nationality: "Việt Nam", residencePlace: "Đà Nẵng" }),
    ]);
  });
});
