import { PlatformBillingService } from "../application/platform-billing.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PlatformBillingModule } from "../platform-billing.module";
import { PropertyModule } from "../../property/property.module";

describe("PlatformBillingService Onboarding & Analytics", () => {
  let service: PlatformBillingService;
  let mockPrisma: any;
  let mockLogger: any;
  let mockHotelAccessService: any;

  beforeEach(() => {
    mockHotelAccessService = {
      assertHotelAccess: jest.fn().mockResolvedValue(undefined),
    };

    mockPrisma = {
      $transaction: jest.fn((callback) => callback(mockPrisma)),
      $queryRaw: jest.fn().mockResolvedValue([]),
      hotel: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "hotel-1", name: "Grand Hotel", code: "GH01" }),
      },
      platformBillingContract: {
        count: jest.fn().mockResolvedValue(3),
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
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([{ id: "bd-1" }, { id: "bd-2" }]),
      },
      platformUsage: {
        findMany: jest.fn().mockResolvedValue([{ id: "pu-1" }, { id: "pu-2" }, { id: "pu-3" }]),
      },
      platformBillingPeriod: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { total: new Prisma.Decimal(1000000) }, _count: { id: 2 } }),
      },
      platformBillingSettlement: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: new Prisma.Decimal(400000) } }),
      },
      room: {
        findMany: jest.fn().mockResolvedValue([{ id: "r1", roomNumber: "101" }]),
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

    service = new PlatformBillingService(
      mockPrisma as PrismaService,
      mockLogger as AppLogger,
      mockHotelAccessService,
    );
  });

  it.each([
    ["FIXED", 15000],
    ["PERCENTAGE", 10],
  ] as const)("creates a %s pricing contract revision", async (pricingModel, pricingValue) => {
    const result = await service.createContract({
      hotelId: "hotel-1",
      pricingModel,
      pricingValue,
      billingStartedAt: "2026-08-01",
    });

    expect(mockPrisma.platformBillingContractRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        pricingModel,
        roomDayUnitPrice: new Prisma.Decimal(pricingValue),
      }),
    });
    expect(result).toBeDefined();
  });

  it("rejects contract creation if active contract already exists", async () => {
    mockPrisma.platformBillingContract.findFirst.mockResolvedValueOnce({ id: "contract-active" });

    await expect(
      service.createContract({
        hotelId: "hotel-1",
        pricingModel: "FIXED",
        pricingValue: 15000,
        billingStartedAt: "2026-08-01",
      }),
    ).rejects.toThrow("Khách sạn đã có hợp đồng tính phí đang hoạt động");
  });

  it("enforces actor hotel access in getOwnerAnalytics before fetching contract or analytics data", async () => {
    mockHotelAccessService.assertHotelAccess.mockRejectedValueOnce(
      new ForbiddenException("No access to hotel"),
    );

    await expect(
      service.getOwnerAnalytics(
        "hotel-forbidden",
        {},
        { actorUserId: "user-123", actorRoleId: "role-owner" },
      ),
    ).rejects.toThrow("No access to hotel");

    expect(mockHotelAccessService.assertHotelAccess).toHaveBeenCalledWith(
      "user-123",
      "role-owner",
      "hotel-forbidden",
    );
    expect(mockPrisma.platformBillingContract.findFirst).not.toHaveBeenCalled();
  });

  it("fetches owner analytics with billable days count and estimated fee", async () => {
    mockPrisma.platformBillingContract.findFirst.mockResolvedValueOnce({
      id: "contract-1",
      revisions: [{ roomDayUnitPrice: 20000, currency: "VND" }],
    });
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      {
        roomNumber: "101",
        usageCount: 1,
        billableDaysCount: 2,
        billedAmount: new Prisma.Decimal(40000),
        currency: "VND",
        currencyCount: 1,
      },
    ]);

    const result = await service.getOwnerAnalytics(
      "hotel-1",
      { monthDate: "2026-08-01" },
      { actorUserId: "user-1", actorRoleId: "role-owner" },
    );
    expect(result.hasContract).toBe(true);
    expect(result.billableDaysCount).toBe(2);
    expect(result.estimatedFee).toBe(40000);
    expect(result.monthKey).toBe("2026-08");
  });

  it("excludes cancelled stays from usage counting and reconciliation backfill SQL", async () => {
    mockPrisma.platformBillingContract.findFirst.mockResolvedValueOnce({
      id: "contract-cancel",
      revisions: [{ roomDayUnitPrice: 20000, currency: "VND" }],
    });
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);

    await service.getOwnerAnalytics(
      "hotel-cancel",
      { monthDate: "2026-08" },
      { actorUserId: "u", actorRoleId: "r" },
    );

    const roomSql = mockPrisma.$queryRaw.mock.calls[0][0];
    const sql = Array.isArray(roomSql?.strings) ? roomSql.strings.join(" ") : String(roomSql);
    expect(sql).toContain("s.status <> 'CANCELLED'");
    expect(sql).toContain('COUNT(DISTINCT u."sourceId")');
  });

  it("counts only FINALIZED periods so finalized-period KPI stays immutable-scoped", async () => {
    mockPrisma.platformBillingContract.findFirst.mockResolvedValueOnce({
      id: "contract-fin",
      revisions: [{ roomDayUnitPrice: 20000, currency: "VND" }],
    });
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    mockPrisma.platformBillingPeriod.count.mockResolvedValueOnce(4);

    const result = await service.getOwnerAnalytics(
      "hotel-fin",
      {},
      { actorUserId: "u", actorRoleId: "r" },
    );

    expect(mockPrisma.platformBillingPeriod.count).toHaveBeenCalledWith({
      where: { contractId: "contract-fin", status: "FINALIZED" },
    });
    expect(mockPrisma.platformBillingPeriod.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contractId: "contract-fin", status: "FINALIZED" },
      }),
    );
    expect(result.periodsPage.total).toBe(4);
  });

  it("keeps room rows, monthly totals and KPI totals consistent", async () => {
    mockPrisma.platformBillingContract.findFirst.mockResolvedValueOnce({
      id: "contract-sum",
      revisions: [{ roomDayUnitPrice: 20000, currency: "VND" }],
    });
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      {
        roomNumber: "101",
        usageCount: 2,
        billableDaysCount: 3,
        billedAmount: new Prisma.Decimal(60000),
        currency: "VND",
        currencyCount: 1,
      },
      {
        roomNumber: "102",
        usageCount: 0,
        billableDaysCount: 9,
        billedAmount: new Prisma.Decimal(180000),
        currency: "VND",
        currencyCount: 1,
      },
    ]);

    const result = await service.getOwnerAnalytics(
      "hotel-sum",
      {},
      { actorUserId: "u", actorRoleId: "r" },
    );

    const rows = result.roomUsageSummary || [];
    expect(result.usageCount).toBe(rows.reduce((s: number, r: { usageCount: number }) => s + r.usageCount, 0));
    expect(result.billableDaysCount).toBe(rows.reduce((s: number, r: { billableDaysCount: number }) => s + r.billableDaysCount, 0));
    expect(result.estimatedFee).toBe(rows.reduce((s: number, r: { billedAmount: number }) => s + r.billedAmount, 0));
    expect(result.estimatedFee).toBe(240000);
  });

  it("computes dashboard debt metrics correctly via bounded DB aggregate and excludes fully settled periods from duePeriods", async () => {
    const pastDue = new Date("2020-01-01");
    const futureDue = new Date("2030-01-01");

    const periodPaid = {
      id: "p-paid",
      total: new Prisma.Decimal(300000),
      dueAt: pastDue,
      settlements: [{ id: "s-1", amount: new Prisma.Decimal(300000) }],
    };
    const periodPartialOverdue = {
      id: "p-partial-overdue",
      total: new Prisma.Decimal(500000),
      dueAt: pastDue,
      settlements: [{ id: "s-2", amount: new Prisma.Decimal(100000) }],
    };
    const periodUnpaidFuture = {
      id: "p-unpaid-future",
      total: new Prisma.Decimal(200000),
      dueAt: futureDue,
      settlements: [],
    };

    mockPrisma.platformBillingContract.count.mockResolvedValueOnce(3);
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      {
        finalizedPeriods: 3,
        finalizedAmount: new Prisma.Decimal(1000000),
        collectedAmount: new Prisma.Decimal(400000),
        outstandingAmount: new Prisma.Decimal(600000),
        unpaidPeriodCount: 2,
        overduePeriodCount: 1,
      },
    ]);
    mockPrisma.platformBillingPeriod.findMany.mockResolvedValueOnce([
      periodPaid,
      periodPartialOverdue,
      periodUnpaidFuture,
    ]);

    const summary = await service.getDashboardSummary();

    expect(mockPrisma.platformBillingPeriod.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 }),
    );

    expect(summary).toEqual({
      activeContracts: 3,
      finalizedPeriods: 3,
      finalizedAmount: new Prisma.Decimal(1000000),
      collectedAmount: new Prisma.Decimal(400000),
      outstandingAmount: new Prisma.Decimal(600000),
      unpaidPeriodCount: 2,
      overduePeriodCount: 1,
      duePeriods: expect.arrayContaining([
        expect.objectContaining({
          id: "p-partial-overdue",
          isOverdue: true,
          paymentState: "PARTIALLY_PAID",
        }),
        expect.objectContaining({
          id: "p-unpaid-future",
          isOverdue: false,
          paymentState: "UNPAID",
        }),
      ]),
    });
    expect((summary as any).totalFinalizedRevenue).toBeUndefined();
    expect(summary.duePeriods.find((p: any) => p.id === "p-paid")).toBeUndefined();
  });

  it("projects payment metadata for contract periods in listContracts", async () => {
    mockPrisma.platformBillingContract.findMany.mockResolvedValueOnce([
      {
        id: "c-1",
        hotel: { id: "h-1", name: "Hotel 1", code: "H1" },
        revisions: [],
        periods: [
          {
            id: "p-1",
            total: new Prisma.Decimal(500000),
            dueAt: new Date("2026-01-01"),
            settlements: [{ id: "s-1", amount: new Prisma.Decimal(200000) }],
          },
        ],
      },
    ]);

    const contracts = await service.listContracts();
    expect(contracts[0].periods[0]).toMatchObject({
      settledAmount: new Prisma.Decimal(200000),
      outstandingAmount: new Prisma.Decimal(300000),
      paymentState: "PARTIALLY_PAID",
    });
  });

  it("proves room-level billedAmount aggregation in getOwnerAnalytics from persisted billableDay amounts in selected month", async () => {
    const hotelId = "hotel-room-test";
    const contractId = "contract-123";

    mockPrisma.platformBillingContract.findFirst.mockResolvedValueOnce({
      id: contractId,
      hotelId,
      revisions: [{ roomDayUnitPrice: new Prisma.Decimal(50000), currency: "VND" }],
    });

    mockPrisma.$queryRaw.mockResolvedValueOnce([
      {
        roomNumber: "101",
        usageCount: 1,
        billableDaysCount: 2,
        billedAmount: new Prisma.Decimal(110000),
        currency: "VND",
        currencyCount: 1,
      },
    ]);
    mockPrisma.platformBillingPeriod.findMany.mockResolvedValueOnce([]);

    const result = await service.getOwnerAnalytics(
      hotelId,
      { monthDate: "2026-02-15" },
      { actorUserId: "user-room", actorRoleId: "role-owner" },
    );

    expect(result.billableDaysCount).toBe(2);
    expect(result.estimatedFee).toBe(110000);
    expect(result.roomUsageSummary).toEqual([
      {
        roomNumber: "101",
        usageCount: 1,
        billableDaysCount: 2,
        billedAmount: 110000,
        currency: "VND",
      },
    ]);
  });

  it("returns bounded periodsPage and 7-calendar-day reminder metrics", async () => {
    const hotelId = "hotel-slice3b";
    const contractId = "c-slice3b";

    mockPrisma.platformBillingContract.findFirst.mockResolvedValueOnce({
      id: contractId,
      hotelId,
      revisions: [{ roomDayUnitPrice: new Prisma.Decimal(50000), currency: "VND" }],
    });

    mockPrisma.platformBillingPeriod.count.mockResolvedValueOnce(15);
    mockPrisma.platformBillingPeriod.findMany.mockImplementationOnce((args) => {
      expect(args.skip).toBe(0);
      expect(args.take).toBe(5);
      return Promise.resolve([
        {
          id: "p-1",
          total: new Prisma.Decimal(500000),
          dueAt: new Date("2026-02-20"),
          settlements: [{ id: "s-1", amount: new Prisma.Decimal(200000) }],
        },
      ]);
    });

    // 1st $queryRaw = room aggregation, 2nd = reminder metrics
    mockPrisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        dueSoonCount: 1,
        overdueCount: 1,
        dueSoonOutstandingAmount: new Prisma.Decimal(300000),
        overdueOutstandingAmount: new Prisma.Decimal(500000),
        nearestDueAt: new Date("2026-02-12T00:00:00.000Z"),
      },
    ]);

    const result = await service.getOwnerAnalytics(
      hotelId,
      {
        monthDate: "2026-02-15",
        periodPage: 1,
        periodLimit: 5,
      },
      { actorUserId: "user-bound", actorRoleId: "role-owner" },
    );

    expect(result.periodsPage).toEqual({
      page: 1,
      limit: 5,
      total: 15,
      items: [
        expect.objectContaining({
          id: "p-1",
          settledAmount: new Prisma.Decimal(200000),
          outstandingAmount: new Prisma.Decimal(300000),
          paymentState: "PARTIALLY_PAID",
        }),
      ],
    });

    expect(result.reminder).toEqual({
      dueSoonCount: 1,
      overdueCount: 1,
      dueSoonOutstandingAmount: new Prisma.Decimal(300000),
      overdueOutstandingAmount: new Prisma.Decimal(500000),
      nearestDueAt: new Date("2026-02-12T00:00:00.000Z"),
    });

    // Compatibility alias
    expect(result.periods).toEqual(result.periodsPage.items);

    // Verify SQL query uses exact Prisma table and column identifiers (PascalCase table names, camelCase column names)
    const sqlCalls = mockPrisma.$queryRaw.mock.calls;
    expect(sqlCalls.length).toBeGreaterThan(0);
    const lastCall = sqlCalls[sqlCalls.length - 1];
    const rawSql = lastCall[0];
    const querySql = Array.isArray(rawSql?.strings) ? rawSql.strings.join(" ") : String(rawSql);
    expect(querySql).toContain('"PlatformBillingPeriod"');
    expect(querySql).toContain('"PlatformBillingSettlement"');
    expect(querySql).toContain('"dueAt"');
    expect(querySql).toContain('"contractId"');
    expect(querySql).toContain('"periodId"');
    expect(querySql).not.toContain("platform_billing_periods");
    expect(querySql).not.toContain("due_at");
    expect(querySql).not.toContain("contract_id");
  });

  it("verifies PlatformBillingModule metadata imports PropertyModule for Nest DI runtime resolution", () => {
    const imports = Reflect.getMetadata("imports", PlatformBillingModule) || [];
    expect(imports).toContain(PropertyModule);
  });
});
