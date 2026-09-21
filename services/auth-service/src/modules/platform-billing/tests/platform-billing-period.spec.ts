import { PlatformBillingService } from "../application/platform-billing.service";
import { PlatformBillingController } from "../api/platform-billing.controller";
import { PrismaService } from "../../../prisma/prisma.service";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { REQUIRED_PERMISSION_KEY } from "../../../shared/decorators/require-permission.decorator";
import { Prisma } from "@prisma/client";
import { issueDebtNoticeBodySchema } from "../domain/schemas/platform-billing.schema";

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

  it("keeps statement and reminder routes fail-closed with explicit capabilities", () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        PlatformBillingController.prototype.getDebtStatement,
      ),
    ).toBe("platform.billing.view");
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        PlatformBillingController.prototype.getOwnerDebtStatement,
      ),
    ).toBe("hotel.revenue-protection.view");
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        PlatformBillingController.prototype.issueDebtNotice,
      ),
    ).toBe("platform.billing.manage");
  });

  it("accepts only truthful MANUAL reminder recording", () => {
    expect(issueDebtNoticeBodySchema.parse({ channel: "MANUAL" })).toEqual({
      channel: "MANUAL",
    });
    expect(() => issueDebtNoticeBodySchema.parse({ channel: "EMAIL" })).toThrow();
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

  it("returns the persisted overdue amount for the debt-first dashboard", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      {
        finalizedPeriods: 2,
        finalizedAmount: new Prisma.Decimal(1500000),
        collectedAmount: new Prisma.Decimal(500000),
        outstandingAmount: new Prisma.Decimal(1000000),
        unpaidPeriodCount: 1,
        overduePeriodCount: 1,
        overdueAmount: new Prisma.Decimal(750000),
      },
    ]);
    mockPrisma.platformBillingPeriod.findMany.mockResolvedValue([]);

    const dashboard = await service.getDashboardSummary();

    expect(new Prisma.Decimal(dashboard.overdueAmount).toNumber()).toBe(750000);
  });

  it("issues a debt notice for a finalized period and increments notice count", async () => {
    mockPrisma.platformBillingPeriod.findUnique.mockResolvedValue({
      id: "period-notice-1",
      contractId: "contract-1",
      periodStart: new Date("2026-08-01"),
      periodEnd: new Date("2026-08-31"),
      status: "FINALIZED",
      total: new Prisma.Decimal(2000000),
      dueAt: new Date("2026-09-07"),
      contract: {
        id: "contract-1",
        hotel: { id: "hotel-1", name: "Khách sạn Biển Đông", tenantId: "tenant-1" },
      },
      settlements: [],
    });

    mockPrisma.auditLog = {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: "audit-1" }),
      findMany: jest.fn().mockResolvedValue([]),
    };

    const result = await service.issueDebtNotice("period-notice-1", {
      channel: "MANUAL",
      actorUserId: "user-finance-1",
    });

    expect(result.success).toBe(true);
    expect(result.noticeCount).toBe(1);
    expect(result.channel).toBe("MANUAL");
    expect(result.outstandingAmount).toBe(2000000);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "DEBT_REMINDER_RECORDED",
          entityId: "period-notice-1",
          tenantId: "tenant-1",
        }),
      }),
    );
  });

  it("rejects a manual debt reminder when the finalized period is fully paid", async () => {
    mockPrisma.platformBillingPeriod.findUnique.mockResolvedValue({
      id: "period-paid",
      contractId: "contract-1",
      periodStart: new Date("2026-08-01"),
      periodEnd: new Date("2026-09-01"),
      status: "FINALIZED",
      total: new Prisma.Decimal(500000),
      dueAt: new Date("2026-09-07"),
      contract: {
        hotel: { name: "Khách sạn đã thanh toán", tenantId: "tenant-1" },
      },
      settlements: [{ amount: new Prisma.Decimal(500000) }],
    });

    await expect(
      service.issueDebtNotice("period-paid", {
        channel: "MANUAL",
        actorUserId: "user-finance-1",
      }),
    ).rejects.toThrow("Kỳ thanh toán không còn công nợ");
  });

  it("rejects a debt statement for a period that is not finalized", async () => {
    mockPrisma.platformBillingPeriod.findUnique.mockResolvedValue({
      id: "period-draft-statement",
      status: "DRAFT",
      contract: { hotel: { tenant: {} } },
      settlements: [],
      adjustments: [],
    });

    await expect(service.getPlatformDebtStatement("period-draft-statement")).rejects.toThrow(
      "Kỳ thanh toán chưa được chốt hóa đơn",
    );
  });

  it("generates a debt statement for a finalized period", async () => {
    mockPrisma.platformBillingPeriod.findUnique.mockResolvedValue({
      id: "period-stmt-1",
      contractId: "contract-1",
      periodStart: new Date("2026-08-01"),
      periodEnd: new Date("2026-08-31"),
      status: "FINALIZED",
      total: new Prisma.Decimal(1500000),
      subtotal: new Prisma.Decimal(1500000),
      dueAt: new Date("2026-09-07"),
      contract: {
        id: "contract-1",
        status: "ACTIVE",
        hotelId: "hotel-1",
        hotel: {
          id: "hotel-1",
          name: "Khách sạn Sài Gòn Star",
          code: "SGSTAR",
          address: "123 Lê Lợi, Q1",
          phoneNumber: "0901234567",
          tenantId: "tenant-1",
          tenant: { name: "Công ty TNHH Sài Gòn Star" },
        },
        revisions: [
          { pricingModel: "FIXED", roomDayUnitPrice: new Prisma.Decimal(10000), currency: "VND" },
        ],
      },
      settlements: [{ id: "set-1", amount: new Prisma.Decimal(500000), createdAt: new Date() }],
      adjustments: [],
    });

    mockPrisma.platformBillableDay.findMany.mockResolvedValue([
      {
        id: "bd-1",
        unitPrice: new Prisma.Decimal(10000),
        quantity: 100,
        amount: new Prisma.Decimal(1000000),
        currency: "VND",
        contractRevision: { pricingModel: "FIXED" },
      },
      {
        id: "bd-2",
        unitPrice: new Prisma.Decimal(5),
        quantity: 50,
        amount: new Prisma.Decimal(500000),
        currency: "VND",
        contractRevision: { pricingModel: "PERCENTAGE" },
      },
    ]);

    const statement = await service.getPlatformDebtStatement("period-stmt-1");

    expect(statement.statementNumber).toContain("SGSTAR");
    expect(statement.period.outstandingAmount).toEqual(new Prisma.Decimal(1000000));
    expect(statement.hotel.code).toBe("SGSTAR");
    expect(statement.contract.billableDaysCount).toBe(150);
    expect(statement.lineItems).toHaveLength(2);
    expect(statement.lineItems[0].quantity).toBe(100);
    expect(statement.lineItems[0].unitPrice).toBe(10000);
    expect(statement.lineItems[0].pricingModel).toBe("FIXED");
    expect(statement.lineItems[1].pricingModel).toBe("PERCENTAGE");
    expect(statement.platformBankInfo).toBeNull();

    const ownerStatement = await service.getOwnerDebtStatement("period-stmt-1", {
      actorUserId: "owner-1",
      actorRoleId: "role-owner",
    });
    expect(ownerStatement.statementNumber).toContain("SGSTAR");
    expect(statement.platformBankInfo).toBeNull();
  });
});
