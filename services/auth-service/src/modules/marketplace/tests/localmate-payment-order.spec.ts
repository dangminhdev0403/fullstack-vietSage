import {
  MarketplaceGuideNotificationStatus,
  MarketplaceOrderPaymentStatus,
  Prisma,
} from "@prisma/client";
import { NotFoundException } from "@nestjs/common";
import { RequestRealtimeEmitter } from "../../../request-realtime.emitter";
import { MarketplaceOrderService } from "../application/marketplace-order.service";

function localMateCreateHarness(rate = "15") {
  let createdOrder: any = null;
  const tx = {
    marketplacePricingConfig: {
      findUnique: jest.fn().mockResolvedValue({
        deliveryServiceFeeRate: new Prisma.Decimal(10),
        localMatePlatformFeeRate: new Prisma.Decimal(rate),
      }),
    },
    marketplaceService: {
      findFirst: jest.fn().mockResolvedValue({
        id: "tour-1",
        serviceTenantId: "tenant-1",
        localMateProfileId: "guide-1",
        capacityAvailable: null,
        unitPrice: new Prisma.Decimal(1_200_000),
        currency: "VND",
        name: "Hanoi tour",
        pricingUnit: "tour",
        mode: "CUSTOMER_AT_SERVICE",
        waitingMinutes: 0,
        serviceTenant: {
          serviceProfile: { deliveryServiceFeeRate: new Prisma.Decimal(10) },
        },
      }),
      updateMany: jest.fn(),
    },
    localMateProfile: {
      findUnique: jest.fn().mockResolvedValue({
        id: "guide-1",
        status: "QUALIFIED",
        operatingRegions: ["Hà Nội"],
      }),
    },
    hotel: {
      findUnique: jest.fn().mockResolvedValue({ province: "Hà Nội", provinceCode: "01" }),
    },
    marketplaceOrder: {
      create: jest.fn().mockImplementation(({ data }: any) => {
        createdOrder = {
          id: "order-1",
          ...data,
          status: "PENDING",
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          items: [],
          events: [],
          payment: data.payment?.create ?? null,
        };
        return createdOrder;
      }),
    },
  };
  const prisma = {
    marketplaceOrder: {
      findFirst: jest.fn().mockImplementation(async () => null),
      findUnique: jest
        .fn()
        .mockImplementation(async () =>
          createdOrder ? { ...createdOrder, stay: null, serviceTenant: null } : null,
        ),
    },
    localMateTelegramBinding: {
      findUnique: jest.fn().mockResolvedValue({ revokedAt: null, blockedAt: null }),
    },
    $transaction: jest
      .fn()
      .mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const payments = {
    createOrGetCheckoutSession: jest.fn(),
    getPaymentSummary: jest.fn(),
    refundLocalMatePayment: jest.fn(),
    cancelOrExpireOpenPayment: jest.fn(),
  };
  const service = new (MarketplaceOrderService as any)(
    prisma,
    {},
    payments,
  ) as MarketplaceOrderService;
  return { service, tx, prisma, payments };
}

describe("LocalMate payment order integration", () => {
  beforeEach(() => {
    jest
      .spyOn(RequestRealtimeEmitter, "emitExternalServiceOrderCreated")
      .mockImplementation(() => {});
    MarketplaceOrderService.setNotificationDispatcher({
      dispatchOrderNotification: jest.fn(),
      dispatchOrderCancelledNotification: jest.fn(),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    MarketplaceOrderService.setNotificationDispatcher({});
  });

  it("snapshots 15/85 in the order transaction and suppresses creation-time Telegram", async () => {
    const { service, tx } = localMateCreateHarness("15");
    const notification = jest.fn();
    MarketplaceOrderService.setNotificationDispatcher({ dispatchOrderNotification: notification });

    const order = await service.createGuestOrder(
      { hotelId: "hotel-1", stayId: "stay-1" },
      { serviceId: "tour-1", quantity: 1, idempotencyKey: "localmate-order-1" },
    );

    const data = tx.marketplaceOrder.create.mock.calls[0][0].data;
    expect(data.hotelServiceFeeAmount.toString()).toBe("0");
    expect(data.customerTotalAmount.toString()).toBe("1200000");
    expect(data.totalAmount.toString()).toBe("1200000");
    expect(data.payment.create).toEqual(
      expect.objectContaining({
        status: MarketplaceOrderPaymentStatus.CREATING,
        currency: "VND",
        tourTotalAmount: new Prisma.Decimal(1_200_000),
        platformFeeRateSnapshot: new Prisma.Decimal(15),
        platformFeeAmount: new Prisma.Decimal(180_000),
        guideRemainingAmount: new Prisma.Decimal(1_020_000),
        guideNotificationStatus: MarketplaceGuideNotificationStatus.BLOCKED,
      }),
    );
    expect((order as any).payment.platformFeeAmount.toString()).toBe("180000");
    expect(notification).not.toHaveBeenCalled();
  });

  it("makes a zero-fee order immediately notification-eligible without Stripe", async () => {
    const { service, tx, payments } = localMateCreateHarness("0");

    await service.createGuestOrder(
      { hotelId: "hotel-1", stayId: "stay-1" },
      { serviceId: "tour-1", quantity: 1, idempotencyKey: "localmate-zero-fee" },
    );

    expect(tx.marketplaceOrder.create.mock.calls[0][0].data.payment.create).toEqual(
      expect.objectContaining({
        status: MarketplaceOrderPaymentStatus.NOT_REQUIRED,
        platformFeeAmount: new Prisma.Decimal(0),
        guideRemainingAmount: new Prisma.Decimal(1_200_000),
        guideNotificationStatus: MarketplaceGuideNotificationStatus.PENDING,
      }),
    );
    expect(payments.createOrGetCheckoutSession).not.toHaveBeenCalled();
  });

  it("creates a checkout session only after verifying guest order ownership", async () => {
    const { service, prisma, payments } = localMateCreateHarness();
    (prisma.marketplaceOrder as any).findFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: "order-1", assignedLocalMateProfileId: "guide-1" })
      .mockResolvedValueOnce(null);
    payments.createOrGetCheckoutSession.mockResolvedValue({ status: "OPEN" });
    payments.getPaymentSummary.mockResolvedValue({
      status: "OPEN",
      checkoutUrl: "https://checkout",
    });

    await expect((service as any).createGuestPaymentSession("stay-1", "order-1")).resolves.toEqual({
      payment: { status: "OPEN", checkoutUrl: "https://checkout" },
    });
    expect(payments.createOrGetCheckoutSession).toHaveBeenCalledWith({
      orderId: "order-1",
      stayId: "stay-1",
    });
    await expect(
      (service as any).createGuestPaymentSession("other-stay", "order-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("cancels a paid pending LocalMate order then requests its platform-fee refund", async () => {
    const order = {
      id: "order-1",
      orderNumber: "MP1",
      status: "PENDING",
      version: 1,
      hotelId: "hotel-1",
      stayId: "stay-1",
      serviceId: "tour-1",
      serviceTenantId: "tenant-1",
      quantity: 1,
      serviceNameSnapshot: "Tour",
      capacityReservationStatus: "NOT_REQUIRED",
      assignedLocalMateProfileId: "guide-1",
      guestNote: null,
      payment: { status: MarketplaceOrderPaymentStatus.PAID },
      stay: null,
    };
    const cancelled = { ...order, status: "CANCELLED", version: 2, items: [], events: [] };
    const tx = {
      marketplaceOrder: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(cancelled),
      },
      marketplaceOrderPayment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      marketplaceOrderEvent: { create: jest.fn() },
    };
    const prisma = {
      marketplaceOrder: { findFirst: jest.fn().mockResolvedValue(order) },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const payments = {
      refundLocalMatePayment: jest.fn().mockResolvedValue({ status: "REFUNDED" }),
      cancelOrExpireOpenPayment: jest.fn(),
      getPaymentSummary: jest.fn().mockResolvedValue({ status: "REFUNDED" }),
    };
    const service = new (MarketplaceOrderService as any)(
      prisma,
      {},
      payments,
    ) as MarketplaceOrderService;

    await service.cancelGuestOrder({ hotelId: "hotel-1", stayId: "stay-1" }, "order-1");

    expect(payments.refundLocalMatePayment).toHaveBeenCalledWith({
      orderId: "order-1",
      reason: "GUEST_CANCELLED_BEFORE_GUIDE_ACKNOWLEDGEMENT",
    });
    expect(payments.cancelOrExpireOpenPayment).not.toHaveBeenCalled();
  });

  it("completes LocalMate without hotel revenue, guide settlement, or folio posting", async () => {
    const order = {
      id: "order-1",
      orderNumber: "MP1",
      hotelId: "hotel-1",
      stayId: "stay-1",
      serviceTenantId: "tenant-1",
      serviceId: "tour-1",
      status: "ACKNOWLEDGED",
      version: 1,
      quantity: 1,
      assignedLocalMateProfileId: "guide-1",
      capacityReservationStatus: "NOT_REQUIRED",
      partnerSubtotal: new Prisma.Decimal(1_200_000),
      hotelServiceFeeAmount: new Prisma.Decimal(0),
      totalAmount: new Prisma.Decimal(1_200_000),
      unitPriceSnapshot: new Prisma.Decimal(1_200_000),
      currency: "VND",
      serviceNameSnapshot: "Tour",
      serviceModeSnapshot: "CUSTOMER_AT_SERVICE",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const tx = {
      marketplaceOrder: {
        findFirst: jest.fn().mockResolvedValue(order),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...order, status: "COMPLETED" }),
      },
      marketplaceRevenueEntry: { upsert: jest.fn() },
      marketplaceSettlement: { upsert: jest.fn() },
      marketplaceOrderEvent: { create: jest.fn() },
      folio: { findFirst: jest.fn() },
      folioItem: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    };
    const prisma = {
      marketplaceOrder: {
        findUnique: jest.fn().mockResolvedValue({ ...order, status: "COMPLETED", items: [] }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const portal = { tenantId: jest.fn().mockResolvedValue("tenant-1") };
    const service = new MarketplaceOrderService(prisma as never, portal as never);

    await service.transitionServiceOrder("guide-user", "order-1", { toStatus: "COMPLETED" });

    expect(tx.marketplaceRevenueEntry.upsert).not.toHaveBeenCalled();
    expect(tx.marketplaceSettlement.upsert).not.toHaveBeenCalled();
    expect(tx.folio.findFirst).not.toHaveBeenCalled();
  });

  it("keeps LocalMate financially isolated when hotel completion is invoked", async () => {
    const order = {
      id: "order-1",
      orderNumber: "MP1",
      hotelId: "hotel-1",
      stayId: "stay-1",
      serviceTenantId: "tenant-1",
      serviceId: "tour-1",
      status: "ACKNOWLEDGED",
      assignedLocalMateProfileId: "guide-1",
      capacityReservationStatus: "NOT_REQUIRED",
      partnerSubtotal: new Prisma.Decimal(1_200_000),
      hotelServiceFeeAmount: new Prisma.Decimal(0),
      totalAmount: new Prisma.Decimal(1_200_000),
      unitPriceSnapshot: new Prisma.Decimal(1_200_000),
      currency: "VND",
      serviceNameSnapshot: "Tour",
      serviceModeSnapshot: "CUSTOMER_AT_SERVICE",
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
    };
    const tx = {
      marketplaceOrder: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(order),
        update: jest.fn(),
      },
      serviceVoucher: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
      marketplaceRevenueEntry: { upsert: jest.fn() },
      marketplaceSettlement: { upsert: jest.fn() },
      marketplaceOrderEvent: { create: jest.fn() },
      folio: { findFirst: jest.fn() },
      folioItem: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    };
    const prisma = {
      marketplaceOrder: {
        findFirst: jest.fn().mockResolvedValue(order),
        findUnique: jest.fn().mockResolvedValue({ ...order, status: "COMPLETED" }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new MarketplaceOrderService(prisma as never, {} as never);

    await service.completeHotelOrder("staff-1", "hotel-1", "order-1");

    expect(tx.marketplaceRevenueEntry.upsert).not.toHaveBeenCalled();
    expect(tx.marketplaceSettlement.upsert).not.toHaveBeenCalled();
    expect(tx.folio.findFirst).not.toHaveBeenCalled();
  });

  it("keeps LocalMate financially isolated when voucher redemption is invoked", async () => {
    const order = {
      id: "order-1",
      hotelId: "hotel-1",
      stayId: "stay-1",
      serviceTenantId: "tenant-1",
      serviceId: "tour-1",
      status: "ACKNOWLEDGED",
      assignedLocalMateProfileId: "guide-1",
      capacityReservationStatus: "NOT_REQUIRED",
      partnerSubtotal: new Prisma.Decimal(1_200_000),
      totalAmount: new Prisma.Decimal(1_200_000),
      unitPriceSnapshot: new Prisma.Decimal(1_200_000),
      currency: "VND",
      serviceNameSnapshot: "Tour",
      serviceModeSnapshot: "CUSTOMER_AT_SERVICE",
      voucher: { voucherNumber: "VS-LOCAL", status: "ISSUED" },
    };
    const redeemedVoucher = { id: "voucher-1", voucherNumber: "VS-LOCAL", status: "REDEEMED" };
    const tx = {
      serviceVoucher: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(redeemedVoucher),
      },
      marketplaceOrder: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(order),
        update: jest.fn(),
      },
      marketplaceRevenueEntry: { upsert: jest.fn() },
      marketplaceSettlement: { upsert: jest.fn() },
      marketplaceOrderEvent: { create: jest.fn() },
      folio: { findFirst: jest.fn() },
      folioItem: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    };
    const prisma = {
      serviceVoucher: { findFirst: jest.fn().mockResolvedValue({ order }) },
      marketplaceOrder: { findUnique: jest.fn() },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const portal = { tenantId: jest.fn().mockResolvedValue("tenant-1") };
    const service = new MarketplaceOrderService(prisma as never, portal as never);

    await service.redeemVoucher("guide-user", "VS-LOCAL");

    expect(tx.marketplaceRevenueEntry.upsert).not.toHaveBeenCalled();
    expect(tx.marketplaceSettlement.upsert).not.toHaveBeenCalled();
    expect(tx.folio.findFirst).not.toHaveBeenCalled();
  });
});
