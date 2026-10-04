process.env.DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock";
process.env.NODE_ENV = "test";
process.env.PORT = "3000";
process.env.JWT_ACCESS_SECRET = "mock-secret-at-least-32-characters-long";
process.env.JWT_REFRESH_SECRET = "mock-refresh-secret-at-least-32-chars";
process.env.JWT_ACCESS_TTL = "15m";
process.env.JWT_REFRESH_TTL = "7d";

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ChannexApiClient } from "./services/channex-api-client.service";
import { ChannexSyncService } from "./services/channex-sync.service";

describe("Channex Content Sync Reconciliation Suite", () => {
  let mockPrisma: any;
  let mockApiClient: any;
  let syncService: ChannexSyncService;

  beforeEach(() => {
    mockPrisma = {
      hotel: {
        findUnique: jest.fn(),
      },
      room: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      roomType: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      channelConnection: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      channexMapping: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      channelSyncLog: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
      },
    };

    mockApiClient = {
      getBaseUrl: jest.fn(() => "https://staging.channex.io/api/v1"),
      isConfigured: jest.fn(() => true),
      getProperties: jest.fn(),
      getProperty: jest.fn().mockResolvedValue({
        data: { attributes: { currency: "VND" } },
      }),
      createProperty: jest.fn(),
      updateProperty: jest.fn(),
      getRoomTypes: jest.fn().mockResolvedValue({ data: [] }),
      createRoomType: jest.fn(),
      updateRoomType: jest.fn(),
      getRatePlans: jest.fn().mockResolvedValue({ data: [] }),
      getRatePlanOptions: jest.fn(),
      createRatePlan: jest.fn(),
      updateRatePlan: jest.fn(),
      getWebhooks: jest.fn().mockResolvedValue({ data: [] }),
      registerWebhook: jest.fn().mockResolvedValue({ data: { id: "wh_1" } }),
    };

    syncService = new ChannexSyncService(mockPrisma, mockApiClient);
  });

  const setupDefaultHotel = (hotelId = "hotel_rec_1") => {
    mockPrisma.hotel.findUnique.mockResolvedValue({
      id: hotelId,
      name: "VietSage Reconcile Hotel",
      rooms: [
        { id: "r1", type: "DELUXE", price: 1500000 },
        { id: "r2", type: "SUITE", price: 3000000 },
      ],
      roomTypes: [
        {
          id: "catalog-DELUXE",
          hotelId,
          name: "DELUXE",
          normalizedKey: "deluxe",
          basePrice: 1500000,
        },
        {
          id: "catalog-SUITE",
          hotelId,
          name: "SUITE",
          normalizedKey: "suite",
          basePrice: 3000000,
        },
      ],
    });
    mockPrisma.channelConnection.findFirst.mockResolvedValue({ id: "conn_chx_1" });
  };

  it("không tự động tạo lại room type trên Channex khi update bị 404 (giữ nguyên mapping, yêu cầu đối soát)", async () => {
    const hotelId = "hotel_rec_1";
    mockPrisma.hotel.findUnique.mockResolvedValue({
      id: hotelId,
      name: "VietSage Hotel",
      rooms: [{ id: "r1", type: "DELUXE", price: 1500000 }],
      roomTypes: [
        {
          id: "catalog-DELUXE",
          hotelId,
          name: "DELUXE",
          normalizedKey: "deluxe",
          basePrice: 1500000,
        },
      ],
    });
    mockPrisma.channelConnection.findFirst.mockResolvedValue({ id: "conn_chx_1" });

    mockPrisma.channexMapping.findUnique.mockImplementation(({ where }: any) => {
      if (where.hotelId_kind_localId.kind === "property") {
        return Promise.resolve({ id: "map_p", channexId: "prop_existing" });
      }
      if (where.hotelId_kind_localId.kind === "room_type") {
        return Promise.resolve({ id: "map_rt", channexId: "rt_existing_404" });
      }
      return Promise.resolve(null);
    });

    mockApiClient.updateProperty.mockResolvedValue({ data: { id: "prop_existing" } });
    mockApiClient.updateRoomType.mockRejectedValue(new NotFoundException("Room type not found"));

    await expect(syncService.syncContent(hotelId)).rejects.toThrow(/đối soát/i);
    expect(mockApiClient.createRoomType).not.toHaveBeenCalled();
    expect(mockPrisma.channexMapping.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "map_rt" },
      }),
    );
  });

  it("không tự động tạo lại rate plan trên Channex khi update bị 404 (giữ nguyên mapping, yêu cầu đối soát)", async () => {
    const hotelId = "hotel_rec_1";
    mockPrisma.hotel.findUnique.mockResolvedValue({
      id: hotelId,
      name: "VietSage Hotel",
      rooms: [{ id: "r1", type: "DELUXE", price: 1500000 }],
      roomTypes: [
        {
          id: "catalog-DELUXE",
          hotelId,
          name: "DELUXE",
          normalizedKey: "deluxe",
          basePrice: 1500000,
        },
      ],
    });
    mockPrisma.channelConnection.findFirst.mockResolvedValue({ id: "conn_chx_1" });

    mockPrisma.channexMapping.findUnique.mockImplementation(({ where }: any) => {
      if (where.hotelId_kind_localId.kind === "property") {
        return Promise.resolve({ id: "map_p", channexId: "prop_existing" });
      }
      if (where.hotelId_kind_localId.kind === "room_type") {
        return Promise.resolve({ id: "map_rt", channexId: "rt_existing" });
      }
      if (where.hotelId_kind_localId.kind === "rate_plan") {
        return Promise.resolve({ id: "map_rp", channexId: "rp_existing_404" });
      }
      return Promise.resolve(null);
    });

    mockApiClient.updateProperty.mockResolvedValue({ data: { id: "prop_existing" } });
    mockApiClient.updateRoomType.mockResolvedValue({ data: { id: "rt_existing" } });
    mockApiClient.updateRatePlan.mockRejectedValue(new NotFoundException("Rate plan not found"));

    await expect(syncService.syncContent(hotelId)).rejects.toThrow(/đối soát/i);
    expect(mockApiClient.createRatePlan).not.toHaveBeenCalled();
  });

  it("phát hiện và từ chối tạo mới khi room type đã tồn tại trên Channex nhưng DB chưa có mapping (tránh duplicate khi retry)", async () => {
    const hotelId = "hotel_rec_1";
    mockPrisma.hotel.findUnique.mockResolvedValue({
      id: hotelId,
      name: "VietSage Hotel",
      rooms: [{ id: "r1", type: "DELUXE", price: 1500000 }],
      roomTypes: [
        {
          id: "catalog-DELUXE",
          hotelId,
          name: "DELUXE",
          normalizedKey: "deluxe",
          basePrice: 1500000,
        },
      ],
    });
    mockPrisma.channelConnection.findFirst.mockResolvedValue({ id: "conn_chx_1" });
    mockPrisma.channexMapping.findUnique.mockImplementation(({ where }: any) => {
      if (where.hotelId_kind_localId.kind === "property") {
        return Promise.resolve({ id: "map_p", channexId: "prop_existing" });
      }
      return Promise.resolve(null);
    });

    mockApiClient.updateProperty.mockResolvedValue({ data: { id: "prop_existing" } });
    mockApiClient.getRoomTypes.mockResolvedValue({
      data: [
        {
          id: "rt_unmapped_channex",
          attributes: { title: "DELUXE", property_id: "prop_existing" },
        },
      ],
    });

    await expect(syncService.syncContent(hotelId)).rejects.toThrow(/đã tồn tại trên Channex/i);
    expect(mockApiClient.createRoomType).not.toHaveBeenCalled();
  });

  it("không tạo mới khi không tải được danh sách remote để đối soát", async () => {
    setupDefaultHotel();
    mockPrisma.channexMapping.findUnique.mockResolvedValue({ id: "map_p", channexId: "prop_1" });
    mockApiClient.updateProperty.mockResolvedValue({ data: { id: "prop_1" } });
    mockApiClient.getRoomTypes.mockRejectedValue(new Error("remote timeout"));

    await expect(syncService.syncContent("hotel_rec_1")).rejects.toThrow(/đối soát/i);
    expect(mockApiClient.createRoomType).not.toHaveBeenCalled();
    expect(mockApiClient.createRatePlan).not.toHaveBeenCalled();
  });

  it("báo cáo ID Channex đã tạo khi lưu mapping CSDL thất bại (không nuốt mất ID remote)", async () => {
    const hotelId = "hotel_rec_1";
    mockPrisma.hotel.findUnique.mockResolvedValue({
      id: hotelId,
      name: "VietSage Hotel",
      rooms: [{ id: "r1", type: "DELUXE", price: 1500000 }],
      roomTypes: [
        {
          id: "catalog-DELUXE",
          hotelId,
          name: "DELUXE",
          normalizedKey: "deluxe",
          basePrice: 1500000,
        },
      ],
    });
    mockPrisma.channelConnection.findFirst.mockResolvedValue({ id: "conn_chx_1" });
    mockPrisma.channexMapping.findUnique.mockImplementation(({ where }: any) => {
      if (where.hotelId_kind_localId.kind === "property") {
        return Promise.resolve({ id: "map_p", channexId: "prop_existing" });
      }
      return Promise.resolve(null);
    });

    mockApiClient.updateProperty.mockResolvedValue({ data: { id: "prop_existing" } });
    mockApiClient.getRoomTypes.mockResolvedValue({ data: [] });
    mockApiClient.createRoomType.mockResolvedValue({ data: { id: "rt_created_remote_id" } });
    mockPrisma.channexMapping.create.mockRejectedValue(new Error("Prisma DB connection timeout"));

    await expect(syncService.syncContent(hotelId)).rejects.toThrow(/rt_created_remote_id/);
  });

  it("thất bại và ghi log FAILED khi readback thiếu room type ID hoặc rate plan ID mong đợi (không trả success true)", async () => {
    setupDefaultHotel();
    mockPrisma.channexMapping.findUnique.mockImplementation(({ where }: any) => {
      if (where.hotelId_kind_localId.kind === "property") {
        return Promise.resolve({ id: "map_p", channexId: "prop_1" });
      }
      return Promise.resolve(null);
    });
    mockApiClient.updateProperty.mockResolvedValue({ data: { id: "prop_1" } });
    mockApiClient.getRoomTypes.mockResolvedValueOnce({ data: [] }).mockResolvedValue({
      data: [{ id: "rt_deluxe", attributes: { property_id: "prop_1", title: "DELUXE" } }],
    });
    mockApiClient.getRatePlans.mockResolvedValueOnce({ data: [] }).mockResolvedValue({
      data: [
        {
          id: "rp_deluxe",
          attributes: {
            property_id: "prop_1",
            room_type_id: "rt_deluxe",
            currency: "VND",
            options: [{ occupancy: 2, is_primary: true, rate: 1500000 }],
          },
        },
      ],
    });

    mockApiClient.createRoomType
      .mockResolvedValueOnce({ data: { id: "rt_deluxe" } })
      .mockResolvedValueOnce({ data: { id: "rt_suite" } });
    mockApiClient.createRatePlan
      .mockResolvedValueOnce({ data: { id: "rp_deluxe" } })
      .mockResolvedValueOnce({ data: { id: "rp_suite" } });

    const result = await syncService.syncContent("hotel_rec_1");

    expect(result.success).toBe(false);
    expect(result.status).toBe("FAILED");
    expect(mockPrisma.channelSyncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
        }),
      }),
    );
  });

  it("thất bại và ghi log FAILED khi readback sai currency hoặc rate amount", async () => {
    const hotelId = "hotel_rec_1";
    mockPrisma.hotel.findUnique.mockResolvedValue({
      id: hotelId,
      name: "VietSage Hotel",
      rooms: [{ id: "r1", type: "DELUXE", price: 1500000 }],
      roomTypes: [
        {
          id: "catalog-DELUXE",
          hotelId,
          name: "DELUXE",
          normalizedKey: "deluxe",
          basePrice: 1500000,
        },
      ],
    });
    mockPrisma.channelConnection.findFirst.mockResolvedValue({ id: "conn_chx_1" });
    mockPrisma.channexMapping.findUnique.mockImplementation(({ where }: any) => {
      if (where.hotelId_kind_localId.kind === "property") {
        return Promise.resolve({ id: "map_p", channexId: "prop_1" });
      }
      return Promise.resolve(null);
    });

    mockApiClient.updateProperty.mockResolvedValue({ data: { id: "prop_1" } });
    mockApiClient.getRoomTypes.mockResolvedValueOnce({ data: [] }).mockResolvedValue({
      data: [{ id: "rt_deluxe", attributes: { property_id: "prop_1", title: "DELUXE" } }],
    });
    mockApiClient.createRoomType.mockResolvedValue({ data: { id: "rt_deluxe" } });
    mockApiClient.createRatePlan.mockResolvedValue({ data: { id: "rp_deluxe" } });

    // Readback rate plan trả về sai currency (USD thay vì VND)
    mockApiClient.getRatePlans.mockResolvedValueOnce({ data: [] }).mockResolvedValue({
      data: [
        {
          id: "rp_deluxe",
          attributes: {
            property_id: "prop_1",
            room_type_id: "rt_deluxe",
            currency: "USD",
            options: [{ occupancy: 2, is_primary: true, rate: 1500000 }],
          },
        },
      ],
    });

    const result = await syncService.syncContent(hotelId);

    expect(result.success).toBe(false);
    expect(mockPrisma.channelSyncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
        }),
      }),
    );
  });

  it("thất bại và ghi log FAILED khi readback sai mối quan hệ room_type_id hoặc property_id", async () => {
    const hotelId = "hotel_rec_1";
    mockPrisma.hotel.findUnique.mockResolvedValue({
      id: hotelId,
      name: "VietSage Hotel",
      rooms: [{ id: "r1", type: "DELUXE", price: 1500000 }],
      roomTypes: [
        {
          id: "catalog-DELUXE",
          hotelId,
          name: "DELUXE",
          normalizedKey: "deluxe",
          basePrice: 1500000,
        },
      ],
    });
    mockPrisma.channelConnection.findFirst.mockResolvedValue({ id: "conn_chx_1" });
    mockPrisma.channexMapping.findUnique.mockImplementation(({ where }: any) => {
      if (where.hotelId_kind_localId.kind === "property") {
        return Promise.resolve({ id: "map_p", channexId: "prop_1" });
      }
      return Promise.resolve(null);
    });

    mockApiClient.updateProperty.mockResolvedValue({ data: { id: "prop_1" } });
    mockApiClient.getRoomTypes.mockResolvedValueOnce({ data: [] }).mockResolvedValue({
      data: [{ id: "rt_deluxe", attributes: { property_id: "prop_1", title: "DELUXE" } }],
    });
    mockApiClient.createRoomType.mockResolvedValue({ data: { id: "rt_deluxe" } });
    mockApiClient.createRatePlan.mockResolvedValue({ data: { id: "rp_deluxe" } });

    // Readback rate plan gắn với wrong room_type_id
    mockApiClient.getRatePlans.mockResolvedValueOnce({ data: [] }).mockResolvedValue({
      data: [
        {
          id: "rp_deluxe",
          attributes: {
            property_id: "prop_1",
            room_type_id: "rt_different_other",
            currency: "VND",
            options: [{ occupancy: 2, is_primary: true, rate: 1500000 }],
          },
        },
      ],
    });

    const result = await syncService.syncContent(hotelId);

    expect(result.success).toBe(false);
    expect(mockPrisma.channelSyncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
        }),
      }),
    );
  });

  it("thành công (GREEN) khi tất cả ID, quan hệ và giá khớp chính xác trên readback", async () => {
    const hotelId = "hotel_rec_1";
    mockPrisma.hotel.findUnique.mockResolvedValue({
      id: hotelId,
      name: "VietSage Hotel",
      rooms: [{ id: "r1", type: "DELUXE", price: 1500000 }],
      roomTypes: [
        {
          id: "catalog-DELUXE",
          hotelId,
          name: "DELUXE",
          normalizedKey: "deluxe",
          basePrice: 1500000,
        },
      ],
    });
    mockPrisma.channelConnection.findFirst.mockResolvedValue({ id: "conn_chx_1" });
    mockPrisma.channexMapping.findUnique.mockImplementation(({ where }: any) => {
      if (where.hotelId_kind_localId.kind === "property") {
        return Promise.resolve({ id: "map_p", channexId: "prop_1" });
      }
      return Promise.resolve(null);
    });

    mockApiClient.updateProperty.mockResolvedValue({ data: { id: "prop_1" } });
    mockApiClient.getRoomTypes.mockResolvedValueOnce({ data: [] }).mockResolvedValue({
      data: [{ id: "rt_deluxe", attributes: { property_id: "prop_1", title: "DELUXE" } }],
    });
    mockApiClient.createRoomType.mockResolvedValue({ data: { id: "rt_deluxe" } });
    mockApiClient.createRatePlan.mockResolvedValue({ data: { id: "rp_deluxe" } });
    mockApiClient.getRatePlans.mockResolvedValueOnce({ data: [] }).mockResolvedValue({
      data: [
        {
          id: "rp_deluxe",
          attributes: {
            property_id: "prop_1",
            room_type_id: "rt_deluxe",
            currency: "VND",
            options: [{ occupancy: 2, is_primary: true, rate: 1500000 }],
          },
        },
      ],
    });

    const result = await syncService.syncContent(hotelId);

    expect(result.success).toBe(true);
    expect(result.channexPropertyId).toBe("prop_1");
    expect(result.roomTypesSynced).toHaveLength(1);
    expect(result.ratePlansSynced).toHaveLength(1);
    expect(mockPrisma.channelSyncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SUCCESS",
        }),
      }),
    );
  });

  it("không báo thành công khi readback thiếu giá, tiền tệ hoặc quan hệ", async () => {
    const hotelId = "hotel_rec_1";
    mockPrisma.hotel.findUnique.mockResolvedValue({
      id: hotelId,
      name: "VietSage Hotel",
      rooms: [{ id: "r1", type: "DELUXE", price: 1500000 }],
      roomTypes: [
        {
          id: "catalog-DELUXE",
          hotelId,
          name: "DELUXE",
          normalizedKey: "deluxe",
          basePrice: 1500000,
        },
      ],
    });
    mockPrisma.channelConnection.findFirst.mockResolvedValue({ id: "conn_chx_1" });
    mockPrisma.channexMapping.findMany.mockResolvedValue([
      { kind: "room_type", localId: "catalog-DELUXE", channexId: "rt_deluxe" },
      { kind: "rate_plan", localId: "catalog-DELUXE:STANDARD", channexId: "rp_deluxe" },
    ]);
    mockPrisma.channexMapping.findUnique.mockImplementation(({ where }: any) => {
      const kind = where.hotelId_kind_localId.kind;
      return Promise.resolve({
        id: `map_${kind}`,
        channexId: {
          property: "prop_1",
          room_type: "rt_deluxe",
          rate_plan: "rp_deluxe",
        }[kind],
      });
    });
    mockApiClient.updateProperty.mockResolvedValue({ data: { id: "prop_1" } });
    mockApiClient.updateRoomType.mockResolvedValue({ data: { id: "rt_deluxe" } });
    mockApiClient.updateRatePlan.mockResolvedValue({ data: { id: "rp_deluxe" } });
    mockApiClient.getRoomTypes.mockResolvedValue({
      data: [{ id: "rt_deluxe", attributes: { title: "DELUXE", property_id: "prop_1" } }],
    });
    mockApiClient.getRatePlans.mockResolvedValue({
      data: [{ id: "rp_deluxe", attributes: { property_id: "prop_1" } }],
    });

    const result = await syncService.syncContent(hotelId);
    expect(result.success).toBe(false);
    expect(mockPrisma.channelSyncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
  });
});
