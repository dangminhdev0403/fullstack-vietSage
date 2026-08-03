import { PlatformBillingService } from "../application/platform-billing.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { AppLogger } from "../../../common/logging/app-logger.service";

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
      platformBillingContract: { count: jest.fn().mockResolvedValue(5) },
      platformBillingPeriod: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _sum: { total: new Date() }, _count: { id: 2 } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      platformBillableDay: {
        aggregate: jest.fn().mockResolvedValue({ _count: { id: 10 }, _sum: { amount: 500000 } }),
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

    service = new PlatformBillingService(mockPrisma as PrismaService, mockLogger as AppLogger);
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

  it("records settlement idempotently for finalized periods", async () => {
    mockPrisma.platformBillingPeriod.findUnique.mockResolvedValueOnce({
      id: "period-fin",
      status: "FINALIZED",
    });

    const result = await service.recordSettlement("period-fin", {
      amount: 500000,
      idempotencyKey: "key-unique-123",
      method: "BANK_TRANSFER",
    });

    expect(result).toMatchObject({
      id: "set-1",
      periodId: "period-fin",
      idempotencyKey: "key-unique-123",
    });
  });
});
