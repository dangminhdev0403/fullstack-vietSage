jest.mock("../../../prisma/prisma.service", () => ({
  PrismaService: class MockPrismaService {},
}));

import { BillingService } from "../application/billing.service";
import { BadRequestException } from "@nestjs/common";

describe("Checkout Service Reconciliation & Idempotent Billing TDD", () => {
  it("rejects invoice issuance when active requests exist without reconciliation action", async () => {
    const prismaMock: any = {
      invoice: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockImplementation(async (cb) => {
        const txMock: any = {
          $queryRawUnsafe: jest.fn(),
          folio: {
            findFirst: jest.fn().mockResolvedValue({
              id: "folio-1",
              stayId: "stay-1",
              currency: "VND",
              status: "OPEN",
            }),
          },
          invoice: { findFirst: jest.fn().mockResolvedValue(null) },
          guestRequest: {
            findMany: jest.fn().mockResolvedValue([
              {
                id: "req-active-1",
                title: "Nước suối thêm",
                status: "CREATED",
                quantity: 2,
                serviceItem: { name: "Nước suối" },
                room: { roomNumber: "101" },
              },
            ]),
          },
        };
        return cb(txMock);
      }),
    };
    const service = new BillingService(
      {} as any,
      { assertHotelAccess: jest.fn() } as any,
      prismaMock,
      {} as any,
      { log: jest.fn(), warn: jest.fn() } as any,
    );
    (service as any).validateFolioForCheckout = jest.fn().mockResolvedValue({});

    await expect(
      service.issueInvoice("user-1", "role-1", "hotel-1", "folio-1", {
        reconciliations: [],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("reconciles active requests provided by adding idempotent FolioItem charge", async () => {
    const createFolioItemMock = jest.fn().mockResolvedValue({});
    const updateRequestMock = jest.fn().mockResolvedValue({});

    const prismaMock: any = {
      invoice: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockImplementation(async (cb) => {
        const txMock: any = {
          $queryRawUnsafe: jest.fn(),
          folio: {
            findFirst: jest.fn().mockResolvedValue({
              id: "folio-1",
              stayId: "stay-1",
              currency: "VND",
              status: "OPEN",
            }),
            update: jest.fn(),
          },
          invoice: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({
              id: "inv-1",
              totalAmount: "40000",
            }),
          },
          guestRequest: {
            findMany: jest.fn().mockResolvedValue([
              {
                id: "req-active-1",
                title: "Nước suối thêm",
                status: "CREATED",
                quantity: 2,
                unitPrice: 20000,
                serviceItem: { name: "Nước suối", priceOverride: 20000 },
                metadata: { billingPriceSnapshot: { unitPrice: 20000, currency: "VND" } },
                room: { roomNumber: "101" },
              },
            ]),
            update: updateRequestMock,
          },
          folioItem: {
            findFirst: jest.fn().mockResolvedValue(null),
            findMany: jest.fn().mockResolvedValue([]),
            create: createFolioItemMock,
          },
        };
        return cb(txMock);
      }),
    };

    const service = new BillingService(
      {} as any,
      { assertHotelAccess: jest.fn() } as any,
      prismaMock,
      { generateEntityCode: jest.fn().mockResolvedValue("INV-001") } as any,
      { log: jest.fn(), warn: jest.fn() } as any,
    );
    (service as any).validateFolioForCheckout = jest.fn().mockResolvedValue({});
    (service as any).ensureRoomChargeFolioItem = jest.fn().mockResolvedValue({});

    await service.issueInvoice("user-1", "role-1", "hotel-1", "folio-1", {
      reconciliations: [{ requestId: "req-active-1", action: "provided" }],
    });

    expect(updateRequestMock).toHaveBeenCalledWith({
      where: { id: "req-active-1" },
      data: expect.objectContaining({ status: "COMPLETED" }),
    });
    expect(createFolioItemMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        guestRequestId: "req-active-1",
        nameSnapshot: "Nước suối",
        quantity: 2,
      }),
    });
  });

  it("C1: rejects reconciliation when service currency does not match folio currency", async () => {
    const prismaMock: any = {
      invoice: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockImplementation(async (cb) => {
        const txMock: any = {
          $queryRawUnsafe: jest.fn(),
          folio: {
            findFirst: jest.fn().mockResolvedValue({
              id: "folio-1",
              stayId: "stay-1",
              currency: "VND",
              status: "OPEN",
            }),
          },
          invoice: { findFirst: jest.fn().mockResolvedValue(null) },
          guestRequest: {
            findMany: jest.fn().mockResolvedValue([
              {
                id: "req-active-1",
                title: "Spa package",
                status: "CREATED",
                quantity: 1,
                unitPrice: 50,
                serviceItem: {
                  name: "Spa package",
                  priceOverride: 50,
                  category: { currency: "USD" },
                },
                metadata: { billingPriceSnapshot: { unitPrice: 50, currency: "USD" } },
                room: { roomNumber: "101" },
              },
            ]),
          },
          folioItem: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        };
        return cb(txMock);
      }),
    };

    const service = new BillingService(
      {} as any,
      { assertHotelAccess: jest.fn() } as any,
      prismaMock,
      { generateEntityCode: jest.fn().mockResolvedValue("INV-001") } as any,
      { log: jest.fn(), warn: jest.fn() } as any,
    );
    (service as any).validateFolioForCheckout = jest.fn().mockResolvedValue({});

    await expect(
      service.issueInvoice("user-1", "role-1", "hotel-1", "folio-1", {
        reconciliations: [{ requestId: "req-active-1", action: "provided" }],
      }),
    ).rejects.toThrow("Đơn vị tiền tệ của dịch vụ không khớp với folio");
  });

  it("H2: catalog price changes after request creation cannot alter posted unit price in checkout reconciliation", async () => {
    const createFolioItemMock = jest.fn().mockResolvedValue({});
    const updateRequestMock = jest.fn().mockResolvedValue({});

    const prismaMock: any = {
      invoice: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockImplementation(async (cb) => {
        const txMock: any = {
          $queryRawUnsafe: jest.fn(),
          folio: {
            findFirst: jest.fn().mockResolvedValue({
              id: "folio-1",
              stayId: "stay-1",
              currency: "VND",
              status: "OPEN",
            }),
            update: jest.fn(),
          },
          invoice: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ id: "inv-1", totalAmount: "40000" }),
          },
          guestRequest: {
            findMany: jest.fn().mockResolvedValue([
              {
                id: "req-active-1",
                title: "Nước suối",
                status: "CREATED",
                quantity: 2,
                // Catalog price was bumped from 20000 to 99000 after creation:
                serviceItem: { name: "Nước suối", priceOverride: 99000, category: { defaultPrice: 99000, currency: "VND" } },
                metadata: { billingPriceSnapshot: { unitPrice: 20000, currency: "VND" } },
                room: { roomNumber: "101" },
              },
            ]),
            update: updateRequestMock,
          },
          folioItem: {
            findFirst: jest.fn().mockResolvedValue(null),
            findMany: jest.fn().mockResolvedValue([]),
            create: createFolioItemMock,
          },
        };
        return cb(txMock);
      }),
    };

    const service = new BillingService(
      {} as any,
      { assertHotelAccess: jest.fn() } as any,
      prismaMock,
      { generateEntityCode: jest.fn().mockResolvedValue("INV-001") } as any,
      { log: jest.fn(), warn: jest.fn() } as any,
    );
    (service as any).validateFolioForCheckout = jest.fn().mockResolvedValue({});
    (service as any).ensureRoomChargeFolioItem = jest.fn().mockResolvedValue({});

    await service.issueInvoice("user-1", "role-1", "hotel-1", "folio-1", {
      reconciliations: [{ requestId: "req-active-1", action: "provided" }],
    });

    // Unit price MUST come from snapshot (20000), not catalog (99000)
    expect(createFolioItemMock).toHaveBeenCalledTimes(1);
    const createdData = createFolioItemMock.mock.calls[0][0].data;
    expect(createdData.guestRequestId).toBe("req-active-1");
    expect(createdData.unitPriceSnapshot.toString()).toBe("20000");
    expect(createdData.subtotalSnapshot.toString()).toBe("40000");
  });

  it("H2: checkout reconciliation preserves explicit zero unit price", async () => {
    const createFolioItemMock = jest.fn().mockResolvedValue({});
    const updateRequestMock = jest.fn().mockResolvedValue({});

    const prismaMock: any = {
      invoice: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockImplementation(async (cb) => {
        const txMock: any = {
          $queryRawUnsafe: jest.fn(),
          folio: {
            findFirst: jest.fn().mockResolvedValue({
              id: "folio-1",
              stayId: "stay-1",
              currency: "VND",
              status: "OPEN",
            }),
            update: jest.fn(),
          },
          invoice: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ id: "inv-1", totalAmount: "0" }),
          },
          guestRequest: {
            findMany: jest.fn().mockResolvedValue([
              {
                id: "req-free-1",
                title: "Khăn tắm thêm",
                status: "CREATED",
                quantity: 3,
                serviceItem: { name: "Khăn tắm thêm", priceOverride: 0, category: { defaultPrice: 0, currency: "VND" } },
                metadata: { billingPriceSnapshot: { unitPrice: 0, currency: "VND" } },
                room: { roomNumber: "101" },
              },
            ]),
            update: updateRequestMock,
          },
          folioItem: {
            findFirst: jest.fn().mockResolvedValue(null),
            findMany: jest.fn().mockResolvedValue([]),
            create: createFolioItemMock,
          },
        };
        return cb(txMock);
      }),
    };

    const service = new BillingService(
      {} as any,
      { assertHotelAccess: jest.fn() } as any,
      prismaMock,
      { generateEntityCode: jest.fn().mockResolvedValue("INV-001") } as any,
      { log: jest.fn(), warn: jest.fn() } as any,
    );
    (service as any).validateFolioForCheckout = jest.fn().mockResolvedValue({});
    (service as any).ensureRoomChargeFolioItem = jest.fn().mockResolvedValue({});

    await service.issueInvoice("user-1", "role-1", "hotel-1", "folio-1", {
      reconciliations: [{ requestId: "req-free-1", action: "provided" }],
    });

    expect(createFolioItemMock).toHaveBeenCalledTimes(1);
    const createdDataFree = createFolioItemMock.mock.calls[0][0].data;
    expect(createdDataFree.guestRequestId).toBe("req-free-1");
    expect(createdDataFree.unitPriceSnapshot.toString()).toBe("0");
    expect(createdDataFree.subtotalSnapshot.toString()).toBe("0");
  });

  it("H2: checkout reconciliation rejects missing billingPriceSnapshot fail-closed", async () => {
    const prismaMock: any = {
      invoice: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockImplementation(async (cb) => {
        const txMock: any = {
          $queryRawUnsafe: jest.fn(),
          folio: {
            findFirst: jest.fn().mockResolvedValue({
              id: "folio-1",
              stayId: "stay-1",
              currency: "VND",
              status: "OPEN",
            }),
          },
          invoice: { findFirst: jest.fn().mockResolvedValue(null) },
          guestRequest: {
            findMany: jest.fn().mockResolvedValue([
              {
                id: "req-legacy-1",
                title: "Dịch vụ cũ",
                status: "CREATED",
                quantity: 1,
                serviceItem: { name: "Dịch vụ cũ", priceOverride: 10000, category: { currency: "VND" } },
                metadata: null, // missing snapshot
                room: { roomNumber: "101" },
              },
            ]),
          },
          folioItem: { findFirst: jest.fn().mockResolvedValue(null) },
        };
        return cb(txMock);
      }),
    };

    const service = new BillingService(
      {} as any,
      { assertHotelAccess: jest.fn() } as any,
      prismaMock,
      { generateEntityCode: jest.fn().mockResolvedValue("INV-001") } as any,
      { log: jest.fn(), warn: jest.fn() } as any,
    );
    (service as any).validateFolioForCheckout = jest.fn().mockResolvedValue({});

    await expect(
      service.issueInvoice("user-1", "role-1", "hotel-1", "folio-1", {
        reconciliations: [{ requestId: "req-legacy-1", action: "provided" }],
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
