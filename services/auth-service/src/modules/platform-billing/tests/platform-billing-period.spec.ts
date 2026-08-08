import { PlatformBillingService } from "../application/platform-billing.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { Prisma } from "@prisma/client";

describe("PlatformBillingService Period & Settlement Invariants", () => {
  let service: PlatformBillingService;
  let mockPrisma: any;
  let mockLogger: any;

  beforeEach(() => {
    mockPrisma = {
      $transaction: jest.fn((callback) => callback(mockPrisma)),
      $queryRaw: jest.fn().mockResolvedValue([{ count: 0 }]),
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: "contract-1" }]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      platformBillingContract: { count: jest.fn().mockResolvedValue(5), findFirst: jest.fn() },
      platformBillingPeriod: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _sum: { total: new Date() }, _count: { id: 2 } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      platformBillableDay: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _count: { id: 10 }, _sum: { amount: 500000 } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      platformBillingDailySummary: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      room: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      platformUsage: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      platformBillingAdjustment: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: "adj-1", ...data })),
      },
      platformBillingSettlement: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: "set-1", ...data })),
      },
    };

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    const mockHotelAccessService = {
      assertHotelAccess: jest.fn().mockResolvedValue(undefined),
    };

    service = new PlatformBillingService(
      mockPrisma as PrismaService,
      mockLogger as AppLogger,
      mockHotelAccessService as any,
    );
  });

  it("finalizes a period snapshot idempotently when status is already FINALIZED", async () => {
    mockPrisma.platformBillingPeriod.findUnique.mockResolvedValueOnce({
      id: "period-1",
      contractId: "contract-1",
      status: "FINALIZED",
      total: 500000,
    });

    const period = await service.finalizePeriod("contract-1", "2026-01-01", "2026-02-01");
    expect(period).toEqual({
      id: "period-1",
      contractId: "contract-1",
      status: "FINALIZED",
      total: 500000,
    });
  });

  it("rejects settlement on unfinalized periods", async () => {
    mockPrisma.platformBillingPeriod.findUnique.mockResolvedValueOnce({
      id: "period-draft",
      status: "DRAFT",
    });

    await expect(
      service.recordSettlement("period-draft", {
        amount: 100000,
        idempotencyKey: "key-1",
      }),
    ).rejects.toThrow("Kỳ thanh toán chưa được chốt hóa đơn");
  });

  it("records partial payment and derives paymentState PARTIALLY_PAID", async () => {
    mockPrisma.platformBillingPeriod.findUnique.mockResolvedValueOnce({
      id: "period-fin",
      status: "FINALIZED",
      total: new Prisma.Decimal(500000),
      dueAt: new Date("2030-01-01"),
      settlements: [],
    });

    const result = await service.recordSettlement("period-fin", {
      amount: 200000,
      idempotencyKey: "key-part-1",
      method: "BANK_TRANSFER",
    });

    expect(result).toMatchObject({
      id: "set-1",
      periodId: "period-fin",
      idempotencyKey: "key-part-1",
      paymentState: "PARTIALLY_PAID",
      isOverdue: false,
    });
    expect(new Prisma.Decimal(result.settledAmount).toNumber()).toBe(200000);
    expect(new Prisma.Decimal(result.outstandingAmount).toNumber()).toBe(300000);
  });

  it("records exact final payment and derives paymentState PAID", async () => {
    mockPrisma.platformBillingPeriod.findUnique.mockResolvedValueOnce({
      id: "period-fin",
      status: "FINALIZED",
      total: new Prisma.Decimal(500000),
      dueAt: new Date("2026-01-01"),
      settlements: [{ id: "set-1", amount: new Prisma.Decimal(200000) }],
    });

    const result = await service.recordSettlement("period-fin", {
      amount: 300000,
      idempotencyKey: "key-final-1",
    });

    expect(result).toMatchObject({
      periodId: "period-fin",
      paymentState: "PAID",
      isOverdue: false,
    });
    expect(new Prisma.Decimal(result.settledAmount).toNumber()).toBe(500000);
    expect(new Prisma.Decimal(result.outstandingAmount).toNumber()).toBe(0);
  });

  it("rejects cumulative overpayment exceeding outstanding amount", async () => {
    mockPrisma.platformBillingPeriod.findUnique.mockResolvedValueOnce({
      id: "period-fin",
      status: "FINALIZED",
      total: new Prisma.Decimal(500000),
      settlements: [{ id: "set-1", amount: new Prisma.Decimal(200000) }],
    });

    await expect(
      service.recordSettlement("period-fin", {
        amount: 400000,
        idempotencyKey: "key-over-1",
      }),
    ).rejects.toThrow("Số tiền thanh toán vượt quá số tiền còn lại phải thanh toán");

    expect(mockPrisma.platformBillingSettlement.create).not.toHaveBeenCalled();
  });

  it("returns existing settlement with projection on same idempotency key retry without double counting", async () => {
    mockPrisma.platformBillingPeriod.findUnique.mockResolvedValueOnce({
      id: "period-fin",
      status: "FINALIZED",
      total: new Prisma.Decimal(500000),
      settlements: [
        {
          id: "set-1",
          periodId: "period-fin",
          amount: new Prisma.Decimal(200000),
          idempotencyKey: "key-retry-1",
        },
      ],
    });
    mockPrisma.platformBillingSettlement.findUnique.mockResolvedValueOnce({
      id: "set-1",
      periodId: "period-fin",
      amount: new Prisma.Decimal(200000),
      idempotencyKey: "key-retry-1",
    });

    const result = await service.recordSettlement("period-fin", {
      amount: 200000,
      idempotencyKey: "key-retry-1",
    });

    expect(result).toMatchObject({
      id: "set-1",
      periodId: "period-fin",
      idempotencyKey: "key-retry-1",
      paymentState: "PARTIALLY_PAID",
    });
    expect(mockPrisma.platformBillingSettlement.create).not.toHaveBeenCalled();
  });

  it("projects payment metrics across listPeriods, getPeriod, getDashboardSummary, and getOwnerAnalytics", async () => {
    const periodData = {
      id: "period-1",
      contractId: "c-1",
      status: "FINALIZED",
      total: new Prisma.Decimal(1000000),
      dueAt: new Date("2020-01-01"),
      settlements: [{ id: "s-1", amount: new Prisma.Decimal(400000) }],
      adjustments: [],
    };

    mockPrisma.platformBillingPeriod.findMany.mockResolvedValue([periodData]);
    mockPrisma.platformBillingPeriod.findUnique.mockResolvedValue(periodData);
    mockPrisma.platformBillingContract.findFirst.mockResolvedValue({
      id: "c-1",
      hotelId: "h-1",
      revisions: [],
    });

    const [list, single, dashboard, analytics] = await Promise.all([
      service.listPeriods("c-1"),
      service.getPeriod("period-1"),
      service.getDashboardSummary(),
      service.getOwnerAnalytics("h-1", {}, { actorUserId: "u-1", actorRoleId: "r-1" }),
    ]);

    expect(list[0]).toMatchObject({
      paymentState: "PARTIALLY_PAID",
      isOverdue: true,
    });
    expect(single).toMatchObject({
      paymentState: "PARTIALLY_PAID",
      isOverdue: true,
    });
    expect(dashboard.duePeriods[0]).toMatchObject({
      paymentState: "PARTIALLY_PAID",
      isOverdue: true,
    });
    expect(analytics.periods[0]).toMatchObject({
      paymentState: "PARTIALLY_PAID",
      isOverdue: true,
    });
  });
});
