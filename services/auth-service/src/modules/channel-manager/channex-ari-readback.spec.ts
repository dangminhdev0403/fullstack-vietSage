process.env.DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock";
process.env.NODE_ENV = "test";
process.env.PORT = "3000";
process.env.JWT_ACCESS_SECRET = "mock_jwt_access_secret_32_chars_long!!";
process.env.JWT_REFRESH_SECRET = "mock_jwt_refresh_secret_32_chars_long!";
process.env.JWT_ACCESS_TTL = "15m";
process.env.JWT_REFRESH_TTL = "7d";

import { ChannexAriSyncService } from "./services/channex-ari-sync.service";
import { AriCoreService } from "./services/ari-core.service";
import { BadRequestException } from "@nestjs/common";

describe("ChannexAriSyncService - ARI Readback Verification & Honest Status (Focused Suite)", () => {
  let mockPrisma: any;
  let mockApiClient: any;
  let ariCoreService: AriCoreService;
  let ariSyncService: ChannexAriSyncService;

  const hotelId = "hotel_ari_test";
  const propertyId = "prop_chx_100";
  const roomTypeId = "rt_deluxe_chx";
  const ratePlanId = "rp_deluxe_chx";

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const addDays = (baseIso: string, days: number): string => {
    const d = new Date(`${baseIso}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split("T")[0];
  };

  beforeEach(() => {
    mockPrisma = {
      hotel: {
        findUnique: jest.fn(),
      },
      room: {
        findMany: jest.fn().mockResolvedValue([
          { id: "r1", type: "DELUXE", price: 1500000 },
          { id: "r2", type: "DELUXE", price: 1500000 },
        ]),
        findFirst: jest.fn(),
      },
      roomType: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "catalog-DELUXE",
            hotelId,
            name: "DELUXE",
            normalizedKey: "deluxe",
            basePrice: 1500000,
          },
        ]),
        findFirst: jest.fn(),
      },
      reservation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      channelDailyAvailability: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      channelDailyRestriction: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      channexMapping: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          if (where.hotelId_kind_localId?.kind === "property") {
            return Promise.resolve({ channexId: propertyId });
          }
          return Promise.resolve(null);
        }),
        findMany: jest.fn().mockResolvedValue([
          { kind: "room_type", localId: "catalog-DELUXE", channexId: roomTypeId },
          { kind: "rate_plan", localId: "catalog-DELUXE:STANDARD", channexId: ratePlanId },
        ]),
      },
      channelSyncLog: {
        create: jest.fn().mockResolvedValue({ id: "log_1" }),
      },
    };

    mockApiClient = {
      getBaseUrl: jest.fn(() => "https://staging.channex.io/api/v1"),
      getProperty: jest.fn().mockResolvedValue({
        data: { attributes: { currency: "VND" } },
      }),
      getChannels: jest.fn().mockResolvedValue({ data: [] }),
      fullSyncChannel: jest.fn().mockResolvedValue({ data: {} }),
      postAvailability: jest.fn().mockResolvedValue({ data: { message: "Success" } }),
      postRestrictions: jest.fn().mockResolvedValue({ data: { message: "Success" } }),
      getAvailability: jest.fn(),
      getRestrictions: jest.fn(),
    };

    ariCoreService = new AriCoreService(mockPrisma);
    ariSyncService = new ChannexAriSyncService(mockPrisma, ariCoreService, mockApiClient);
  });

  // TDD 1: Regression test for multi-day readback verification (entire effective range)
  it("fails verification and returns success:false when provider readback is missing subsequent days in range", async () => {
    const d0 = today;
    const d1 = addDays(today, 1);
    const d2 = addDays(today, 2);
    mockApiClient.getAvailability.mockResolvedValue({
      data: {
        [roomTypeId]: {
          [d0]: 2, // Only day 1 present; day 2 and day 3 missing!
        },
      },
    });
    mockApiClient.getRestrictions.mockResolvedValue({
      data: {
        [ratePlanId]: {
          [d0]: {
            rate: "1500000.00",
            min_stay_arrival: 1,
            stop_sell: false,
            closed_to_arrival: false,
            closed_to_departure: false,
          },
          // day 2 and day 3 missing!
        },
      },
    });

    const result = await ariSyncService.pushAri(hotelId, {
      startDate: d0,
      endDate: d2,
    });

    expect(result.success).toBe(false);
    expect(result.readbackVerified.availabilityMatch).toBe(false);
    expect(result.readbackVerified.restrictionsMatch).toBe(false);

    expect(mockPrisma.channelSyncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
        }),
      }),
    );
    expect(mockApiClient.fullSyncChannel).not.toHaveBeenCalled();
  });

  // TDD 2: Regression test for arrival/departure restrictions verification
  it("fails verification when closed_to_arrival or closed_to_departure restrictions do not match provider readback", async () => {
    // Inject custom restriction with closedToArrival: true into DB
    mockPrisma.channelDailyRestriction.findMany.mockResolvedValue([
      {
        roomType: "DELUXE",
        date: new Date(`${today}T00:00:00.000Z`),
        ratePlanCode: "STANDARD",
        rate: 1500000,
        minStayArrival: 1,
        minStayThrough: 1,
        maxStay: 0,
        stopSell: false,
        closedToArrival: true,
        closedToDeparture: false,
      },
    ]);

    mockApiClient.getAvailability.mockResolvedValue({
      data: { [roomTypeId]: { [today]: 2 } },
    });
    // Provider returns closed_to_arrival: false (mismatch!)
    mockApiClient.getRestrictions.mockResolvedValue({
      data: {
        [ratePlanId]: {
          [today]: {
            rate: "1500000.00",
            min_stay_arrival: 1,
            stop_sell: false,
            closed_to_arrival: false, // MISMATCH with sent closedToArrival: true
            closed_to_departure: false,
          },
        },
      },
    });

    const result = await ariSyncService.pushAri(hotelId, {
      startDate: today,
      endDate: today,
    });

    expect(result.success).toBe(false);
    expect(result.readbackVerified.restrictionsMatch).toBe(false);
    expect(mockPrisma.channelSyncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
        }),
      }),
    );
    expect(mockApiClient.fullSyncChannel).not.toHaveBeenCalled();
  });

  // TDD 3: Regression test for empty provider response (vacuous success avoidance)
  it("avoids vacuous success when provider returns empty data object", async () => {
    mockApiClient.getAvailability.mockResolvedValue({ data: {} });
    mockApiClient.getRestrictions.mockResolvedValue({ data: {} });

    const result = await ariSyncService.pushAri(hotelId, {
      startDate: today,
      endDate: today,
    });

    expect(result.success).toBe(false);
    expect(result.readbackVerified.availabilityMatch).toBe(false);
    expect(result.readbackVerified.restrictionsMatch).toBe(false);
    expect(mockPrisma.channelSyncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
        }),
      }),
    );
  });

  // TDD 4: Regression test for readback transport error handling
  it("does not produce SUCCESS log or success:true outcome when readback encounters a transport error", async () => {
    mockApiClient.getAvailability.mockRejectedValue(
      new Error("Network timeout contacting Channex GET /availability"),
    );

    const result = await ariSyncService.pushAri(hotelId, {
      startDate: today,
      endDate: today,
    });

    expect(result.success).toBe(false);
    expect(result.readbackVerified.availabilityMatch).toBe(false);
    expect(result.readbackVerified.restrictionsMatch).toBe(false);
    expect(mockPrisma.channelSyncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
        }),
      }),
    );
    expect(mockApiClient.fullSyncChannel).not.toHaveBeenCalled();
  });

  // TDD 5: Regression test for provider write failure handling without duplicate retries
  it("reflects write partial failure honestly with success:false and FAILED status without retrying postAvailability", async () => {
    mockApiClient.postRestrictions.mockRejectedValue(
      new Error("Channex 502 Bad Gateway on /restrictions"),
    );

    const result = await ariSyncService.pushAri(hotelId, {
      startDate: today,
      endDate: today,
    });

    expect(result.success).toBe(false);
    expect(mockApiClient.postAvailability).toHaveBeenCalledTimes(1);
    expect(mockApiClient.postRestrictions).toHaveBeenCalledTimes(1);
    expect(mockApiClient.getAvailability).not.toHaveBeenCalled();
    expect(mockPrisma.channelSyncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
        }),
      }),
    );
  });

  // TDD 6: Bounded paging and range limit
  it("rejects date range exceeding explicit limit of 365 days with BadRequestException", async () => {
    await expect(
      ariSyncService.pushAri(hotelId, {
        startDate: today,
        endDate: addDays(today, 370), // 371 days
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // TDD 7: Successful multi-day availability-only push and readback across all days
  it("verifies multi-day availability-only push across entire range and triggers OTA full_sync on match", async () => {
    const d0 = today;
    const d1 = addDays(today, 1);
    const d2 = addDays(today, 2);
    mockApiClient.getAvailability.mockResolvedValue({
      data: {
        [roomTypeId]: {
          [d0]: 2,
          [d1]: 2,
          [d2]: 2,
        },
      },
    });
    mockApiClient.getChannels.mockResolvedValue({
      data: [{ id: "ch_booking", attributes: { is_active: true } }],
    });

    const result = await ariSyncService.pushAri(hotelId, {
      startDate: d0,
      endDate: d2,
      availabilityOnly: true,
    });

    expect(result.success).toBe(true);
    expect(result.readbackVerified.availabilityMatch).toBe(true);
    expect(result.readbackVerified.restrictionsMatch).toBe(true);
    expect(mockApiClient.postRestrictions).not.toHaveBeenCalled();
    expect(mockApiClient.getRestrictions).not.toHaveBeenCalled();
    expect(mockApiClient.fullSyncChannel).toHaveBeenCalledWith("ch_booking", undefined);
    expect(mockPrisma.channelSyncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SUCCESS",
        }),
      }),
    );
  });

  // TDD 8: Paged bounded GET requests for 45-day range
  it("pages bounded provider GET requests in chunks of at most 30 days without unbounded memory expansion", async () => {
    const startDate = today;
    const endDate = addDays(today, 44); // 45 future days
    const page1End = addDays(today, 29); // 30 days
    const page2Start = addDays(today, 30); // 15 days

    mockApiClient.getAvailability.mockImplementation((propId: string, from: string, to: string) => {
      const data: Record<string, Record<string, number>> = { [roomTypeId]: {} };
      const cur = new Date(`${from}T00:00:00.000Z`);
      const end = new Date(`${to}T00:00:00.000Z`);
      while (cur <= end) {
        data[roomTypeId][cur.toISOString().split("T")[0]] = 2;
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
      return Promise.resolve({ data });
    });

    const result = await ariSyncService.pushAri(hotelId, {
      startDate,
      endDate,
      availabilityOnly: true,
    });

    expect(result.success).toBe(true);
    expect(result.readbackVerified.availabilityMatch).toBe(true);

    expect(mockApiClient.getAvailability).toHaveBeenCalledTimes(2);
    expect(mockApiClient.getAvailability).toHaveBeenNthCalledWith(
      1,
      propertyId,
      startDate,
      page1End,
      undefined,
    );
    expect(mockApiClient.getAvailability).toHaveBeenNthCalledWith(
      2,
      propertyId,
      page2Start,
      endDate,
      undefined,
    );
  });
});
