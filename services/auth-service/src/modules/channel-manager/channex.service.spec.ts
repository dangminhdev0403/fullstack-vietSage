import { ChannexApiClient } from "./services/channex-api-client.service";
import { ChannexSyncService } from "./services/channex-sync.service";
import { ChannexAriSyncService } from "./services/channex-ari-sync.service";
import { ChannexBookingIngestionService } from "./services/channex-booking-ingestion.service";
import { ChannexDoctorService } from "./services/channex-doctor.service";
import { AriCoreService } from "./services/ari-core.service";
import { assertChannexWebhookSecret } from "./services/channex-webhook-auth";
import { ChannexFeedScheduler } from "./services/channex-feed-scheduler.service";
import { ChannexChannelSessionService } from "./services/channex-channel-session.service";
import { BadRequestException, NotFoundException } from "@nestjs/common";

describe("Channex Channel Manager Integration Suite", () => {
  let mockPrisma: any;
  let mockApiClient: any;
  let ariCoreService: AriCoreService;

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
      reservation: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
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
      channelDailyAvailability: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      channelDailyRestriction: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      $transaction: jest.fn(async (work: (tx: any) => Promise<any>) => work(mockPrisma)),
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
      getRoomTypes: jest.fn(),
      createRoomType: jest.fn(),
      updateRoomType: jest.fn(),
      getRatePlans: jest.fn(),
      getRatePlanOptions: jest.fn(),
      createRatePlan: jest.fn(),
      updateRatePlan: jest.fn(),
      postAvailability: jest.fn(),
      getAvailability: jest.fn(),
      postRestrictions: jest.fn(),
      getRestrictions: jest.fn(),
      getBookingFeed: jest.fn(),
      getBookingRevision: jest.fn(),
      ackBookingRevision: jest.fn(),
      getBookings: jest.fn(),
      createChannelOneTimeToken: jest.fn(),
      getChannelAdapters: jest.fn(),
      getChannelAdapter: jest.fn(),
      getChannels: jest.fn(),
      testChannelConnection: jest.fn(),
      getChannelConnectionDetails: jest.fn(),
      getChannelMappingDetails: jest.fn(),
      createChannel: jest.fn(),
      checkChannelReadiness: jest.fn(),
      activateChannel: jest.fn(),
      createBooking: jest.fn(),
      getWebhooks: jest.fn().mockResolvedValue({ data: [] }),
      registerWebhook: jest.fn().mockResolvedValue({ data: { id: "wh_1" } }),
    };

    ariCoreService = new AriCoreService(mockPrisma);
    mockPrisma.roomType.findMany.mockImplementation(async () =>
      ((await mockPrisma.room.findMany.mock.results.at(-1)?.value) ?? []).map((room: any) => ({
        id: `catalog-${room.type}`,
        name: room.type,
        normalizedKey: room.type.toLowerCase(),
        basePrice: room.price,
      })),
    );
  });

  // ================= 1. API CLIENT TESTS ================= //
  describe("Component 1: ChannexApiClient", () => {
    it("cấu hình mặc định đúng staging base url", () => {
      const client = new ChannexApiClient();
      expect(client.getBaseUrl()).toBe("https://staging.channex.io/api/v1");
    });

    it("lấy API key hiệu dụng từ override hoặc default", () => {
      const client = new ChannexApiClient();
      expect(client.getEffectiveApiKey("custom_key_123")).toBe("custom_key_123");
    });

    it("từ chối chạy khi API key không được cấu hình", () => {
      const previous = process.env.CHANNEX_API_KEY;
      delete process.env.CHANNEX_API_KEY;
      try {
        const client = new ChannexApiClient();
        expect(() => client.getEffectiveApiKey()).toThrow("Channex API key chưa được cấu hình");
      } finally {
        if (previous === undefined) delete process.env.CHANNEX_API_KEY;
        else process.env.CHANNEX_API_KEY = previous;
      }
    });

    it("từ chối base URL ngoài hai máy chủ Channex chính thức", () => {
      const previous = process.env.CHANNEX_BASE_URL;
      process.env.CHANNEX_BASE_URL = "https://example.invalid/api/v1";
      try {
        expect(() => new ChannexApiClient()).toThrow("CHANNEX_BASE_URL không hợp lệ");
      } finally {
        if (previous === undefined) delete process.env.CHANNEX_BASE_URL;
        else process.env.CHANNEX_BASE_URL = previous;
      }
    });

    it("không theo redirect khi gọi Channex", async () => {
      const fetchSpy = jest
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
      try {
        const client = new ChannexApiClient();
        await client.getProperties("custom_key_123");
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ redirect: "error" }),
        );
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it("chặn webhook thiếu hoặc sai shared-secret header", () => {
      const previous = process.env.CHANNEX_WEBHOOK_SECRET;
      process.env.CHANNEX_WEBHOOK_SECRET = "test-secret-at-least-32-characters";
      try {
        expect(() => assertChannexWebhookSecret(undefined)).toThrow(
          "Invalid Channex webhook secret",
        );
        expect(() => assertChannexWebhookSecret("wrong-secret")).toThrow(
          "Invalid Channex webhook secret",
        );
        expect(() => assertChannexWebhookSecret(process.env.CHANNEX_WEBHOOK_SECRET)).not.toThrow();
      } finally {
        if (previous === undefined) delete process.env.CHANNEX_WEBHOOK_SECRET;
        else process.env.CHANNEX_WEBHOOK_SECRET = previous;
      }
    });
  });

  // ================= 2. CONTENT SYNC & ID MAPPING TESTS ================= //
  describe("Component 2: ChannexSyncService (Idempotent Content Sync)", () => {
    let syncService: ChannexSyncService;

    beforeEach(() => {
      syncService = new ChannexSyncService(mockPrisma, mockApiClient);
    });

    it("đồng bộ property, room type và rate plan lần đầu (POST) và tạo mappings", async () => {
      const hotelId = "hotel_viet_1";
      mockPrisma.hotel.findUnique.mockResolvedValue({
        id: hotelId,
        name: "VietSage Boutique Hotel",
        country: "VN",
        city: "Hanoi",
        address: "123 Tran Hung Dao",
        rooms: [
          { id: "r1", type: "DELUXE", price: 1500000 },
          { id: "r2", type: "DELUXE", price: 1500000 },
          { id: "r3", type: "SUITE", price: 3000000 },
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

      mockPrisma.channelConnection.findFirst.mockResolvedValue(null);
      mockPrisma.channelConnection.create.mockResolvedValue({ id: "conn_channex_1" });

      // Chưa có mapping nào tồn tại
      mockPrisma.channexMapping.findUnique.mockResolvedValue(null);
      mockPrisma.channexMapping.create.mockImplementation((args: any) =>
        Promise.resolve({ id: "map_" + Math.random(), ...args.data }),
      );

      mockApiClient.createProperty.mockResolvedValue({
        data: { id: "prop_uuid_123" },
      });
      mockApiClient.createRoomType
        .mockResolvedValueOnce({ data: { id: "rt_uuid_deluxe" } })
        .mockResolvedValueOnce({ data: { id: "rt_uuid_suite" } });

      mockApiClient.createRatePlan
        .mockResolvedValueOnce({ data: { id: "rp_uuid_deluxe" } })
        .mockResolvedValueOnce({ data: { id: "rp_uuid_suite" } });

      mockApiClient.getRoomTypes
        .mockResolvedValueOnce({ data: [] })
        .mockImplementation(async () => ({
          data: mockApiClient.createRoomType.mock.calls.map(([roomType]: any[], i: number) => ({
            id: ["rt_uuid_deluxe", "rt_uuid_suite"][i],
            attributes: { property_id: "prop_uuid_123", title: roomType.title },
          })),
        }));
      mockApiClient.getRatePlans
        .mockResolvedValueOnce({ data: [] })
        .mockImplementation(async () => ({
          data: mockApiClient.createRatePlan.mock.calls.map(([ratePlan]: any[], i: number) => ({
            id: ["rp_uuid_deluxe", "rp_uuid_suite"][i],
            attributes: ratePlan,
          })),
        }));

      const res = await syncService.syncContent(hotelId);

      expect(res.success).toBe(true);
      expect(res.channexPropertyId).toBe("prop_uuid_123");
      expect(res.roomTypesSynced).toHaveLength(2);
      expect(res.ratePlansSynced).toHaveLength(2);

      // Kiểm tra rate plan payload bắt buộc phải có options array (yêu cầu Staging)
      expect(mockApiClient.createRatePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.arrayContaining([
            expect.objectContaining({
              occupancy: 2,
              is_primary: true,
              rate: expect.any(Number),
            }),
          ]),
        }),
        undefined,
      );

      // Kiểm tra readback verification
      expect(res.verified.roomTypesInChannex).toBe(2);
      expect(res.verified.ratePlansInChannex).toBe(2);
    });

    it("chạy lại Content Sync lần 2 an toàn (Idempotent - gọi PUT thay vì tạo mới)", async () => {
      const hotelId = "hotel_viet_1";
      mockPrisma.hotel.findUnique.mockResolvedValue({
        id: hotelId,
        name: "VietSage Boutique Hotel Updated",
        rooms: [{ id: "r1", type: "STANDARD", price: 900000 }],
        roomTypes: [
          {
            id: "catalog-STANDARD",
            hotelId,
            name: "STANDARD",
            normalizedKey: "standard",
            basePrice: 1000000,
          },
        ],
      });

      mockPrisma.channelConnection.findFirst.mockResolvedValue({ id: "conn_channex_1" });
      mockPrisma.channexMapping.findMany.mockResolvedValue([
        { kind: "room_type", localId: "catalog-STANDARD", channexId: "rt_existing" },
        { kind: "rate_plan", localId: "catalog-STANDARD:STANDARD", channexId: "rp_existing" },
      ]);

      // Đã có sẵn mapping từ trước
      mockPrisma.channexMapping.findUnique.mockImplementation(({ where }: any) => {
        if (where.hotelId_kind_localId.kind === "property") {
          return Promise.resolve({ id: "map_p", channexId: "prop_existing" });
        }
        if (where.hotelId_kind_localId.kind === "room_type") {
          return Promise.resolve({ id: "map_rt", channexId: "rt_existing" });
        }
        if (where.hotelId_kind_localId.kind === "rate_plan") {
          return Promise.resolve({ id: "map_rp", channexId: "rp_existing" });
        }
        return Promise.resolve(null);
      });

      mockApiClient.updateProperty.mockResolvedValue({ data: { id: "prop_existing" } });
      mockApiClient.updateRoomType.mockResolvedValue({ data: { id: "rt_existing" } });
      mockApiClient.updateRatePlan.mockResolvedValue({ data: { id: "rp_existing" } });
      mockApiClient.getRoomTypes.mockResolvedValue({
        data: [
          {
            id: "rt_existing",
            attributes: { property_id: "prop_existing", title: "STANDARD" },
          },
        ],
      });
      mockApiClient.getRatePlans.mockResolvedValue({
        data: [
          {
            id: "rp_existing",
            attributes: {
              property_id: "prop_existing",
              room_type_id: "rt_existing",
              currency: "VND",
              options: [{ occupancy: 2, is_primary: true, rate: 1000000 }],
            },
          },
        ],
      });

      const res = await syncService.syncContent(hotelId);

      expect(res.success).toBe(true);
      expect(mockApiClient.updateProperty).toHaveBeenCalledWith(
        "prop_existing",
        expect.any(Object),
        undefined,
      );
      expect(mockApiClient.updateRoomType).toHaveBeenCalledWith(
        "rt_existing",
        expect.any(Object),
        undefined,
      );
      expect(mockApiClient.updateRatePlan).toHaveBeenCalledWith(
        "rp_existing",
        expect.objectContaining({
          options: [expect.objectContaining({ rate: 1000000 })],
        }),
        undefined,
      );
      expect(res.roomTypesSynced[0].action).toBe("UPDATED");
      expect(res.roomTypesSynced[0].channexRoomTypeId).toBe("rt_existing");
      expect(res.ratePlansSynced[0].channexRatePlanId).toBe("rp_existing");
      expect(mockPrisma.channexMapping.findUnique).toHaveBeenCalledWith({
        where: {
          hotelId_kind_localId: { hotelId, kind: "room_type", localId: "catalog-STANDARD" },
        },
      });
      expect(mockApiClient.createRoomType).not.toHaveBeenCalled();
      expect(mockApiClient.createRatePlan).not.toHaveBeenCalled();
    });

    it("không tạo Property mới khi update lỗi nhưng không phải 404", async () => {
      mockPrisma.hotel.findUnique.mockResolvedValue({
        id: "hotel_1",
        name: "Hotel Test",
        rooms: [{ id: "r1", type: "STANDARD", price: 1000000 }],
        roomTypes: [
          {
            id: "catalog-STANDARD",
            hotelId: "hotel_1",
            name: "STANDARD",
            normalizedKey: "standard",
            basePrice: 1000000,
          },
        ],
      });
      mockPrisma.channelConnection.findFirst.mockResolvedValue({ id: "conn_1" });
      mockPrisma.channexMapping.findUnique.mockResolvedValue({
        id: "mapping_1",
        channexId: "property_1",
      });
      mockApiClient.updateProperty.mockRejectedValue(new BadRequestException("validation error"));
      const service = new ChannexSyncService(mockPrisma, mockApiClient);

      await expect(service.syncContent("hotel_1")).rejects.toThrow("validation error");
      expect(mockApiClient.createProperty).not.toHaveBeenCalled();
    });

    it("từ chối Content Sync khi khách sạn chưa có phòng thật", async () => {
      mockPrisma.hotel.findUnique.mockResolvedValue({
        id: "hotel_1",
        name: "Hotel Test",
        rooms: [],
        roomTypes: [],
      });
      mockPrisma.channelConnection.findFirst.mockResolvedValue({ id: "conn_1" });
      mockPrisma.channexMapping.findUnique.mockResolvedValue(null);
      mockApiClient.createProperty.mockResolvedValue({ data: { id: "property_1" } });
      const service = new ChannexSyncService(mockPrisma, mockApiClient);

      await expect(service.syncContent("hotel_1")).rejects.toThrow(
        "Khách sạn chưa có phòng để đồng bộ sang Channex",
      );
      expect(mockApiClient.createRoomType).not.toHaveBeenCalled();
    });

    it("tạo lại Property chỉ khi Channex trả 404", async () => {
      mockPrisma.hotel.findUnique.mockResolvedValue({
        id: "hotel_1",
        name: "Hotel Test",
        rooms: [{ id: "r1", type: "STANDARD", price: 1000000 }],
        roomTypes: [
          {
            id: "catalog-STANDARD",
            hotelId: "hotel_1",
            name: "STANDARD",
            normalizedKey: "standard",
            basePrice: 1000000,
          },
        ],
      });
      mockPrisma.channelConnection.findFirst.mockResolvedValue({ id: "conn_1" });
      mockPrisma.channexMapping.findUnique.mockImplementation(({ where }: any) =>
        where.hotelId_kind_localId.kind === "property"
          ? Promise.resolve({ id: "mapping_1", channexId: "property_missing" })
          : Promise.resolve(null),
      );
      mockApiClient.updateProperty.mockRejectedValue(new NotFoundException("not found"));
      mockApiClient.createProperty.mockResolvedValue({ data: { id: "property_recreated" } });
      mockApiClient.createRoomType.mockResolvedValue({ data: { id: "rt_1" } });
      mockApiClient.createRatePlan.mockResolvedValue({ data: { id: "rp_1" } });
      mockApiClient.getRoomTypes.mockResolvedValue({ data: [{ id: "rt_1" }] });
      mockApiClient.getRatePlans.mockResolvedValue({ data: [{ id: "rp_1" }] });
      const service = new ChannexSyncService(mockPrisma, mockApiClient);

      const result = await service.syncContent("hotel_1");

      expect(result.channexPropertyId).toBe("property_recreated");
      expect(mockApiClient.createProperty).toHaveBeenCalledTimes(1);
    });

    it("đăng ký webhook booking với shared-secret header khi URL được cấu hình", async () => {
      const previousUrl = process.env.CHANNEX_WEBHOOK_URL;
      const previousSecret = process.env.CHANNEX_WEBHOOK_SECRET;
      process.env.CHANNEX_WEBHOOK_URL =
        "https://api.example.com/api/v1/channel-manager/channex/webhook";
      process.env.CHANNEX_WEBHOOK_SECRET = "test-secret-at-least-32-characters";
      mockPrisma.hotel.findUnique.mockResolvedValue({
        id: "hotel_1",
        name: "Hotel Test",
        rooms: [{ id: "r1", type: "STANDARD", price: 1000000 }],
        roomTypes: [
          {
            id: "catalog-STANDARD",
            hotelId: "hotel_1",
            name: "STANDARD",
            normalizedKey: "standard",
            basePrice: 1000000,
          },
        ],
      });
      mockPrisma.channelConnection.findFirst.mockResolvedValue({ id: "conn_1" });
      mockPrisma.channexMapping.findUnique.mockResolvedValue(null);
      mockPrisma.channexMapping.create.mockResolvedValue({});
      mockApiClient.createProperty.mockResolvedValue({ data: { id: "prop_1" } });
      mockApiClient.createRoomType.mockResolvedValue({ data: { id: "rt_1" } });
      mockApiClient.createRatePlan.mockResolvedValue({ data: { id: "rp_1" } });
      mockApiClient.getRoomTypes.mockResolvedValue({ data: [{ id: "rt_1" }] });
      mockApiClient.getRatePlans.mockResolvedValue({ data: [{ id: "rp_1" }] });
      mockApiClient.getWebhooks.mockResolvedValue({ data: [] });
      mockApiClient.registerWebhook.mockResolvedValue({ data: { id: "wh_1" } });
      const service = new ChannexSyncService(mockPrisma, mockApiClient);

      try {
        await service.syncContent("hotel_1");
        expect(mockApiClient.registerWebhook).toHaveBeenCalledWith(
          expect.objectContaining({
            callbackUrl: process.env.CHANNEX_WEBHOOK_URL,
            propertyId: "prop_1",
            headers: {
              "X-Channex-Webhook-Secret": process.env.CHANNEX_WEBHOOK_SECRET,
            },
          }),
        );
      } finally {
        if (previousUrl === undefined) delete process.env.CHANNEX_WEBHOOK_URL;
        else process.env.CHANNEX_WEBHOOK_URL = previousUrl;
        if (previousSecret === undefined) delete process.env.CHANNEX_WEBHOOK_SECRET;
        else process.env.CHANNEX_WEBHOOK_SECRET = previousSecret;
      }
    });
  });

  // ================= 3. OUTBOUND ARI PUSH TESTS ================= //
  describe("Component 3: ChannexAriSyncService (ARI Range Compression & Past Date Filtering)", () => {
    let ariSyncService: ChannexAriSyncService;

    beforeEach(() => {
      mockApiClient.getProperty.mockResolvedValue({ data: { attributes: { currency: "VND" } } });
      ariSyncService = new ChannexAriSyncService(mockPrisma, ariCoreService, mockApiClient);
    });

    it("lọc bỏ các ngày trong quá khứ và nén dải ngày liên tiếp có cùng availability", async () => {
      const hotelId = "hotel_viet_1";

      mockPrisma.channexMapping.findUnique.mockResolvedValue({
        channexId: "prop_chx_1",
      });

      mockPrisma.channexMapping.findMany.mockResolvedValue([
        { kind: "room_type", localId: "DELUXE", channexId: "rt_deluxe_chx" },
        { kind: "rate_plan", localId: "DELUXE:STANDARD", channexId: "rp_deluxe_chx" },
      ]);

      // Mock phòng thực tế
      mockPrisma.room.findMany.mockResolvedValue([
        { id: "r1", type: "DELUXE", price: 1500000 },
        { id: "r2", type: "DELUXE", price: 1500000 },
      ]);

      // Giả lập ngày hôm nay và các ngày tương lai
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());

      const d1 = new Date(`${today}T00:00:00.000Z`);
      const d2 = new Date(d1);
      d2.setUTCDate(d2.getUTCDate() + 1);
      const d3 = new Date(d1);
      d3.setUTCDate(d3.getUTCDate() + 2);

      const d1Str = d1.toISOString().split("T")[0];
      const d2Str = d2.toISOString().split("T")[0];
      const d3Str = d3.toISOString().split("T")[0];

      mockPrisma.channelDailyAvailability.findMany.mockResolvedValue([]);
      mockPrisma.channelDailyRestriction.findMany.mockResolvedValue([]);

      mockApiClient.postAvailability.mockResolvedValue({ data: { message: "Success" } });
      mockApiClient.postRestrictions.mockResolvedValue({ data: { message: "Success" } });
      mockApiClient.getAvailability.mockImplementation(async () => ({
        data: {
          rt_deluxe_chx: Object.fromEntries([d1Str, d2Str, d3Str].map((date) => [date, 2])),
        },
      }));
      mockApiClient.getRestrictions.mockImplementation(async () => ({
        data: {
          rp_deluxe_chx: Object.fromEntries(
            [d1Str, d2Str, d3Str].map((date) => [
              date,
              {
                rate: "1500000.00",
                min_stay_arrival: 1,
                stop_sell: false,
                closed_to_arrival: false,
                closed_to_departure: false,
              },
            ]),
          ),
        },
      }));

      const res = await ariSyncService.pushAri(hotelId, {
        startDate: d1Str,
        endDate: d3Str,
      });

      expect(res.success).toBe(true);
      expect(mockApiClient.postAvailability).toHaveBeenCalled();
      expect(mockApiClient.postRestrictions).toHaveBeenCalled();

      // Kiểm tra readback verification
      expect(res.readbackVerified.availabilityMatch).toBe(true);
      expect(res.readbackVerified.restrictionsMatch).toBe(true);
    });

    it("tính bookedRooms từ reservation overlap thay vì mặc định bằng 0", async () => {
      mockPrisma.room.findMany.mockResolvedValue([
        { id: "r1", type: "DELUXE", price: 1500000 },
        { id: "r2", type: "DELUXE", price: 1500000 },
      ]);
      mockPrisma.reservation.findMany.mockResolvedValue([
        {
          roomId: "r1",
          plannedCheckInAt: new Date("2026-10-15T07:00:00.000Z"),
          plannedCheckOutAt: new Date("2026-10-17T05:00:00.000Z"),
        },
      ]);
      mockPrisma.channelDailyAvailability.findMany.mockResolvedValue([]);
      mockPrisma.channelDailyRestriction.findMany.mockResolvedValue([]);

      const grid = await ariCoreService.getInventoryGrid("hotel_1", "2026-10-15", "2026-10-17");

      expect(grid.roomTypes[0].days.map((day) => day.bookedRooms)).toEqual([1, 1, 0]);
      expect(grid.roomTypes[0].days.map((day) => day.availableRooms)).toEqual([1, 1, 2]);
    });

    it("trừ tồn OTA chưa gán phòng bằng roomTypeSnapshot", async () => {
      mockPrisma.room.findMany.mockResolvedValue([
        { id: "r1", type: "DELUXE", price: 1500000 },
        { id: "r2", type: "DELUXE", price: 1500000 },
      ]);
      mockPrisma.reservation.findMany.mockResolvedValue([
        {
          roomId: null,
          roomTypeSnapshot: "DELUXE",
          plannedCheckInAt: new Date("2026-10-15T07:00:00.000Z"),
          plannedCheckOutAt: new Date("2026-10-17T05:00:00.000Z"),
        },
      ]);
      mockPrisma.channelDailyAvailability.findMany.mockResolvedValue([]);
      mockPrisma.channelDailyRestriction.findMany.mockResolvedValue([]);

      const grid = await ariCoreService.getInventoryGrid("hotel_1", "2026-10-15", "2026-10-17");

      expect(grid.roomTypes[0].days.map((day) => day.bookedRooms)).toEqual([1, 1, 0]);
    });

    it("đẩy availability-only khi mapping room type tồn tại dù chưa có rate plan", async () => {
      const hotelId = "hotel_viet_1";
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      mockPrisma.channexMapping.findUnique.mockResolvedValue({ channexId: "prop_chx_1" });
      mockPrisma.channexMapping.findMany.mockResolvedValue([
        { kind: "room_type", localId: "catalog-DELUXE", channexId: "rt_deluxe_chx" },
      ]);
      mockPrisma.room.findMany.mockResolvedValue([
        { id: "r1", type: "DELUXE", roomTypeId: "catalog-DELUXE" },
      ]);
      mockPrisma.roomType.findMany.mockResolvedValue([
        { id: "catalog-DELUXE", name: "DELUXE", normalizedKey: "deluxe", basePrice: null },
      ]);
      mockPrisma.channelDailyAvailability.findMany.mockResolvedValue([]);
      mockPrisma.channelDailyRestriction.findMany.mockResolvedValue([]);
      mockApiClient.postAvailability.mockResolvedValue({ data: {} });
      mockApiClient.getAvailability.mockResolvedValue({ data: { rt_deluxe_chx: { [today]: 1 } } });

      const result = await ariSyncService.pushAri(hotelId, {
        startDate: today,
        endDate: today,
        availabilityOnly: true,
      });
      expect(result.success).toBe(true);
      expect(mockApiClient.postAvailability).toHaveBeenCalledTimes(1);
      expect(mockApiClient.postRestrictions).not.toHaveBeenCalled();
    });

    it("chặn đồng bộ trước khi ghi nếu rate plan của hạng phòng bị thiếu", async () => {
      const hotelId = "hotel_viet_1";
      mockPrisma.channexMapping.findUnique.mockResolvedValue({ channexId: "prop_chx_1" });
      mockPrisma.channexMapping.findMany.mockResolvedValue([
        { kind: "room_type", localId: "DELUXE", channexId: "rt_deluxe_chx" },
        { kind: "rate_plan", localId: "SUITE:STANDARD", channexId: "rp_suite_chx" },
      ]);
      mockPrisma.room.findMany.mockResolvedValue([{ id: "r1", type: "DELUXE", price: 1500000 }]);
      mockPrisma.channelDailyAvailability.findMany.mockResolvedValue([]);
      mockPrisma.channelDailyRestriction.findMany.mockResolvedValue([]);
      mockApiClient.postAvailability.mockResolvedValue({ data: {} });
      mockApiClient.getAvailability.mockResolvedValue({ data: { rt_deluxe_chx: {} } });
      mockApiClient.getRestrictions.mockResolvedValue({ data: {} });

      await expect(
        ariSyncService.pushAri(hotelId, {
          startDate: "2026-10-15",
          endDate: "2026-10-15",
        }),
      ).rejects.toThrow("mapping gói giá");

      expect(mockApiClient.postRestrictions).not.toHaveBeenCalled();
      expect(mockApiClient.postAvailability).not.toHaveBeenCalled();
    });

    it("đánh dấu readback mismatch khi giá hoặc tồn kho khác giá trị đã đẩy", async () => {
      const hotelId = "hotel_viet_1";
      mockPrisma.channexMapping.findUnique.mockResolvedValue({ channexId: "prop_chx_1" });
      mockPrisma.channexMapping.findMany.mockResolvedValue([
        { kind: "room_type", localId: "DELUXE", channexId: "rt_deluxe_chx" },
        { kind: "rate_plan", localId: "DELUXE:STANDARD", channexId: "rp_deluxe_chx" },
      ]);
      mockPrisma.room.findMany.mockResolvedValue([{ id: "r1", type: "DELUXE", price: 1500000 }]);
      mockPrisma.channelDailyAvailability.findMany.mockResolvedValue([]);
      mockPrisma.channelDailyRestriction.findMany.mockResolvedValue([]);
      mockApiClient.postAvailability.mockResolvedValue({ data: {} });
      mockApiClient.postRestrictions.mockResolvedValue({ data: {} });
      mockApiClient.getAvailability.mockResolvedValue({
        data: { rt_deluxe_chx: { "2026-10-15": 99 } },
      });
      mockApiClient.getRestrictions.mockResolvedValue({
        data: { rp_deluxe_chx: { "2026-10-15": { rate: "1.00" } } },
      });

      const result = await ariSyncService.pushAri(hotelId, {
        startDate: "2026-10-15",
        endDate: "2026-10-15",
      });

      expect(result.readbackVerified.availabilityMatch).toBe(false);
      expect(result.readbackVerified.restrictionsMatch).toBe(false);
    });

    it("chặn giá thiếu trước khi đẩy thay vì mượn giá phòng khác", async () => {
      const hotelId = "hotel_viet_1";
      mockPrisma.channexMapping.findUnique.mockResolvedValue({ channexId: "prop_chx_1" });
      mockPrisma.channexMapping.findMany.mockResolvedValue([
        { kind: "room_type", localId: "STANDARD", channexId: "rt_std_chx" },
        { kind: "rate_plan", localId: "STANDARD:STANDARD", channexId: "rp_std_chx" },
      ]);
      // Phòng không có price (price = null)
      mockPrisma.room.findMany.mockResolvedValue([{ id: "r1", type: "STANDARD", price: null }]);
      // Fallback room có giá > 0
      mockPrisma.room.findFirst.mockResolvedValue({ price: 600000 });
      mockPrisma.channelDailyAvailability.findMany.mockResolvedValue([]);
      mockPrisma.channelDailyRestriction.findMany.mockResolvedValue([]);
      mockApiClient.postAvailability.mockResolvedValue({ data: {} });
      mockApiClient.postRestrictions.mockResolvedValue({ data: {} });
      mockApiClient.getAvailability.mockResolvedValue({
        data: { rt_std_chx: { "2026-10-15": 1 } },
      });
      mockApiClient.getRestrictions.mockResolvedValue({
        data: {
          rp_std_chx: {
            "2026-10-15": { rate: "600000.00", min_stay_arrival: 1, stop_sell: false },
          },
        },
      });

      // Ngày 2026-10-15 không có bản ghi giá trong DB nhưng KHÔNG được ném BadRequestException
      await expect(
        ariSyncService.pushAri(hotelId, {
          startDate: "2026-10-15",
          endDate: "2026-10-15",
        }),
      ).rejects.toThrow("giá gốc");

      expect(mockApiClient.postAvailability).not.toHaveBeenCalled();
      expect(mockApiClient.postRestrictions).not.toHaveBeenCalled();
    });

    it("quy đổi VND sang GBP minor units chỉ trên Channex staging", async () => {
      const previousRate = process.env.CHANNEX_STAGING_VND_TO_GBP_RATE;
      process.env.CHANNEX_STAGING_VND_TO_GBP_RATE = "0.000029";
      mockApiClient.getProperty.mockResolvedValue({ data: { attributes: { currency: "GBP" } } });
      mockPrisma.channexMapping.findUnique.mockResolvedValue({ channexId: "prop_chx_1" });
      mockPrisma.channexMapping.findMany.mockResolvedValue([
        { kind: "room_type", localId: "STANDARD", channexId: "rt_std_chx" },
        { kind: "rate_plan", localId: "STANDARD:STANDARD", channexId: "rp_std_chx" },
      ]);
      mockPrisma.room.findMany.mockResolvedValue([{ id: "r1", type: "STANDARD", price: 900000 }]);
      mockPrisma.room.findFirst.mockResolvedValue({ price: 900000 });
      mockPrisma.channelDailyAvailability.findMany.mockResolvedValue([]);
      mockPrisma.channelDailyRestriction.findMany.mockResolvedValue([]);
      mockApiClient.postAvailability.mockResolvedValue({ data: {} });
      mockApiClient.postRestrictions.mockResolvedValue({ data: {} });
      mockApiClient.getAvailability.mockResolvedValue({
        data: { rt_std_chx: { "2026-10-15": 1 } },
      });
      mockApiClient.getRestrictions.mockResolvedValue({
        data: {
          rp_std_chx: {
            "2026-10-15": { rate: "26.10", min_stay_arrival: 1, stop_sell: false },
          },
        },
      });

      try {
        const result = await ariSyncService.pushAri("hotel_viet_1", {
          startDate: "2026-10-15",
          endDate: "2026-10-15",
        });

        expect(mockApiClient.postRestrictions).toHaveBeenCalledWith(
          expect.arrayContaining([expect.objectContaining({ rate: 2610 })]),
          undefined,
        );
        expect(result).toEqual(
          expect.objectContaining({
            sourceCurrency: "VND",
            targetCurrency: "GBP",
            rateConversionApplied: true,
            rateConversionMultiplier: 0.0029,
          }),
        );
      } finally {
        if (previousRate === undefined) delete process.env.CHANNEX_STAGING_VND_TO_GBP_RATE;
        else process.env.CHANNEX_STAGING_VND_TO_GBP_RATE = previousRate;
      }
    });

    it("tự động tìm ngày cập nhật mới nhất thay vì ép cứng 30 ngày khi không truyền endDate", async () => {
      const hotelId = "hotel_viet_1";
      mockPrisma.channexMapping.findUnique.mockResolvedValue({ channexId: "prop_chx_1" });
      mockPrisma.channexMapping.findMany.mockResolvedValue([
        { kind: "room_type", localId: "STANDARD", channexId: "rt_std_chx" },
        { kind: "rate_plan", localId: "STANDARD:STANDARD", channexId: "rp_std_chx" },
      ]);
      mockPrisma.room.findMany.mockResolvedValue([{ id: "r1", type: "STANDARD", price: 800000 }]);
      mockPrisma.channelDailyAvailability.findMany.mockResolvedValue([]);
      mockPrisma.channelDailyRestriction.findMany.mockResolvedValue([]);

      // Giả lập ngày cập nhật mới nhất trong DB là 2026-10-20
      mockPrisma.channelDailyRestriction.findFirst.mockResolvedValue({
        date: new Date("2026-10-20T00:00:00.000Z"),
      });
      mockPrisma.channelDailyAvailability.findFirst.mockResolvedValue(null);
      mockApiClient.postAvailability.mockResolvedValue({ data: {} });
      mockApiClient.postRestrictions.mockResolvedValue({ data: {} });
      mockApiClient.getAvailability.mockResolvedValue({ data: {} });
      mockApiClient.getRestrictions.mockResolvedValue({ data: {} });

      const result = await ariSyncService.pushAri(hotelId, {
        startDate: "2026-10-15",
        // Không truyền endDate
      });

      // Readback giả lập rỗng không được coi là đã xác minh thành công.
      expect(result.success).toBe(false);
      expect(result.startDate).toBe("2026-10-15");
      expect(result.endDate).toBe("2026-10-20");
    });
  });

  // ================= 4. INBOUND BOOKINGS TESTS ================= //
  describe("Component 4: ChannexBookingIngestionService (Feed Polling, Dedup & Ack)", () => {
    let ingestionService: ChannexBookingIngestionService;

    beforeEach(() => {
      ingestionService = new ChannexBookingIngestionService(mockPrisma, mockApiClient);
    });

    it("tiếp nhận booking mới từ feed, lưu reservation, lưu mapping và ack", async () => {
      const revisionItem = {
        id: "rev_uuid_101",
        type: "booking_revision",
        attributes: {
          booking_id: "bk_chx_999",
          status: "new" as const,
          property_id: "prop_uuid_1",
          ota_name: "Booking.com",
          ota_reservation_code: "BKG-778899",
          arrival_date: "2026-10-15",
          departure_date: "2026-10-18",
          amount: "4500000.00",
          currency: "VND",
          customer: {
            name: "John",
            surname: "Doe",
            phone: "+84901234567",
          },
          rooms: [
            {
              room_type_id: "rt_deluxe_chx",
              rate_plan_id: "rp_deluxe_chx",
              checkin_date: "2026-10-15",
              checkout_date: "2026-10-18",
              amount: "4500000.00",
            },
          ],
        },
      };

      // Mock property mapping tìm thấy
      mockPrisma.channexMapping.findFirst
        .mockResolvedValueOnce({ hotelId: "hotel_1", channexId: "prop_uuid_1" }) // property mapping
        .mockResolvedValueOnce(null) // deduplication check (chưa tồn tại)
        .mockResolvedValueOnce({ localId: "catalog-DELUXE" }); // room_type mapping
      mockPrisma.roomType.findFirst.mockResolvedValue({ id: "catalog-DELUXE", name: "DELUXE" });

      mockPrisma.room.findFirst.mockResolvedValue({ id: "room_101", type: "DELUXE" });
      mockPrisma.reservation.create.mockResolvedValue({
        id: "resv_local_1",
        hotelId: "hotel_1",
        reservationCode: "Booking.com-BKG-778899",
      });

      mockApiClient.ackBookingRevision.mockResolvedValue({ data: { message: "Success" } });

      const res = await ingestionService.processSingleRevision(revisionItem);

      expect(res.action).toBe("CREATED");
      expect(res.reservationId).toBe("resv_local_1");
      expect(mockPrisma.reservation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            guestDisplayName: "John Doe",
            roomId: "room_101",
            roomTypeSnapshot: "DELUXE",
            status: "CONFIRMED",
          }),
        }),
      );

      // Phải lưu mapping booking
      expect(mockPrisma.channexMapping.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: "booking",
            localId: "resv_local_1",
            channexId: "bk_chx_999",
          }),
        }),
      );

      // Phải ack ngay sau khi xử lý thành công
      expect(mockApiClient.ackBookingRevision).toHaveBeenCalledWith("rev_uuid_101", undefined);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: "Serializable",
      });
      expect(mockPrisma.room.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ roomTypeId: "catalog-DELUXE" }]),
            reservations: {
              none: expect.objectContaining({
                plannedCheckInAt: { lt: new Date("2026-10-18T05:00:00.000Z") },
                plannedCheckOutAt: { gt: new Date("2026-10-15T07:00:00.000Z") },
              }),
            },
          }),
        }),
      );
    });

    it("tạo một reservation segment cho mỗi phòng của booking nhiều phòng", async () => {
      const revisionItem = {
        id: "rev_uuid_multi",
        type: "booking_revision",
        attributes: {
          booking_id: "bk_multi_room",
          status: "new" as const,
          property_id: "prop_uuid_1",
          ota_name: "Booking.com",
          ota_reservation_code: "MULTI-100",
          arrival_date: "2026-11-01",
          departure_date: "2026-11-03",
          amount: "3000000.00",
          currency: "VND",
          rooms: [
            {
              room_type_id: "rt_deluxe_chx",
              rate_plan_id: "rp_deluxe_chx",
              checkin_date: "2026-11-01",
              checkout_date: "2026-11-03",
              amount: "1500000.00",
            },
            {
              room_type_id: "rt_deluxe_chx",
              rate_plan_id: "rp_deluxe_chx",
              checkin_date: "2026-11-01",
              checkout_date: "2026-11-03",
              amount: "1500000.00",
            },
          ],
        },
      };
      mockPrisma.channexMapping.findFirst
        .mockResolvedValueOnce({ hotelId: "hotel_1" })
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ localId: "DELUXE" });
      mockPrisma.room.findFirst
        .mockResolvedValueOnce({ id: "room_101" })
        .mockResolvedValueOnce({ id: "room_102" });
      mockPrisma.reservation.create
        .mockResolvedValueOnce({ id: "resv_segment_1" })
        .mockResolvedValueOnce({ id: "resv_segment_2" });

      const res = await ingestionService.processSingleRevision(revisionItem);

      expect(res.action).toBe("CREATED");
      expect(mockPrisma.reservation.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.channexMapping.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              reservationIds: ["resv_segment_1", "resv_segment_2"],
            }),
          }),
        }),
      );
    });

    it("không tự ghi đè booking modified; giữ revision chưa ack tới khi đối soát", async () => {
      const revisionItem = {
        id: "rev_uuid_modified",
        type: "booking_revision",
        attributes: {
          booking_id: "bk_modified",
          status: "modified" as const,
          property_id: "prop_uuid_1",
          arrival_date: "2026-12-01",
          departure_date: "2026-12-04",
          amount: "2000000.00",
          currency: "VND",
        },
      };
      mockPrisma.channexMapping.findFirst
        .mockResolvedValueOnce({ hotelId: "hotel_1" })
        .mockResolvedValueOnce({ localId: "resv_existing", metadata: {} });

      const res = await ingestionService.processSingleRevision(revisionItem);

      expect(res.action).toBe("RECONCILIATION_REQUIRED");
      expect(mockPrisma.reservation.update).not.toHaveBeenCalled();
      expect(mockPrisma.channelSyncLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "WARNING" }) }),
      );
      expect(mockApiClient.ackBookingRevision).not.toHaveBeenCalled();
    });

    it("chống trùng lặp (Deduplication): nếu booking đã có trong PMS thì bỏ qua và ack", async () => {
      const revisionItem = {
        id: "rev_uuid_102",
        type: "booking_revision",
        attributes: {
          booking_id: "bk_already_exists",
          status: "new" as const,
          property_id: "prop_uuid_1",
          arrival_date: "2026-10-20",
          departure_date: "2026-10-22",
          amount: "2000000.00",
          currency: "VND",
        },
      };

      mockPrisma.channexMapping.findFirst
        .mockResolvedValueOnce({ hotelId: "hotel_1" }) // property mapping
        .mockResolvedValueOnce({ localId: "resv_existing_id" }); // booking mapping đã có

      const res = await ingestionService.processSingleRevision(revisionItem);

      expect(res.action).toBe("DEDUPLICATED");
      expect(mockPrisma.reservation.create).not.toHaveBeenCalled();
      expect(mockApiClient.ackBookingRevision).toHaveBeenCalledWith("rev_uuid_102", undefined);
    });

    it("bỏ qua và ack an toàn nếu revision thuộc property không thuộc PMS (Account-wide feed safety)", async () => {
      const revisionItem = {
        id: "rev_uuid_103",
        type: "booking_revision",
        attributes: {
          booking_id: "bk_foreign_prop",
          status: "new" as const,
          property_id: "prop_foreign_unknown",
          arrival_date: "2026-10-20",
          departure_date: "2026-10-22",
          amount: "100.00",
          currency: "EUR",
        },
      };

      mockPrisma.channexMapping.findFirst.mockResolvedValueOnce(null); // không tìm thấy property mapping

      const res = await ingestionService.processSingleRevision(revisionItem);

      expect(res.action).toBe("SKIPPED");
      expect(mockApiClient.ackBookingRevision).toHaveBeenCalledWith("rev_uuid_103", undefined);
    });

    it("tiếp nhận Webhook từ Channex: xác thực và tự động gọi API lấy revision gốc, ghi CSDL và ack", async () => {
      const webhookPayload = {
        event: "booking",
        payload: {
          booking_id: "bk_webhook_real_001",
          property_id: "prop_uuid_1",
          revision_id: "rev_webhook_777",
        },
        user_id: "usr_channex_test",
      };

      const revisionDetail = {
        id: "rev_webhook_777",
        type: "booking_revision",
        attributes: {
          booking_id: "bk_webhook_real_001",
          status: "new" as const,
          property_id: "prop_uuid_1",
          ota_name: "Booking.com",
          ota_reservation_code: "BKG-REAL-999",
          arrival_date: "2026-10-15",
          departure_date: "2026-10-18",
          amount: "3200000.00",
          currency: "VND",
          customer: {
            name: "Michael",
            surname: "Real",
          },
          rooms: [
            {
              room_type_id: "rt_deluxe_chx",
              rate_plan_id: "rp_deluxe_chx",
              checkin_date: "2026-10-15",
              checkout_date: "2026-10-18",
              amount: "3200000.00",
            },
          ],
        },
      };

      mockApiClient.getBookingRevision.mockResolvedValue({ data: revisionDetail });
      mockPrisma.channexMapping.findFirst
        .mockResolvedValueOnce({ hotelId: "hotel_1", channexId: "prop_uuid_1" })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ localId: "DELUXE" });
      mockPrisma.room.findFirst.mockResolvedValue({
        id: "room_101",
        type: "DELUXE",
        roomNumber: "101",
      });
      mockPrisma.reservation.create.mockResolvedValue({
        id: "resv_webhook_1",
        hotelId: "hotel_1",
        reservationCode: "Booking.com-BKG-REAL-999",
      });
      mockApiClient.ackBookingRevision.mockResolvedValue({ data: { message: "Success" } });

      const res = await ingestionService.handleWebhook(webhookPayload as any);

      expect(res.success).toBe(true);
      expect(res.outcome.action).toBe("CREATED");
      expect(mockApiClient.getBookingRevision).toHaveBeenCalledWith("rev_webhook_777", undefined);
      expect(mockApiClient.ackBookingRevision).toHaveBeenCalledWith("rev_webhook_777", undefined);
    });

    it("giả lập bắn booking OTA sang Channex và tự động drain về PMS", async () => {
      mockPrisma.hotel.findUnique.mockResolvedValue({
        id: "hotel_1",
        name: "Test Hotel",
        rooms: [{ id: "r1", type: "DELUXE", price: 1500000 }],
      });
      mockPrisma.channexMapping.findUnique.mockResolvedValue({
        channexId: "prop_chx_1",
      });
      mockPrisma.channexMapping.findMany.mockResolvedValue([
        { kind: "room_type", localId: "catalog-DELUXE", channexId: "rt_deluxe_chx" },
      ]);
      mockPrisma.roomType.findMany.mockResolvedValue([
        {
          id: "catalog-DELUXE",
          hotelId: "hotel_1",
          name: "DELUXE",
          normalizedKey: "deluxe",
          basePrice: 1500000,
        },
      ]);
      mockPrisma.roomType.findFirst.mockResolvedValue({ id: "catalog-DELUXE", name: "DELUXE" });
      // findFirst: rate plan mapping, then property mapping lookup inside processSingleRevision
      mockPrisma.channexMapping.findFirst
        .mockResolvedValueOnce({
          kind: "rate_plan",
          localId: "catalog-DELUXE:STANDARD",
          channexId: "rp_deluxe_chx",
        })
        .mockResolvedValueOnce({ hotelId: "hotel_1" }) // property mapping
        .mockResolvedValueOnce(null) // booking deduplication
        .mockResolvedValueOnce({ localId: "catalog-DELUXE" }); // room type mapping
      mockPrisma.room.findFirst.mockResolvedValue({ id: "room_101", type: "DELUXE" });
      mockPrisma.reservation.create.mockResolvedValue({
        id: "resv_sim_1",
        hotelId: "hotel_1",
        reservationCode: "AGODA-SIM-001",
        status: "CONFIRMED",
        plannedCheckInAt: new Date("2026-10-05T07:00:00Z"),
        plannedCheckOutAt: new Date("2026-10-07T05:00:00Z"),
      });
      mockPrisma.channexMapping.create.mockResolvedValue({});
      mockPrisma.channelSyncLog.create.mockResolvedValue({});
      mockPrisma.reservation.findUnique.mockResolvedValue({
        id: "resv_sim_1",
        reservationCode: "AGODA-SIM-001",
        status: "CONFIRMED",
        roomId: "room_101",
        room: { roomNumber: "101" },
        plannedCheckInAt: new Date("2026-10-05T07:00:00Z"),
        plannedCheckOutAt: new Date("2026-10-07T05:00:00Z"),
      });
      mockApiClient.getBookingFeed.mockResolvedValue({ data: [] });

      const res = await ingestionService.simulateOtaBooking("hotel_1", {
        otaName: "Agoda",
        roomType: "DELUXE",
      });

      expect(res.success).toBe(true);
      expect(res.channexBookingId).toMatch(/^sim-/); // synthetic ID
      expect(res.otaReservationCode).toMatch(/^AGODA-/);
      expect(res.reservation?.roomNumber).toBe("101");
      expect(res.roomType).toBe("DELUXE");
      expect(mockPrisma.reservation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ roomTypeSnapshot: "DELUXE" }) }),
      );
      expect(mockPrisma.channexMapping.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ localId: "catalog-DELUXE:STANDARD" }),
        }),
      );
      // Không gọi Channex API tạo booking nữa
      expect(mockApiClient.createBooking).not.toHaveBeenCalled();
    });

    it("giả lập hủy booking OTA và cập nhật status CANCELLED", async () => {
      const bookingData = {
        hotelId: "hotel_1",
        kind: "booking",
        localId: "resv_sim_1",
        channexId: "sim-bk-123",
        metadata: {
          otaName: "Booking.com",
          otaReservationCode: "BOOKING.COM-998877",
          reservationIds: ["resv_sim_1"],
        },
      };

      mockPrisma.channexMapping.findFirst
        .mockResolvedValueOnce(bookingData) // 1. simulateCancelOtaBooking booking lookup
        .mockResolvedValueOnce({
          hotelId: "hotel_1",
          channexId: "prop_chx_1",
        }) // 2. processSingleRevision property lookup
        .mockResolvedValueOnce(bookingData); // 3. tx.channexMapping.findFirst inside processSingleRevision

      mockPrisma.channexMapping.findUnique.mockResolvedValue({
        channexId: "prop_chx_1",
      });
      mockPrisma.reservation.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.channelSyncLog.create.mockResolvedValue({});

      const res = await ingestionService.simulateCancelOtaBooking("hotel_1", {
        bookingId: "sim-bk-123",
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe("CANCELLED");
      expect(res.bookingId).toBe("sim-bk-123");
      expect(mockPrisma.reservation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: "CANCELLED" },
        }),
      );
    });

    it("lấy danh sách các đơn đặt phòng thử nghiệm gần đây", async () => {
      mockPrisma.channexMapping.findMany.mockResolvedValue([
        {
          id: "m1",
          hotelId: "hotel_1",
          kind: "booking",
          localId: "resv_1",
          channexId: "sim-123",
          metadata: { otaName: "Agoda", otaReservationCode: "AGODA-1", amount: 1500000 },
          createdAt: new Date("2026-10-01T00:00:00Z"),
        },
      ]);
      mockPrisma.reservation.findMany.mockResolvedValue([
        {
          id: "resv_1",
          hotelId: "hotel_1",
          reservationCode: "AGODA-1",
          status: "CONFIRMED",
          plannedCheckInAt: new Date("2026-10-02T07:00:00Z"),
          plannedCheckOutAt: new Date("2026-10-04T05:00:00Z"),
          guestDisplayName: "Nguyen Van A",
          guestPhone: "0901234567",
          roomTypeSnapshot: "DELUXE",
          room: { roomNumber: "101", type: "DELUXE" },
        },
      ]);

      const list = await ingestionService.getRecentSimulatedBookings("hotel_1");
      expect(list).toHaveLength(1);
      expect(list[0].bookingId).toBe("sim-123");
      expect(list[0].roomNumber).toBe("101");
      expect(list[0].status).toBe("CONFIRMED");
    });
  });

  // ================= 5. DOCTOR SERVICE TESTS ================= //
  describe("Component 5: ChannexDoctorService", () => {
    let doctorService: ChannexDoctorService;

    beforeEach(() => {
      doctorService = new ChannexDoctorService(mockPrisma, mockApiClient);
    });

    it("chạy chẩn đoán toàn diện và báo cáo PASS khi tất cả các thành phần hoàn hảo", async () => {
      const hotelId = "hotel_1";
      mockApiClient.getProperties.mockResolvedValue({ data: [{ id: "prop_1" }] });
      mockPrisma.channexMapping.findUnique.mockResolvedValue({ channexId: "prop_1" });
      mockApiClient.getProperty.mockResolvedValue({
        data: { attributes: { title: "Hotel Test", currency: "VND" } },
      });

      mockPrisma.room.findMany.mockResolvedValue([
        { type: "STANDARD", price: 900000 },
        { type: "DELUXE", price: 1200000 },
      ]);
      mockPrisma.channexMapping.findMany
        .mockResolvedValueOnce([
          { kind: "room_type", localId: "STANDARD" },
          { kind: "room_type", localId: "DELUXE" },
        ])
        .mockResolvedValueOnce([
          { kind: "rate_plan", localId: "STANDARD:STANDARD" },
          { kind: "rate_plan", localId: "DELUXE:STANDARD" },
        ]);

      mockApiClient.getBookingFeed.mockResolvedValue({
        data: [],
        meta: { total: 0 },
      });

      mockPrisma.channelSyncLog.findFirst.mockResolvedValue({
        status: "SUCCESS",
        syncType: "CHANNEX_ARI_PUSH",
        createdAt: new Date(),
        details: "{}",
      });

      const report = await doctorService.runDoctor(hotelId);

      expect(report.healthy).toBe(true);
      expect(report.checks.every((c) => c.status === "PASS")).toBe(true);
    });
  });

  describe("Component 6: ChannexFeedScheduler", () => {
    it("không chạy chồng hai lượt poll", async () => {
      const previous = process.env.CHANNEX_API_KEY;
      process.env.CHANNEX_API_KEY = "configured-for-test";
      let resolveDrain!: () => void;
      const drainFeed = jest.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveDrain = resolve;
          }),
      );
      const scheduler = new ChannexFeedScheduler({ drainFeed } as any);
      try {
        const first = scheduler.poll();
        await Promise.resolve();
        await expect(scheduler.poll()).resolves.toEqual({
          skipped: true,
          reason: "already_running",
        });
        expect(drainFeed).toHaveBeenCalledTimes(1);
        resolveDrain();
        await first;
      } finally {
        if (previous === undefined) delete process.env.CHANNEX_API_KEY;
        else process.env.CHANNEX_API_KEY = previous;
      }
    });
  });

  describe("Component 7: ChannexChannelSessionService", () => {
    it("trả toàn bộ adapter động và trạng thái kết nối của property", async () => {
      mockPrisma.channexMapping.findUnique.mockResolvedValue({
        channexId: "property_1",
      });
      mockApiClient.getChannelAdapters.mockResolvedValue({
        data: [
          {
            code: "BookingCom",
            title: "Booking.com",
            kind: "ota",
            params: {
              hotel_id: { position: 0, type: "string", title: "Hotel ID" },
            },
            mapping_mode: "room_rate_multioccupancy",
            property_mapping: "single",
            message_support: true,
          },
          {
            code: "Agoda",
            title: "Agoda",
            kind: "ota",
            params: {},
            mapping_mode: "room_rate_multioccupancy",
            property_mapping: "single",
            message_support: false,
          },
        ],
      });
      mockApiClient.getChannels.mockResolvedValue({
        data: [
          {
            id: "channel_1",
            attributes: {
              channel: "BookingCom",
              title: "Booking.com — Test Hotel",
              currency: "GBP",
              is_active: false,
            },
          },
        ],
      });
      const service = new ChannexChannelSessionService(mockPrisma, mockApiClient);

      const result = await service.getCatalog("hotel_1");

      expect(mockApiClient.getChannels).toHaveBeenCalledWith("property_1");
      expect(result.providers.map((provider) => provider.title)).toEqual(["Agoda", "Booking.com"]);
      expect(result.providers[1].parameters).toEqual([
        {
          key: "hotel_id",
          title: "Hotel ID",
          type: "string",
          position: 0,
        },
      ]);
      expect(result.connections).toEqual([
        {
          id: "channel_1",
          code: "BookingCom",
          title: "Booking.com — Test Hotel",
          currency: "GBP",
          isActive: false,
        },
      ]);
      expect(result.isConfigured).toBe(true);
    });

    it("trả danh sách rỗng và isConfigured=false thay vì ném ngoại lệ khi API key chưa được cấu hình", async () => {
      mockApiClient.isConfigured.mockReturnValueOnce(false);
      mockPrisma.channexMapping.findUnique.mockResolvedValue({
        channexId: "property_1",
      });
      const service = new ChannexChannelSessionService(mockPrisma, mockApiClient);

      const result = await service.getCatalog("hotel_1");

      expect(mockApiClient.getChannelAdapters).not.toHaveBeenCalled();
      expect(result.providers).toEqual([]);
      expect(result.connections).toEqual([]);
      expect(result.isConfigured).toBe(false);
    });

    it("bắt lỗi Channex API và trả danh sách rỗng thay vì ném ngoại lệ khi Channex lỗi", async () => {
      mockApiClient.isConfigured.mockReturnValueOnce(true);
      mockApiClient.getChannelAdapters.mockRejectedValueOnce(new Error("Channex 502 Bad Gateway"));
      mockPrisma.channexMapping.findUnique.mockResolvedValue(null);
      const service = new ChannexChannelSessionService(mockPrisma, mockApiClient);

      const result = await service.getCatalog("hotel_1");

      expect(result.providers).toEqual([]);
      expect(result.connections).toEqual([]);
      expect(result.isConfigured).toBe(true);
    });

    it("chuẩn bị wizard động bằng adapter, group, rate plans và mapping OTA", async () => {
      mockPrisma.channexMapping.findUnique.mockResolvedValue({
        channexId: "property_1",
      });
      mockApiClient.getChannelAdapter.mockResolvedValue({
        data: {
          code: "BookingCom",
          title: "Booking.com",
          kind: "meta",
          params: {
            hotel_id: { position: 0, type: "string", title: "Hotel ID" },
          },
          rate_params: {},
          mapping_mode: "room_rate_multioccupancy",
          property_mapping: "single",
          actions: [],
          message_support: true,
        },
      });
      mockApiClient.getProperty.mockResolvedValue({
        data: {
          attributes: { title: "Test Hotel", currency: "GBP" },
          relationships: { groups: [{ id: "group_1" }] },
        },
      });
      mockApiClient.getRatePlanOptions.mockResolvedValue({
        data: [
          {
            id: "rate_1",
            attributes: { title: "Standard", room_type_id: "room_1" },
          },
        ],
      });
      mockApiClient.getChannelConnectionDetails.mockResolvedValue({
        data: { attributes: { currency: "GBP" } },
      });
      mockApiClient.getChannelMappingDetails.mockResolvedValue({
        data: {
          rooms: [
            {
              id: 100,
              title: "Double",
              rates: [
                {
                  id: 200,
                  title: "Standard",
                  pricing: "OBP",
                  occupancies: [1, 2],
                  max_persons: 2,
                },
              ],
            },
          ],
        },
      });
      mockApiClient.testChannelConnection.mockResolvedValue({
        data: { success: true, errors: null },
      });
      const service = new ChannexChannelSessionService(mockPrisma, mockApiClient);

      const result = await service.prepareNativeChannel("hotel_1", {
        channel: "BookingCom",
        settings: { hotel_id: "5868189" },
      });

      expect(result.supported).toBe(true);
      expect(result.groupId).toBe("group_1");
      expect(result.currency).toBe("GBP");
      expect(result.localRatePlans).toHaveLength(1);
      expect(result.mappingDetails.rooms[0].rates[0].id).toBe(200);
    });

    it("tạo channel inactive rồi kiểm tra readiness, không tự activate", async () => {
      mockPrisma.channexMapping.findUnique.mockResolvedValue({
        channexId: "property_1",
      });
      mockApiClient.getChannelAdapter.mockResolvedValue({
        data: {
          code: "BookingCom",
          title: "Booking.com",
          kind: "meta",
          params: {
            hotel_id: { position: 0, type: "string", title: "Hotel ID" },
          },
          rate_params: {
            room_type_code: { position: 0, type: "string" },
            rate_plan_code: { position: 1, type: "string" },
            occupancy: { position: 2, type: "integer" },
            pricing_type: { position: 3, type: "string" },
            primary_occ: { position: 4, type: "boolean" },
          },
          mapping_mode: "room_rate_multioccupancy",
          property_mapping: "single",
          actions: [],
          message_support: true,
        },
      });
      mockApiClient.getProperty.mockResolvedValue({
        data: {
          attributes: { title: "Test Hotel", currency: "GBP" },
          relationships: { groups: [{ id: "group_1" }] },
        },
      });
      mockApiClient.getRatePlanOptions.mockResolvedValue({
        data: [{ id: "rate_1", attributes: { title: "Standard" } }],
      });
      mockApiClient.testChannelConnection.mockResolvedValue({
        data: { success: true, errors: null },
      });
      mockApiClient.getChannelConnectionDetails.mockResolvedValue({
        data: { attributes: { currency: "GBP" } },
      });
      mockApiClient.getChannelMappingDetails.mockResolvedValue({
        data: {
          rooms: [
            {
              id: 100,
              rates: [{ id: 200, occupancies: [1, 2] }],
            },
          ],
        },
      });
      mockApiClient.createChannel.mockResolvedValue({
        data: { id: "channel_1", attributes: { is_active: false } },
      });
      mockApiClient.checkChannelReadiness.mockResolvedValue({ data: [] });
      const service = new ChannexChannelSessionService(mockPrisma, mockApiClient);

      const result = await service.createNativeChannel("hotel_1", {
        channel: "BookingCom",
        title: "Booking.com — Test Hotel",
        settings: { hotel_id: "5868189" },
        ratePlans: [
          {
            rate_plan_id: "rate_1",
            settings: {
              room_type_code: 100,
              rate_plan_code: 200,
              occupancy: 2,
              pricing_type: "OBP",
              primary_occ: true,
            },
          },
        ],
      });

      expect(mockApiClient.createChannel).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: false, group_id: "group_1" }),
      );
      expect(mockApiClient.activateChannel).not.toHaveBeenCalled();
      expect(result.ready).toBe(true);
      expect(result.channelId).toBe("channel_1");
    });

    it("từ chối occupancy OTA vượt sức chứa rate plan VietSage", async () => {
      mockPrisma.channexMapping.findUnique.mockResolvedValue({
        channexId: "property_1",
      });
      mockApiClient.getProperty.mockResolvedValue({
        data: {
          attributes: { currency: "USD" },
          relationships: { groups: [{ id: "group_1" }] },
        },
      });
      mockApiClient.getRatePlanOptions.mockResolvedValue({
        data: [{ id: "rate_1", attributes: { occupancy: 2 } }],
      });
      mockApiClient.getChannelAdapter.mockResolvedValue({
        data: {
          code: "BookingCom",
          title: "Booking.com",
          mapping_mode: "room_rate_multioccupancy",
          params: { hotel_id: { type: "string", required: true } },
          rate_params: {
            room_type_code: { type: "string", required: true },
            rate_plan_code: { type: "string", required: true },
            occupancy: { type: "integer", required: true },
          },
        },
      });
      mockApiClient.testChannelConnection.mockResolvedValue({
        data: { success: true },
      });
      mockApiClient.getChannelConnectionDetails.mockResolvedValue({
        data: { attributes: { currency: "USD" } },
      });
      mockApiClient.getChannelMappingDetails.mockResolvedValue({
        data: {
          rooms: [
            {
              id: 100,
              rates: [{ id: 200, occupancies: [2, 3] }],
            },
          ],
        },
      });
      mockApiClient.createChannel.mockResolvedValue({
        data: { id: "channel_1", attributes: { is_active: false } },
      });
      mockApiClient.checkChannelReadiness.mockResolvedValue({ data: [] });
      const service = new ChannexChannelSessionService(mockPrisma, mockApiClient);

      await expect(
        service.createNativeChannel("hotel_1", {
          channel: "BookingCom",
          title: "Booking.com — Invalid Occupancy Test",
          settings: { hotel_id: "5868189" },
          ratePlans: [
            {
              rate_plan_id: "rate_1",
              settings: {
                room_type_code: 100,
                rate_plan_code: 200,
                occupancy: 3,
              },
            },
          ],
        }),
      ).rejects.toThrow("vượt quá sức chứa 2");
      expect(mockApiClient.createChannel).not.toHaveBeenCalled();
    });

    it("chỉ kích hoạt channel thuộc property và đã đạt readiness", async () => {
      mockPrisma.channexMapping.findUnique.mockResolvedValue({
        channexId: "property_1",
      });
      mockApiClient.getChannels.mockResolvedValue({
        data: [
          {
            id: "channel_1",
            attributes: { channel: "BookingCom", is_active: false },
          },
        ],
      });
      mockApiClient.checkChannelReadiness.mockResolvedValue({ data: [] });
      mockApiClient.activateChannel.mockResolvedValue({ data: { meta: { message: "Success" } } });
      const service = new ChannexChannelSessionService(mockPrisma, mockApiClient);

      const result = await service.activateNativeChannel("hotel_1", "channel_1");

      expect(result).toEqual({ channelId: "channel_1", isActive: true });
      expect(mockApiClient.activateChannel).toHaveBeenCalledWith("channel_1");
    });

    it("tạo URL iframe headless bằng one-time token và property mapping", async () => {
      mockPrisma.channexMapping.findUnique.mockResolvedValue({
        channexId: "90958ec0-9214-4796-873e-4add0d834670",
      });
      mockApiClient.createChannelOneTimeToken.mockResolvedValue({
        data: { token: "94feab9f-60e6-411b-d854-8f12004d8bc8" },
      });
      mockApiClient.getProperty.mockResolvedValue({
        data: {
          relationships: {
            groups: [
              {
                id: "dccd3b3d-b0f7-4d39-83dc-c60187b2b802",
                type: "group",
              },
            ],
          },
        },
      });
      const service = new ChannexChannelSessionService(mockPrisma, mockApiClient);

      const result = await service.create("hotel_1", "owner@example.com");

      const iframeUrl = new URL(result.iframeUrl);
      expect(iframeUrl.origin).toBe("https://staging.channex.io");
      expect(iframeUrl.pathname).toBe("/auth/exchange");
      expect(iframeUrl.searchParams.get("oauth_session_key")).toBe(
        "94feab9f-60e6-411b-d854-8f12004d8bc8",
      );
      expect(iframeUrl.searchParams.get("property_id")).toBe(
        "90958ec0-9214-4796-873e-4add0d834670",
      );
      expect(iframeUrl.searchParams.get("redirect_to")).toBe("/channels");
      expect(iframeUrl.searchParams.get("group_id")).toBe("dccd3b3d-b0f7-4d39-83dc-c60187b2b802");
      expect(result.expiresInSeconds).toBe(900);
      expect(mockApiClient.createChannelOneTimeToken).toHaveBeenCalledWith({
        property_id: "90958ec0-9214-4796-873e-4add0d834670",
        group_id: "dccd3b3d-b0f7-4d39-83dc-c60187b2b802",
        username: "owner@example.com",
      });
    });

    it("mở thẳng giao diện sửa mapping của channel thuộc property", async () => {
      mockPrisma.channexMapping.findUnique.mockResolvedValue({
        channexId: "90958ec0-9214-4796-873e-4add0d834670",
      });
      mockApiClient.getProperty.mockResolvedValue({ data: { relationships: { groups: [] } } });
      mockApiClient.getChannels.mockResolvedValue({
        data: [{ id: "11111111-1111-4111-8111-111111111111", attributes: {} }],
      });
      mockApiClient.createChannelOneTimeToken.mockResolvedValue({
        data: { token: "one-time-token" },
      });
      const service = new ChannexChannelSessionService(mockPrisma, mockApiClient);

      const result = await service.create(
        "hotel_1",
        "owner@example.com",
        "11111111-1111-4111-8111-111111111111",
      );

      expect(new URL(result.iframeUrl).searchParams.get("redirect_to")).toBe(
        "/channels/11111111-1111-4111-8111-111111111111/edit",
      );
    });
  });
});
