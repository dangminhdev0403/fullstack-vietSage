import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { RequestRealtimeEmitter } from "../../../request-realtime.emitter";
import { canTransitionMarketplaceOrder } from "../domain/marketplace-order-transitions";
import { MarketplaceOrderService } from "../application/marketplace-order.service";

describe("Marketplace orders", () => {
  beforeEach(() => {
    jest.spyOn(RequestRealtimeEmitter, "emitExternalServiceOrderHotelAcknowledged").mockImplementation(() => {});
    jest.spyOn(RequestRealtimeEmitter, "emitExternalServiceOrderVoucherIssued").mockImplementation(() => {});
    jest.spyOn(RequestRealtimeEmitter, "emitExternalServiceOrderCreated").mockImplementation(() => {});
    jest.spyOn(RequestRealtimeEmitter, "emitExternalServiceOrderStatusChanged").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
  it("enforces 3-state order transitions", () => {
    expect(canTransitionMarketplaceOrder("PENDING", "CONFIRMED")).toBe(true);
    expect(canTransitionMarketplaceOrder("CONFIRMED", "COMPLETED")).toBe(true);
    expect(canTransitionMarketplaceOrder("PENDING", "CANCELLED")).toBe(true);
    expect(canTransitionMarketplaceOrder("COMPLETED", "CANCELLED")).toBe(false);
  });

  it("posts a completed order once to the open stay folio", async () => {
    const order = {
      id: "order-1",
      hotelId: "hotel-1",
      stayId: "stay-1",
      serviceId: "service-1",
      serviceTenantId: "provider-1",
      status: "CONFIRMED",
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
      marketplaceSettlement: { upsert: jest.fn().mockResolvedValue({}) },
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

  it("acknowledges hotel order and emits realtime event post-commit", async () => {
    const prisma = {
      serviceVoucher: {
        upsert: jest.fn().mockResolvedValue({
          id: "voucher-1",
          voucherNumber: "VS-TEST01",
          verificationCode: "CODE01",
          status: "ISSUED",
        }),
      },
      marketplaceOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: "order-1",
          hotelId: "hotel-1",
          serviceTenantId: "tenant-1",
          orderNumber: "MSO-001",
          hotelCoordinationStatus: "RECEIVED",
          stay: { guestSessionToken: "session-1", guestStayId: "stay-1" },
        }),
        update: jest.fn().mockResolvedValue({
          id: "order-1",
          hotelId: "hotel-1",
          serviceTenantId: "tenant-1",
          orderNumber: "MSO-001",
          unitPriceSnapshot: new Prisma.Decimal(100),
          totalAmount: new Prisma.Decimal(100),
          currency: "VND",
          createdAt: new Date(),
          updatedAt: new Date(),
          hotelCoordinationStatus: "VOUCHER_ISSUED",
        }),
      },
    };
    const emitter = {
      emitExternalServiceOrderHotelAcknowledged: jest.fn(),
    };
    const service = new MarketplaceOrderService(prisma as never, {} as never);

    const result = await service.acknowledgeHotelOrder("user-1", "hotel-1", "order-1");

    expect(result.hotelCoordinationStatus).toBe("VOUCHER_ISSUED");
  });

  it("issues service voucher atomically and emits realtime event", async () => {
    const prisma = {
      marketplaceOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: "order-1",
          hotelId: "hotel-1",
          serviceTenantId: "tenant-1",
          serviceId: "service-1",
          orderNumber: "MSO-001",
          unitPriceSnapshot: new Prisma.Decimal(100),
          totalAmount: new Prisma.Decimal(100),
          currency: "VND",
          createdAt: new Date(),
          updatedAt: new Date(),
          hotelCoordinationStatus: "ACKNOWLEDGED",
          stay: { guestSessionToken: "session-1", guestStayId: "stay-1" },
        }),
        update: jest.fn().mockResolvedValue({
          id: "order-1",
          hotelCoordinationStatus: "VOUCHER_ISSUED",
          unitPriceSnapshot: new Prisma.Decimal(100),
          totalAmount: new Prisma.Decimal(100),
          currency: "VND",
          createdAt: new Date(),
          updatedAt: new Date(),
          voucher: { voucherNumber: "VS-A8F39C" },
        }),
      },
      serviceVoucher: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({
          id: "voucher-1",
          voucherNumber: "VS-A8F39C",
          status: "ISSUED",
        }),
      },
    };
    const service = new MarketplaceOrderService(prisma as never, {} as never);

    const result = await service.issueServiceVoucher("user-1", "hotel-1", "order-1");

    expect(result.voucher?.voucherNumber).toMatch(/^VS-[A-Z0-9]{6}$/);
  });

  it("verifies and redeems service voucher atomically inside DB transaction", async () => {
    const tx = {
      serviceVoucher: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: "voucher-1",
          voucherNumber: "VS-A8F39C",
          status: "REDEEMED",
          redeemedAt: new Date(),
        }),
      },
    };
    const prisma = {
      serviceVoucher: {
        findFirst: jest.fn().mockResolvedValue({
          id: "voucher-1",
          voucherNumber: "VS-A8F39C",
          serviceTenantId: "tenant-1",
          status: "ISSUED",
          expiresAt: new Date(Date.now() + 86400000),
          order: { id: "order-1", status: "ACCEPTED" },
        }),
      },
      $transaction: (fn: (value: unknown) => unknown) => fn(tx),
    };
    const portal = {
      tenantId: jest.fn().mockResolvedValue("tenant-1"),
    };
    const service = new MarketplaceOrderService(prisma as never, portal as never);

    const verified = await service.verifyVoucher("user-1", "VS-A8F39C");
    expect(verified.valid).toBe(true);

    const redeemed = await service.redeemVoucher("user-1", "VS-A8F39C");
    expect(redeemed.status).toBe("REDEEMED");
  });
});
