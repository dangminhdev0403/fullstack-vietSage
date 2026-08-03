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
});
