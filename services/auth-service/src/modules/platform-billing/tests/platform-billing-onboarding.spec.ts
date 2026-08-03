import { PlatformBillingService } from "../application/platform-billing.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { AppLogger } from "../../../common/logging/app-logger.service";

describe("PlatformBillingService Onboarding & Analytics", () => {
  let service: PlatformBillingService;
  let mockPrisma: any;
  let mockLogger: any;

  beforeEach(() => {
    mockPrisma = {
      $transaction: jest.fn((callback) => callback(mockPrisma)),
      hotel: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "hotel-1", name: "Grand Hotel", code: "GH01" }),
      },
      platformBillingContract: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "contract-1", hotelId: "hotel-1", status: "ACTIVE" }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest
          .fn()
          .mockResolvedValue({ id: "contract-1", hotelId: "hotel-1", status: "ACTIVE" }),
        update: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: "contract-1", ...data })),
      },
      platformBillingContractRevision: {
        create: jest.fn().mockResolvedValue({ id: "rev-1", roomDayUnitPrice: 10000 }),
      },
      platformBillableDay: {
        findMany: jest.fn().mockResolvedValue([{ id: "bd-1" }, { id: "bd-2" }]),
      },
      platformBillingPeriod: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      room: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      platformBillingDailySummary: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    service = new PlatformBillingService(mockPrisma as PrismaService, mockLogger as AppLogger);
  });

  it("creates a new platform billing contract with initial revision", async () => {
    const result = await service.createContract({
      hotelId: "hotel-1",
      roomDayUnitPrice: 15000,
      billingStartedAt: "2026-08-01",
    });

    expect(mockPrisma.hotel.findUnique).toHaveBeenCalledWith({ where: { id: "hotel-1" } });
    expect(result).toBeDefined();
  });

  it("rejects contract creation if active contract already exists", async () => {
    mockPrisma.platformBillingContract.findFirst.mockResolvedValueOnce({ id: "contract-active" });

    await expect(
      service.createContract({
        hotelId: "hotel-1",
        roomDayUnitPrice: 15000,
        billingStartedAt: "2026-08-01",
      }),
    ).rejects.toThrow("Khách sạn đã có hợp đồng tính phí đang hoạt động");
  });

  it("fetches owner analytics with billable days count and estimated fee", async () => {
    mockPrisma.platformBillingContract.findFirst.mockResolvedValueOnce({
      id: "contract-1",
      revisions: [{ roomDayUnitPrice: 20000 }],
    });

    const result = await service.getOwnerAnalytics("hotel-1", "2026-08-01");
    expect(result.hasContract).toBe(true);
    expect(result.billableDaysCount).toBe(2);
    expect(result.estimatedFee).toBe(40000);
  });
});
