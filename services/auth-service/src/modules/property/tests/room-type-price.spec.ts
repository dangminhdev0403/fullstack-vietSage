import { BadRequestException } from "@nestjs/common";
import { HotelRoomsRepository } from "../infrastructure/repositories/hotel-rooms.repository";
import { ChannexSyncService } from "../../channel-manager/services/channex-sync.service";
import { ChannexAriSyncService } from "../../channel-manager/services/channex-ari-sync.service";

describe("hotel room type price boundary", () => {
  it("does not create a room or QR when a selected type belongs to another hotel", async () => {
    const tx = {
      roomType: { findFirst: jest.fn().mockResolvedValue(null) },
      room: { create: jest.fn() },
      roomQRCode: { create: jest.fn() },
    };
    const prisma = { $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) };
    const repository = new HotelRoomsRepository(prisma as never);
    await expect(
      repository.createRoomWithQr({
        hotelId: "hotel-a",
        roomTypeId: "type-in-hotel-b",
        roomNumber: "201",
        code: "R-201",
        publicCode: "qr-code",
      }),
    ).rejects.toThrow("Loại phòng không thuộc khách sạn này");
    expect(tx.room.create).not.toHaveBeenCalled();
    expect(tx.roomQRCode.create).not.toHaveBeenCalled();
  });

  it("keeps a new catalog row inside the room/QR transaction", async () => {
    const tx = {
      roomType: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({
          id: "type-1",
          hotelId: "hotel-a",
          name: "Deluxe",
          basePrice: 1_200_000,
        }),
      },
      room: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: "room-1" }),
      },
      roomQRCode: { create: jest.fn().mockRejectedValue(new Error("QR write failed")) },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const repository = new HotelRoomsRepository(prisma as never);
    await expect(
      repository.createRoomWithQr({
        hotelId: "hotel-a",
        newRoomType: { name: "Deluxe", basePrice: 1_200_000 },
        roomNumber: "201",
        code: "R-201",
        publicCode: "qr-code",
      }),
    ).rejects.toThrow("QR write failed");
    expect(tx.roomType.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ normalizedKey: "deluxe", basePrice: 1_200_000 }),
      }),
    );
    expect(tx.room.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ roomTypeId: "type-1", price: 1_200_000 }),
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("does not register a conflicting legacy type price before explicit reconciliation", async () => {
    const prisma = {
      roomType: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      room: {
        findMany: jest.fn().mockResolvedValue([
          { type: "Suite", price: 2_200_000 },
          { type: " suite ", price: 5_000_000 },
        ]),
      },
    };
    const repository = new HotelRoomsRepository(prisma as never);
    await expect(repository.createRoomType("hotel-a", "Suite", 2_000_000)).rejects.toThrow(
      "Đối soát",
    );
    expect(prisma.roomType.create).not.toHaveBeenCalled();
  });

  it("rejects an unpriced legacy Suite before any Channex write", async () => {
    const prisma = {
      hotel: {
        findUnique: jest.fn().mockResolvedValue({
          id: "hotel-a",
          rooms: [{ id: "room-1", type: "Suite", price: 2_200_000 }],
          roomTypes: [],
        }),
      },
      channelConnection: { create: jest.fn() },
    };
    const provider = { createProperty: jest.fn(), updateProperty: jest.fn() };
    const sync = new ChannexSyncService(prisma as never, provider as never);
    await expect(sync.syncContent("hotel-a")).rejects.toThrow(BadRequestException);
    expect(prisma.channelConnection.create).not.toHaveBeenCalled();
    expect(provider.createProperty).not.toHaveBeenCalled();
    expect(provider.updateProperty).not.toHaveBeenCalled();
  });

  it("rejects an unsupported Channex currency before changing the property", async () => {
    const prisma = {
      hotel: {
        findUnique: jest.fn().mockResolvedValue({
          id: "hotel-a",
          name: "Test Hotel",
          rooms: [{ roomNumber: "201", type: "Suite", roomTypeId: "catalog-suite" }],
          roomTypes: [
            {
              id: "catalog-suite",
              hotelId: "hotel-a",
              name: "Suite",
              normalizedKey: "suite",
              basePrice: 2_000_000,
            },
          ],
        }),
      },
      channexMapping: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ channexId: "remote-property" }),
      },
      channelConnection: { findFirst: jest.fn().mockResolvedValue({ id: "connection-1" }) },
    };
    const provider = {
      getProperty: jest.fn().mockResolvedValue({ data: { attributes: { currency: "USD" } } }),
      getBaseUrl: jest.fn().mockReturnValue("https://staging.channex.io/api/v1"),
      updateProperty: jest.fn(),
      createProperty: jest.fn(),
    };
    const sync = new ChannexSyncService(prisma as never, provider as never);
    await expect(sync.syncContent("hotel-a")).rejects.toThrow("Không hỗ trợ quy đổi giá");
    expect(provider.updateProperty).not.toHaveBeenCalled();
    expect(provider.createProperty).not.toHaveBeenCalled();
  });

  it("rejects conflicting legacy and catalog mappings before provider writes", async () => {
    const prisma = {
      hotel: {
        findUnique: jest.fn().mockResolvedValue({
          id: "hotel-a",
          rooms: [
            {
              id: "room-1",
              roomNumber: "201",
              type: "Suite",
              roomTypeId: "catalog-suite",
              roomType: {
                id: "catalog-suite",
                hotelId: "hotel-a",
                name: "Suite",
                normalizedKey: "suite",
                basePrice: 2_200_000,
              },
            },
          ],
          roomTypes: [],
        }),
      },
      channexMapping: {
        findMany: jest.fn().mockResolvedValue([
          { kind: "room_type", localId: "Suite", channexId: "remote-old" },
          { kind: "room_type", localId: "catalog-suite", channexId: "remote-new" },
        ]),
      },
      channelConnection: { create: jest.fn() },
    };
    const provider = { createProperty: jest.fn(), updateProperty: jest.fn() };
    const sync = new ChannexSyncService(prisma as never, provider as never);
    await expect(sync.syncContent("hotel-a")).rejects.toThrow("xung đột");
    expect(prisma.channelConnection.create).not.toHaveBeenCalled();
    expect(provider.createProperty).not.toHaveBeenCalled();
    expect(provider.updateProperty).not.toHaveBeenCalled();
  });

  it("rejects an unpriced ARI cell before posting availability or rates", async () => {
    const prisma = {
      channexMapping: {
        findUnique: jest.fn().mockResolvedValue({ channexId: "property-1" }),
        findMany: jest.fn().mockResolvedValue([
          { kind: "room_type", localId: "Suite", channexId: "remote-type" },
          { kind: "rate_plan", localId: "Suite:STANDARD", channexId: "remote-rate" },
        ]),
      },
      roomType: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const ariCore = {
      getInventoryGrid: jest.fn().mockResolvedValue({
        roomTypes: [{ roomType: "Suite", days: [{ date: "2099-01-01", rate: null }] }],
      }),
    };
    const provider = {
      getProperty: jest.fn().mockResolvedValue({ data: { attributes: { currency: "VND" } } }),
      getBaseUrl: jest.fn().mockReturnValue("https://staging.channex.io/api/v1"),
      postAvailability: jest.fn(),
      postRestrictions: jest.fn(),
    };
    const sync = new ChannexAriSyncService(prisma as never, ariCore as never, provider as never);
    await expect(
      sync.pushAri("hotel-a", { startDate: "2099-01-01", endDate: "2099-01-01" }),
    ).rejects.toThrow("Suite");
    expect(provider.postAvailability).not.toHaveBeenCalled();
    expect(provider.postRestrictions).not.toHaveBeenCalled();
  });

  it("rejects a missing rate-plan mapping before posting another type's availability", async () => {
    const prisma = {
      channexMapping: {
        findUnique: jest.fn().mockResolvedValue({ channexId: "property-1" }),
        findMany: jest.fn().mockResolvedValue([
          { kind: "room_type", localId: "catalog-suite", channexId: "remote-suite" },
          { kind: "rate_plan", localId: "catalog-suite:STANDARD", channexId: "remote-rate" },
          { kind: "room_type", localId: "catalog-double", channexId: "remote-double" },
        ]),
      },
      roomType: {
        findMany: jest.fn().mockResolvedValue([
          { id: "catalog-suite", name: "Suite", normalizedKey: "suite", basePrice: 2_000_000 },
          { id: "catalog-double", name: "Double", normalizedKey: "double", basePrice: 1_000_000 },
        ]),
      },
    };
    const ariCore = {
      getInventoryGrid: jest.fn().mockResolvedValue({
        roomTypes: [
          {
            roomType: "Suite",
            days: [
              { date: "2099-01-01", rate: 2_000_000, availableRooms: 2, overrideAvailable: null },
            ],
          },
          {
            roomType: "Double",
            days: [
              { date: "2099-01-01", rate: 1_000_000, availableRooms: 2, overrideAvailable: null },
            ],
          },
        ],
      }),
      collapseDateRanges: jest.fn((items: Array<{ date: string }>) =>
        items.map((item) => ({
          startDate: item.date,
          endDate: item.date,
          data: item,
        })),
      ),
    };
    const provider = {
      getProperty: jest.fn().mockResolvedValue({ data: { attributes: { currency: "VND" } } }),
      getBaseUrl: jest.fn().mockReturnValue("https://staging.channex.io/api/v1"),
      postAvailability: jest.fn(),
      postRestrictions: jest.fn(),
    };
    const sync = new ChannexAriSyncService(prisma as never, ariCore as never, provider as never);
    await expect(
      sync.pushAri("hotel-a", { startDate: "2099-01-01", endDate: "2099-01-01" }),
    ).rejects.toThrow("Double");
    expect(provider.postAvailability).not.toHaveBeenCalled();
    expect(provider.postRestrictions).not.toHaveBeenCalled();
  });

  it("rejects conflicting catalog mappings before availability-only push", async () => {
    const prisma = {
      channexMapping: {
        findUnique: jest.fn().mockResolvedValue({ channexId: "property-1" }),
        findMany: jest.fn().mockResolvedValue([
          { kind: "room_type", localId: "Suite", channexId: "remote-old" },
          { kind: "room_type", localId: "catalog-suite", channexId: "remote-new" },
        ]),
      },
      roomType: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: "catalog-suite", name: "Suite", normalizedKey: "suite", basePrice: null },
          ]),
      },
    };
    const ariCore = {
      getInventoryGrid: jest.fn().mockResolvedValue({
        roomTypes: [{ roomType: "Suite", days: [{ date: "2099-01-01", availableRooms: 2 }] }],
      }),
    };
    const provider = { postAvailability: jest.fn(), postRestrictions: jest.fn() };
    const sync = new ChannexAriSyncService(prisma as never, ariCore as never, provider as never);
    await expect(
      sync.pushAri("hotel-a", {
        startDate: "2099-01-01",
        endDate: "2099-01-01",
        availabilityOnly: true,
      }),
    ).rejects.toThrow("xung đột");
    expect(provider.postAvailability).not.toHaveBeenCalled();

    prisma.channexMapping.findMany.mockResolvedValue([
      { kind: "room_type", localId: "Suite", channexId: "remote-old" },
      { kind: "room_type", localId: " suite ", channexId: "remote-new" },
    ]);
    await expect(
      sync.pushAri("hotel-a", {
        startDate: "2099-01-01",
        endDate: "2099-01-01",
        availabilityOnly: true,
      }),
    ).rejects.toThrow("xung đột");
    expect(provider.postAvailability).not.toHaveBeenCalled();
  });

  it("rejects an unmapped type before availability-only push", async () => {
    const prisma = {
      channexMapping: {
        findUnique: jest.fn().mockResolvedValue({ channexId: "property-1" }),
        findMany: jest
          .fn()
          .mockResolvedValue([{ kind: "room_type", localId: "Suite", channexId: "remote-suite" }]),
      },
      roomType: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const ariCore = {
      getInventoryGrid: jest.fn().mockResolvedValue({
        roomTypes: [
          { roomType: "Suite", days: [{ date: "2099-01-01", availableRooms: 2 }] },
          { roomType: "Double", days: [{ date: "2099-01-01", availableRooms: 3 }] },
        ],
      }),
      collapseDateRanges: jest.fn((items: Array<{ date: string; availability: number }>) =>
        items.map((item) => ({ startDate: item.date, endDate: item.date, data: item })),
      ),
    };
    const provider = { postAvailability: jest.fn(), postRestrictions: jest.fn() };
    const sync = new ChannexAriSyncService(prisma as never, ariCore as never, provider as never);
    await expect(
      sync.pushAri("hotel-a", {
        startDate: "2099-01-01",
        endDate: "2099-01-01",
        availabilityOnly: true,
      }),
    ).rejects.toThrow("Double");
    expect(provider.postAvailability).not.toHaveBeenCalled();
    expect(provider.postRestrictions).not.toHaveBeenCalled();
  });

  it("pushes availability without a catalog price or rate write", async () => {
    const prisma = {
      channexMapping: {
        findUnique: jest.fn().mockResolvedValue({ channexId: "property-1" }),
        findMany: jest.fn().mockResolvedValue([
          { kind: "room_type", localId: "Suite", channexId: "remote-type" },
          { kind: "rate_plan", localId: "Suite:STANDARD", channexId: "remote-rate" },
        ]),
      },
      roomType: { findMany: jest.fn().mockResolvedValue([]) },
      channelSyncLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const ariCore = {
      getInventoryGrid: jest.fn().mockResolvedValue({
        roomTypes: [
          {
            roomType: "Suite",
            days: [
              {
                date: "2099-01-01",
                rate: null,
                availableRooms: 2,
                overrideAvailable: null,
              },
            ],
          },
        ],
      }),
      collapseDateRanges: jest.fn((items: Array<{ date: string; availability: number }>) =>
        items.map((item) => ({
          startDate: item.date,
          endDate: item.date,
          data: item,
        })),
      ),
    };
    const provider = {
      getProperty: jest.fn(),
      postAvailability: jest.fn().mockResolvedValue({ data: {} }),
      postRestrictions: jest.fn(),
      getAvailability: jest
        .fn()
        .mockResolvedValue({ data: { "remote-type": { "2099-01-01": 2 } } }),
      getRestrictions: jest.fn(),
    };
    const sync = new ChannexAriSyncService(prisma as never, ariCore as never, provider as never);
    const result = await sync.pushAri("hotel-a", {
      startDate: "2099-01-01",
      endDate: "2099-01-01",
      availabilityOnly: true,
    });
    expect(result.targetCurrency).toBe("NOT_APPLICABLE");
    expect(result.readbackVerified.availabilityMatch).toBe(true);
    expect(provider.getProperty).not.toHaveBeenCalled();
    expect(provider.postRestrictions).not.toHaveBeenCalled();
    expect(provider.getRestrictions).not.toHaveBeenCalled();
  });
});
