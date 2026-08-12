import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { canTransitionMarketplaceOrder } from "../domain/marketplace-order-transitions";
import { MarketplaceOrderService } from "../application/marketplace-order.service";

describe("Marketplace orders", () => {
  it("enforces mode-specific state transitions", () => {
    expect(canTransitionMarketplaceOrder("PREPARING", "DELIVERING", "DELIVERY_TO_HOTEL")).toBe(
      true,
    );
    expect(canTransitionMarketplaceOrder("PREPARING", "DELIVERING", "CUSTOMER_AT_SERVICE")).toBe(
      false,
    );
    expect(canTransitionMarketplaceOrder("PREPARING", "READY", "CUSTOMER_AT_SERVICE")).toBe(true);
    expect(canTransitionMarketplaceOrder("COMPLETED", "CANCELLED", "DELIVERY_TO_HOTEL")).toBe(
      false,
    );
  });

  it("posts a completed order once to the open stay folio", async () => {
    const order = {
      id: "order-1",
      hotelId: "hotel-1",
      stayId: "stay-1",
      serviceId: "service-1",
      serviceTenantId: "provider-1",
      status: "DELIVERING",
      version: 1,
      quantity: 2,
      totalAmount: new Prisma.Decimal(200),
      unitPriceSnapshot: new Prisma.Decimal(100),
      currency: "VND",
      serviceNameSnapshot: "Airport transfer",
      serviceModeSnapshot: "DELIVERY_TO_HOTEL",
      capacityReservationStatus: "RESERVED",
    };
    const folioItemCreate = jest.fn().mockResolvedValue({ id: "item-1" });
    const tx = {
      marketplaceOrder: {
        findFirst: jest.fn().mockResolvedValue(order),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...order, status: "COMPLETED" }),
      },
      marketplaceRevenueEntry: { create: jest.fn().mockResolvedValue({}) },
      marketplaceOrderEvent: { create: jest.fn().mockResolvedValue({}) },
      folio: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: "folio-1", roomId: "room-1", currency: "VND" }),
        update: jest.fn().mockResolvedValue({}),
      },
      folioItem: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: folioItemCreate,
        findMany: jest.fn().mockResolvedValue([
          {
            subtotalSnapshot: new Prisma.Decimal(200),
            taxAmountSnapshot: new Prisma.Decimal(0),
            discountAmountSnapshot: new Prisma.Decimal(0),
            totalSnapshot: new Prisma.Decimal(200),
          },
        ]),
      },
    };
    const prisma = {
      marketplaceOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: "order-1",
          orderNumber: "ORD-1001",
          hotelId: "hotel-1",
          stayId: "stay-1",
          serviceTenantId: "provider-1",
          serviceId: "service-1",
          serviceNameSnapshot: "Airport transfer",
          serviceModeSnapshot: "DELIVERY_TO_HOTEL",
          status: "COMPLETED",
          quantity: 2,
          unitPriceSnapshot: new Prisma.Decimal(100),
          totalAmount: new Prisma.Decimal(200),
          currency: "VND",
          createdAt: new Date(),
          updatedAt: new Date(),
          version: 2,
          stay: { guestDisplayName: "John Guest", room: { id: "room-1", roomNumber: "101" } },
        }),
      },
      $transaction: (fn: (value: unknown) => unknown) => fn(tx),
    };
    const portal = { tenantId: jest.fn().mockResolvedValue("provider-1") };
    const service = new MarketplaceOrderService(prisma as never, portal as never);

    await service.transitionServiceOrder("provider-user", "order-1", { toStatus: "COMPLETED" });

    expect(folioItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          folioId: "folio-1",
          stayId: "stay-1",
          sourceType: "SYSTEM",
          sourceId: "order-1",
          totalSnapshot: order.totalAmount,
        }),
      }),
    );
    expect(tx.folio.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalAmount: new Prisma.Decimal(200) }),
      }),
    );
  });

  it("fails atomically when finite capacity cannot be reserved", async () => {
    const tx = {
      marketplaceService: {
        findFirst: jest.fn().mockResolvedValue({
          id: "item",
          serviceTenantId: "service",
          capacityAvailable: 0,
          unitPrice: new Prisma.Decimal(10),
          currency: "VND",
          name: "Spa",
          mode: "CUSTOMER_AT_SERVICE",
          waitingMinutes: 5,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = {
      marketplaceOrder: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: (fn: (value: unknown) => unknown) => fn(tx),
    };
    const service = new MarketplaceOrderService(prisma as never, {} as never);

    await expect(
      service.createGuestOrder(
        { hotelId: "hotel", stayId: "stay" },
        { serviceId: "item", quantity: 1, idempotencyKey: "12345678" },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.marketplaceService.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ capacityAvailable: { gte: 1 } }),
      }),
    );
  });
});
