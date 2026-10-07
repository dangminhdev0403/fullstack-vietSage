import { ConflictException, NotFoundException } from "@nestjs/common";
import {
  CapacityReservationStatus,
  MarketplaceOrderStatus,
  MarketplaceRecordStatus,
  MarketplaceServiceMode,
  Prisma,
} from "@prisma/client";
import { MarketplaceOrderService } from "../application/marketplace-order.service";
import { RequestRealtimeEmitter } from "../../../request-realtime.emitter";

describe("T1 - Marketplace LocalMate Order Lifecycle", () => {
  beforeEach(() => {
    jest
      .spyOn(RequestRealtimeEmitter, "emitExternalServiceOrderCreated")
      .mockImplementation(() => {});
    jest
      .spyOn(RequestRealtimeEmitter, "emitExternalServiceOrderStatusChanged")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("createGuestOrder with LocalMate assignment", () => {
    it("creates an order with LocalMate assignment, requestedStartAt, and partySize", async () => {
      const mockOrder = {
        id: "order-lm-1",
        orderNumber: "MP12345",
        status: MarketplaceOrderStatus.PENDING,
        assignedLocalMateProfileId: "guide-profile-1",
        requestedStartAt: new Date("2026-10-01T09:00:00.000Z"),
        partySize: 3,
        unitPriceSnapshot: new Prisma.Decimal(1000000),
        partnerSubtotal: new Prisma.Decimal(1000000),
        hotelServiceFeeAmount: new Prisma.Decimal(100000),
        customerTotalAmount: new Prisma.Decimal(1100000),
        totalAmount: new Prisma.Decimal(1100000),
        currency: "VND",
        serviceNameSnapshot: "Trekking Ta Phin",
        serviceModeSnapshot: MarketplaceServiceMode.CUSTOMER_AT_SERVICE,
        waitingMinutesSnapshot: 0,
        createdAt: new Date(),
        version: 1,
        items: [],
      };

      const tx = {
        marketplacePricingConfig: { findUnique: jest.fn().mockResolvedValue(null) },
        marketplaceService: {
          findFirst: jest.fn().mockResolvedValue({
            id: "srv-lm-1",
            serviceTenantId: "tenant-1",
            name: "Trekking Ta Phin",
            unitPrice: new Prisma.Decimal(1000000),
            pricingUnit: "TOUR",
            currency: "VND",
            mode: MarketplaceServiceMode.CUSTOMER_AT_SERVICE,
            waitingMinutes: 0,
            capacityAvailable: null,
            localMateProfileId: "guide-profile-1",
            serviceTenant: { serviceProfile: { deliveryServiceFeeRate: new Prisma.Decimal(10) } },
          }),
          updateMany: jest.fn(),
        },
        localMateProfile: {
          findUnique: jest.fn().mockResolvedValue({
            id: "guide-profile-1",
            status: "QUALIFIED",
            operatingRegions: ["Lao Cai", "Sa Pa"],
          }),
        },
        hotel: {
          findUnique: jest.fn().mockResolvedValue({
            province: "Lào Cai",
            provinceCode: "LAO_CAI",
          }),
        },
        marketplaceOrder: {
          create: jest.fn().mockResolvedValue(mockOrder),
        },
        guestCart: { findUnique: jest.fn().mockResolvedValue(null) },
      };

      const prisma = {
        marketplaceOrder: {
          findFirst: jest.fn().mockResolvedValue(null),
          findUnique: jest.fn().mockImplementation(({ where }) => {
            if (where.stayId_idempotencyKey) return null;
            if (where.id)
              return { ...mockOrder, stay: { room: { id: "room-1" }, guestSessions: [] } };
            return null;
          }),
        },
        $transaction: jest.fn().mockImplementation(async (cb) => cb(tx)),
      };

      const dispatchSpy = jest.fn();
      const service = new MarketplaceOrderService(prisma as never, {} as never);
      service.setNotificationDispatcher({ dispatchOrderNotification: dispatchSpy });

      const result = await service.createGuestOrder(
        { hotelId: "hotel-1", stayId: "stay-1" },
        {
          serviceId: "srv-lm-1",
          quantity: 1,
          requestedStartAt: "2026-10-01T09:00:00.000Z",
          partySize: 3,
          idempotencyKey: "idem-001",
        },
      );

      expect(result).toBeDefined();
      expect(tx.marketplaceOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            assignedLocalMateProfileId: "guide-profile-1",
            partySize: 3,
          }),
        }),
      );
      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it("rejects booking if assigned LocalMate is not QUALIFIED", async () => {
      const tx = {
        marketplacePricingConfig: { findUnique: jest.fn().mockResolvedValue(null) },
        marketplaceService: {
          findFirst: jest.fn().mockResolvedValue({
            id: "srv-lm-1",
            localMateProfileId: "guide-profile-unqualified",
            serviceTenant: { serviceProfile: {} },
          }),
        },
        localMateProfile: {
          findUnique: jest.fn().mockResolvedValue({
            id: "guide-profile-unqualified",
            status: "PENDING",
            operatingRegions: ["Lao Cai"],
          }),
        },
      };

      const prisma = {
        marketplaceOrder: {
          findFirst: jest.fn().mockResolvedValue(null),
          findUnique: jest.fn().mockResolvedValue(null),
        },
        $transaction: jest.fn().mockImplementation(async (cb) => cb(tx)),
      };

      const service = new MarketplaceOrderService(prisma as never, {} as never);

      await expect(
        service.createGuestOrder(
          { hotelId: "hotel-1", stayId: "stay-1" },
          { serviceId: "srv-lm-1", quantity: 1, idempotencyKey: "idem-unqual" },
        ),
      ).rejects.toThrow(ConflictException);
    });

    it("rejects booking if LocalMate is outside the hotel province", async () => {
      const tx = {
        marketplacePricingConfig: { findUnique: jest.fn().mockResolvedValue(null) },
        marketplaceService: {
          findFirst: jest.fn().mockResolvedValue({
            id: "srv-lm-1",
            localMateProfileId: "guide-profile-hagiang",
            serviceTenant: { serviceProfile: {} },
          }),
        },
        localMateProfile: {
          findUnique: jest.fn().mockResolvedValue({
            id: "guide-profile-hagiang",
            status: "QUALIFIED",
            operatingRegions: ["Ha Giang"],
          }),
        },
        hotel: {
          findUnique: jest.fn().mockResolvedValue({
            province: "Lào Cai",
            provinceCode: "LAO_CAI",
          }),
        },
      };

      const prisma = {
        marketplaceOrder: {
          findFirst: jest.fn().mockResolvedValue(null),
          findUnique: jest.fn().mockResolvedValue(null),
        },
        $transaction: jest.fn().mockImplementation(async (cb) => cb(tx)),
      };

      const service = new MarketplaceOrderService(prisma as never, {} as never);

      await expect(
        service.createGuestOrder(
          { hotelId: "hotel-1", stayId: "stay-1" },
          { serviceId: "srv-lm-1", quantity: 1, idempotencyKey: "idem-cross-prov" },
        ),
      ).rejects.toThrow(ConflictException);
    });

    it("returns existing order when idempotencyKey matches", async () => {
      const existingOrder = { id: "order-existing", idempotencyKey: "idem-dup" };
      const prisma = {
        marketplaceOrder: {
          findFirst: jest.fn().mockResolvedValue(existingOrder),
        },
      };

      const service = new MarketplaceOrderService(prisma as never, {} as never);
      const result = await service.createGuestOrder(
        { hotelId: "hotel-1", stayId: "stay-1" },
        { serviceId: "srv-1", quantity: 1, idempotencyKey: "idem-dup" },
      );

      expect(result).toBe(existingOrder);
    });
  });

  describe("cancelGuestOrder", () => {
    it("cancels a PENDING order and releases capacity if reserved", async () => {
      const existingPendingOrder = {
        id: "order-pending-1",
        orderNumber: "MP999",
        status: MarketplaceOrderStatus.PENDING,
        version: 1,
        hotelId: "hotel-1",
        stayId: "stay-1",
        serviceId: "srv-1",
        serviceTenantId: "tenant-1",
        quantity: 2,
        serviceNameSnapshot: "Tour",
        capacityReservationStatus: CapacityReservationStatus.RESERVED,
        stay: { room: { id: "room-1" }, guestSessions: [] },
      };

      const cancelledOrder = {
        ...existingPendingOrder,
        status: MarketplaceOrderStatus.CANCELLED,
        version: 2,
        capacityReservationStatus: CapacityReservationStatus.RELEASED,
        items: [],
        events: [],
      };

      const tx = {
        marketplaceOrder: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          update: jest.fn().mockResolvedValue({}),
          findUnique: jest.fn().mockResolvedValue(cancelledOrder),
        },
        marketplaceService: {
          update: jest.fn().mockResolvedValue({}),
        },
        marketplaceOrderEvent: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      const prisma = {
        marketplaceOrder: {
          findFirst: jest.fn().mockResolvedValue(existingPendingOrder),
        },
        $transaction: jest.fn().mockImplementation(async (cb) => cb(tx)),
      };

      const service = new MarketplaceOrderService(prisma as never, {} as never);
      const result = await service.cancelGuestOrder(
        { hotelId: "hotel-1", stayId: "stay-1" },
        "order-pending-1",
        "Thay đổi kế hoạch",
      );

      expect(result?.status).toBe(MarketplaceOrderStatus.CANCELLED);
      expect(tx.marketplaceService.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "srv-1" },
          data: { capacityAvailable: { increment: 2 }, version: { increment: 1 } },
        }),
      );
      expect(RequestRealtimeEmitter.emitExternalServiceOrderStatusChanged).toHaveBeenCalledWith(
        expect.objectContaining({
          toStatus: MarketplaceOrderStatus.CANCELLED,
        }),
      );
    });

    it("rejects cancellation of ACKNOWLEDGED or COMPLETED order", async () => {
      const acknowledgedOrder = {
        id: "order-ack-1",
        status: MarketplaceOrderStatus.ACKNOWLEDGED,
        hotelId: "hotel-1",
        stayId: "stay-1",
      };

      const prisma = {
        marketplaceOrder: {
          findFirst: jest.fn().mockResolvedValue(acknowledgedOrder),
        },
      };

      const service = new MarketplaceOrderService(prisma as never, {} as never);

      await expect(
        service.cancelGuestOrder({ hotelId: "hotel-1", stayId: "stay-1" }, "order-ack-1"),
      ).rejects.toThrow(ConflictException);
    });

    it("rejects cancellation if order not found for stay", async () => {
      const prisma = {
        marketplaceOrder: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };

      const service = new MarketplaceOrderService(prisma as never, {} as never);

      await expect(
        service.cancelGuestOrder({ hotelId: "hotel-1", stayId: "stay-other" }, "order-nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
