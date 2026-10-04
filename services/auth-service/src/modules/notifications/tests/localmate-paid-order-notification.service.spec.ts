import {
  MarketplaceGuideNotificationStatus,
  MarketplaceOrderPaymentStatus,
  MarketplaceOrderStatus,
} from "@prisma/client";
import {
  ALLOWLISTED_NOTIFICATION_ERROR_CODES,
  LocalmatePaidOrderNotificationService,
} from "../application/localmate-paid-order-notification.service";

describe("LocalmatePaidOrderNotificationService", () => {
  let service: LocalmatePaidOrderNotificationService;
  let mockPrisma: any;
  let mockBridge: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPrisma = {
      marketplaceOrderPayment: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      marketplaceOrder: {
        findUnique: jest.fn(),
      },
      localMateTelegramBinding: {
        findFirst: jest.fn(),
      },
    };

    mockBridge = {
      sendOrderNotificationToGuide: jest.fn(),
    };

    service = new LocalmatePaidOrderNotificationService(mockPrisma, mockBridge);
  });

  describe("Pre-payment blocking", () => {
    it("refuses to claim notification when payment status is OPEN (not PAID or NOT_REQUIRED)", async () => {
      mockPrisma.marketplaceOrderPayment.updateMany.mockResolvedValue({ count: 0 });

      const claimed = await service.claimNotification("pay_open");

      expect(claimed).toBe(false);
      expect(mockPrisma.marketplaceOrderPayment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: "pay_open",
            status: {
              in: [MarketplaceOrderPaymentStatus.PAID, MarketplaceOrderPaymentStatus.NOT_REQUIRED],
            },
          }),
        }),
      );
    });

    it("dispatchPaidOrderNotification returns PRE_PAYMENT_BLOCKED and does not dispatch if payment is unpaid", async () => {
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue({
        id: "pay_1",
        orderId: "ord_1",
        status: MarketplaceOrderPaymentStatus.OPEN,
        guideNotificationStatus: MarketplaceGuideNotificationStatus.BLOCKED,
      });

      const result = await service.dispatchPaidOrderNotification("ord_1");

      expect(result.success).toBe(false);
      expect(result.reason).toBe(ALLOWLISTED_NOTIFICATION_ERROR_CODES.PRE_PAYMENT_BLOCKED);
      expect(mockPrisma.marketplaceOrderPayment.updateMany).not.toHaveBeenCalled();
      expect(mockBridge.sendOrderNotificationToGuide).not.toHaveBeenCalled();
    });

    it("executeClaimedNotification blocks and marks BLOCKED if payment status is unexpectedly not eligible", async () => {
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue({
        id: "pay_creating",
        status: MarketplaceOrderPaymentStatus.CREATING,
        order: {
          id: "ord_creating",
          status: MarketplaceOrderStatus.PENDING,
          assignedLocalMateProfileId: "guide_1",
        },
      });

      const result = await service.executeClaimedNotification("pay_creating");

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ALLOWLISTED_NOTIFICATION_ERROR_CODES.PAYMENT_NOT_READY);
      expect(mockPrisma.marketplaceOrderPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "pay_creating" },
          data: expect.objectContaining({
            guideNotificationStatus: MarketplaceGuideNotificationStatus.BLOCKED,
            notificationLeaseUntil: null,
            lastProviderErrorCode: ALLOWLISTED_NOTIFICATION_ERROR_CODES.PAYMENT_NOT_READY,
          }),
        }),
      );
      expect(mockBridge.sendOrderNotificationToGuide).not.toHaveBeenCalled();
    });
  });

  describe("Paid / Not-required eligibility", () => {
    it("dispatches successfully when payment status is PAID", async () => {
      mockPrisma.marketplaceOrderPayment.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue({
        id: "pay_paid",
        orderId: "ord_paid",
        status: MarketplaceOrderPaymentStatus.PAID,
        tourTotalAmount: "1000000",
        platformFeeRateSnapshot: "15.00",
        platformFeeAmount: "150000",
        guideRemainingAmount: "850000",
        currency: "VND",
        guideNotificationStatus: MarketplaceGuideNotificationStatus.PENDING,
        order: {
          id: "ord_paid",
          orderNumber: "MP1001",
          status: MarketplaceOrderStatus.PENDING,
          assignedLocalMateProfileId: "guide_1",
          stay: { guestDisplayName: "John Doe", room: { roomNumber: "101" } },
        },
      });
      mockPrisma.localMateTelegramBinding.findFirst.mockResolvedValue({
        id: "bind_1",
        localMateProfileId: "guide_1",
        telegramChatId: "tg_123",
      });
      mockBridge.sendOrderNotificationToGuide.mockResolvedValue({
        success: true,
        messageId: 777,
      });

      const result = await service.dispatchPaidOrderNotification("ord_paid");

      expect(result.success).toBe(true);
      expect(result.status).toBe(MarketplaceGuideNotificationStatus.SENT);
      expect(mockBridge.sendOrderNotificationToGuide).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "ord_paid",
          orderNumber: "MP1001",
          payment: expect.objectContaining({
            tourTotalAmount: "1000000",
            platformFeeAmount: "150000",
            guideRemainingAmount: "850000",
            status: MarketplaceOrderPaymentStatus.PAID,
          }),
        }),
      );
      expect(mockPrisma.marketplaceOrderPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "pay_paid" },
          data: expect.objectContaining({
            guideNotificationStatus: MarketplaceGuideNotificationStatus.SENT,
            notificationSentAt: expect.any(Date),
            notificationLeaseUntil: null,
            notificationNextAttemptAt: null,
            lastProviderErrorCode: null,
          }),
        }),
      );
    });

    it("dispatches successfully when payment status is NOT_REQUIRED (0% fee)", async () => {
      mockPrisma.marketplaceOrderPayment.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue({
        id: "pay_free",
        orderId: "ord_free",
        status: MarketplaceOrderPaymentStatus.NOT_REQUIRED,
        tourTotalAmount: "500000",
        platformFeeRateSnapshot: "0.00",
        platformFeeAmount: "0",
        guideRemainingAmount: "500000",
        currency: "VND",
        guideNotificationStatus: MarketplaceGuideNotificationStatus.PENDING,
        order: {
          id: "ord_free",
          orderNumber: "MP1002",
          status: MarketplaceOrderStatus.PENDING,
          assignedLocalMateProfileId: "guide_1",
          stay: { guestDisplayName: "Jane", room: { roomNumber: "102" } },
        },
      });
      mockPrisma.localMateTelegramBinding.findFirst.mockResolvedValue({
        id: "bind_1",
        localMateProfileId: "guide_1",
        telegramChatId: "tg_123",
      });
      mockBridge.sendOrderNotificationToGuide.mockResolvedValue({
        success: true,
        messageId: 778,
      });

      const result = await service.dispatchPaidOrderNotification("ord_free");

      expect(result.success).toBe(true);
      expect(result.status).toBe(MarketplaceGuideNotificationStatus.SENT);
      expect(mockBridge.sendOrderNotificationToGuide).toHaveBeenCalled();
    });
  });

  describe("Two-worker claim race", () => {
    it("allows only the winning worker to claim and dispatch; the loser skips safely", async () => {
      // Simulate race condition where Worker 1 gets count: 1, Worker 2 gets count: 0
      mockPrisma.marketplaceOrderPayment.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      const now = new Date();
      const worker1Claimed = await service.claimNotification("pay_shared", now);
      const worker2Claimed = await service.claimNotification("pay_shared", now);

      expect(worker1Claimed).toBe(true);
      expect(worker2Claimed).toBe(false);
      expect(mockPrisma.marketplaceOrderPayment.updateMany).toHaveBeenCalledTimes(2);
    });

    it("processPendingNotifications processes only claimed items and ignores unclaimable items", async () => {
      const now = new Date();
      mockPrisma.marketplaceOrderPayment.findMany.mockResolvedValue([
        { id: "pay_win", status: MarketplaceOrderPaymentStatus.PAID },
        { id: "pay_loss", status: MarketplaceOrderPaymentStatus.PAID },
      ]);

      mockPrisma.marketplaceOrderPayment.updateMany
        .mockResolvedValueOnce({ count: 1 }) // First one claimed
        .mockResolvedValueOnce({ count: 0 }); // Second one lost race to another worker

      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue({
        id: "pay_win",
        status: MarketplaceOrderPaymentStatus.PAID,
        order: {
          id: "ord_win",
          status: MarketplaceOrderStatus.PENDING,
          assignedLocalMateProfileId: "guide_1",
        },
      });
      mockPrisma.localMateTelegramBinding.findFirst.mockResolvedValue({
        id: "bind_1",
        localMateProfileId: "guide_1",
        telegramChatId: "tg_123",
      });
      mockBridge.sendOrderNotificationToGuide.mockResolvedValue({ success: true, messageId: 101 });

      const summary = await service.processPendingNotifications(10, now);

      expect(summary.processed).toBe(2);
      expect(summary.sent).toBe(1);
      expect(summary.failed).toBe(0);
      expect(mockBridge.sendOrderNotificationToGuide).toHaveBeenCalledTimes(1);
    });
  });

  describe("Lease recovery", () => {
    it("successfully claims an expired lease where status is SENDING and notificationLeaseUntil < now", async () => {
      const now = new Date();

      mockPrisma.marketplaceOrderPayment.updateMany.mockResolvedValue({ count: 1 });

      const claimed = await service.claimNotification("pay_crashed_worker", now);

      expect(claimed).toBe(true);
      expect(mockPrisma.marketplaceOrderPayment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: "pay_crashed_worker",
            OR: expect.arrayContaining([
              expect.objectContaining({
                guideNotificationStatus: MarketplaceGuideNotificationStatus.SENDING,
                notificationLeaseUntil: { lt: now },
              }),
            ]),
          }),
          data: expect.objectContaining({
            guideNotificationStatus: MarketplaceGuideNotificationStatus.SENDING,
            notificationLeaseUntil: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe("Transient retry and bounded backoff", () => {
    it("increments attempt count, sets FAILED status, and schedules backoff on transient failure", async () => {
      const now = new Date();
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue({
        id: "pay_transient",
        status: MarketplaceOrderPaymentStatus.PAID,
        notificationAttemptCount: 1,
        order: {
          id: "ord_transient",
          status: MarketplaceOrderStatus.PENDING,
          assignedLocalMateProfileId: "guide_1",
        },
      });
      mockPrisma.localMateTelegramBinding.findFirst.mockResolvedValue({
        id: "bind_1",
        localMateProfileId: "guide_1",
        telegramChatId: "tg_123",
      });
      mockBridge.sendOrderNotificationToGuide.mockResolvedValue({
        success: false,
        isTerminal: false,
        errorCode: ALLOWLISTED_NOTIFICATION_ERROR_CODES.TELEGRAM_SEND_FAILED,
      });

      const result = await service.executeClaimedNotification("pay_transient", now);

      expect(result.success).toBe(false);
      expect(result.isTerminal).toBe(false);
      expect(mockPrisma.marketplaceOrderPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "pay_transient" },
          data: expect.objectContaining({
            guideNotificationStatus: MarketplaceGuideNotificationStatus.FAILED,
            notificationAttemptCount: 2,
            notificationLeaseUntil: null,
            notificationNextAttemptAt: expect.any(Date),
            lastProviderErrorCode: ALLOWLISTED_NOTIFICATION_ERROR_CODES.TELEGRAM_SEND_FAILED,
          }),
        }),
      );

      const updateCall = mockPrisma.marketplaceOrderPayment.update.mock.calls[0][0];
      const nextAttemptAt = updateCall.data.notificationNextAttemptAt;
      expect(nextAttemptAt.getTime()).toBeGreaterThan(now.getTime());
    });

    it("stops retrying and marks BLOCKED when maximum notification attempts are exceeded", async () => {
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue({
        id: "pay_exhausted",
        status: MarketplaceOrderPaymentStatus.PAID,
        notificationAttemptCount: 4, // 5th attempt will exceed MAX_NOTIFICATION_ATTEMPTS (5)
        order: {
          id: "ord_exhausted",
          status: MarketplaceOrderStatus.PENDING,
          assignedLocalMateProfileId: "guide_1",
        },
      });
      mockPrisma.localMateTelegramBinding.findFirst.mockResolvedValue({
        id: "bind_1",
        localMateProfileId: "guide_1",
        telegramChatId: "tg_123",
      });
      mockBridge.sendOrderNotificationToGuide.mockResolvedValue({
        success: false,
        isTerminal: false,
        errorCode: ALLOWLISTED_NOTIFICATION_ERROR_CODES.TELEGRAM_SEND_FAILED,
      });

      const result = await service.executeClaimedNotification("pay_exhausted");

      expect(result.success).toBe(false);
      expect(result.isTerminal).toBe(true);
      expect(mockPrisma.marketplaceOrderPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "pay_exhausted" },
          data: expect.objectContaining({
            guideNotificationStatus: MarketplaceGuideNotificationStatus.BLOCKED,
            notificationAttemptCount: 5,
            notificationNextAttemptAt: null, // Terminated: retries stopped
            lastProviderErrorCode: ALLOWLISTED_NOTIFICATION_ERROR_CODES.MAX_ATTEMPTS_EXCEEDED,
          }),
        }),
      );
    });
  });

  describe("Terminal binding and ownership failures", () => {
    it("safely terminates retrying as BLOCKED when guide has no active Telegram binding", async () => {
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue({
        id: "pay_no_bind",
        status: MarketplaceOrderPaymentStatus.PAID,
        order: {
          id: "ord_no_bind",
          status: MarketplaceOrderStatus.PENDING,
          assignedLocalMateProfileId: "guide_unbound",
        },
      });
      mockPrisma.localMateTelegramBinding.findFirst.mockResolvedValue(null);

      const result = await service.executeClaimedNotification("pay_no_bind");

      expect(result.success).toBe(false);
      expect(result.isTerminal).toBe(true);
      expect(result.errorCode).toBe(
        ALLOWLISTED_NOTIFICATION_ERROR_CODES.NO_ACTIVE_TELEGRAM_BINDING,
      );
      expect(mockPrisma.marketplaceOrderPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "pay_no_bind" },
          data: expect.objectContaining({
            guideNotificationStatus: MarketplaceGuideNotificationStatus.BLOCKED,
            notificationNextAttemptAt: null,
            lastProviderErrorCode: ALLOWLISTED_NOTIFICATION_ERROR_CODES.NO_ACTIVE_TELEGRAM_BINDING,
          }),
        }),
      );
      expect(mockBridge.sendOrderNotificationToGuide).not.toHaveBeenCalled();
    });

    it("safely terminates retrying as BLOCKED when order status is no longer PENDING", async () => {
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue({
        id: "pay_cancelled_order",
        status: MarketplaceOrderPaymentStatus.PAID,
        order: {
          id: "ord_cancelled",
          status: MarketplaceOrderStatus.CANCELLED,
          assignedLocalMateProfileId: "guide_1",
        },
      });

      const result = await service.executeClaimedNotification("pay_cancelled_order");

      expect(result.success).toBe(false);
      expect(result.isTerminal).toBe(true);
      expect(result.errorCode).toBe(ALLOWLISTED_NOTIFICATION_ERROR_CODES.ORDER_NOT_PENDING);
      expect(mockPrisma.marketplaceOrderPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "pay_cancelled_order" },
          data: expect.objectContaining({
            guideNotificationStatus: MarketplaceGuideNotificationStatus.BLOCKED,
            notificationNextAttemptAt: null,
            lastProviderErrorCode: ALLOWLISTED_NOTIFICATION_ERROR_CODES.ORDER_NOT_PENDING,
          }),
        }),
      );
      expect(mockBridge.sendOrderNotificationToGuide).not.toHaveBeenCalled();
    });

    it("terminates retrying as BLOCKED when bridge returns terminal bot blocked error", async () => {
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue({
        id: "pay_blocked_bot",
        status: MarketplaceOrderPaymentStatus.PAID,
        order: {
          id: "ord_blocked",
          status: MarketplaceOrderStatus.PENDING,
          assignedLocalMateProfileId: "guide_1",
        },
      });
      mockPrisma.localMateTelegramBinding.findFirst.mockResolvedValue({
        id: "bind_1",
        localMateProfileId: "guide_1",
        telegramChatId: "tg_123",
      });
      mockBridge.sendOrderNotificationToGuide.mockResolvedValue({
        success: false,
        isTerminal: true,
        errorCode: ALLOWLISTED_NOTIFICATION_ERROR_CODES.TELEGRAM_BOT_BLOCKED,
      });

      const result = await service.executeClaimedNotification("pay_blocked_bot");

      expect(result.success).toBe(false);
      expect(result.isTerminal).toBe(true);
      expect(mockPrisma.marketplaceOrderPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "pay_blocked_bot" },
          data: expect.objectContaining({
            guideNotificationStatus: MarketplaceGuideNotificationStatus.BLOCKED,
            notificationNextAttemptAt: null,
            lastProviderErrorCode: ALLOWLISTED_NOTIFICATION_ERROR_CODES.TELEGRAM_BOT_BLOCKED,
          }),
        }),
      );
    });
  });

  describe("Due filter regression: terminal BLOCKED vs transient FAILED", () => {
    it("proves claimNotification query excludes BLOCKED and excludes FAILED with null nextAttemptAt", async () => {
      const now = new Date();
      mockPrisma.marketplaceOrderPayment.updateMany.mockResolvedValue({ count: 1 });

      await service.claimNotification("pay_test", now);

      const whereClause = mockPrisma.marketplaceOrderPayment.updateMany.mock.calls[0][0].where;

      // Ensure BLOCKED is not in any eligible status
      expect(whereClause.OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            guideNotificationStatus: MarketplaceGuideNotificationStatus.PENDING,
          }),
          expect.objectContaining({
            guideNotificationStatus: MarketplaceGuideNotificationStatus.FAILED,
            notificationNextAttemptAt: { lte: now, not: null },
          }),
          expect.objectContaining({
            guideNotificationStatus: MarketplaceGuideNotificationStatus.SENDING,
            notificationLeaseUntil: { lt: now },
          }),
        ]),
      );

      // Verify that no clause accepts BLOCKED
      const matchesBlocked = whereClause.OR.some(
        (c: any) => c.guideNotificationStatus === MarketplaceGuideNotificationStatus.BLOCKED,
      );
      expect(matchesBlocked).toBe(false);
    });

    it("proves processPendingNotifications candidate query requires non-null nextAttemptAt for FAILED rows", async () => {
      const now = new Date();
      mockPrisma.marketplaceOrderPayment.findMany.mockResolvedValue([]);

      await service.processPendingNotifications(10, now);

      const findManyCall = mockPrisma.marketplaceOrderPayment.findMany.mock.calls[0][0];
      const orClauses = findManyCall.where.OR;

      const failedClause = orClauses.find(
        (c: any) => c.guideNotificationStatus === MarketplaceGuideNotificationStatus.FAILED,
      );
      expect(failedClause).toBeDefined();
      expect(failedClause.notificationNextAttemptAt).toEqual({ lte: now, not: null });

      const blockedClause = orClauses.find(
        (c: any) => c.guideNotificationStatus === MarketplaceGuideNotificationStatus.BLOCKED,
      );
      expect(blockedClause).toBeUndefined();
    });

    it("allows transient FAILED rows with due nextAttemptAt to be claimed and retried", async () => {
      const now = new Date();
      const pastAttemptTime = new Date(now.getTime() - 30 * 1000); // 30 seconds ago

      mockPrisma.marketplaceOrderPayment.findMany.mockResolvedValue([
        {
          id: "pay_transient_due",
          status: MarketplaceOrderPaymentStatus.PAID,
          guideNotificationStatus: MarketplaceGuideNotificationStatus.FAILED,
          notificationNextAttemptAt: pastAttemptTime,
        },
      ]);
      mockPrisma.marketplaceOrderPayment.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue({
        id: "pay_transient_due",
        status: MarketplaceOrderPaymentStatus.PAID,
        order: {
          id: "ord_transient_due",
          status: MarketplaceOrderStatus.PENDING,
          assignedLocalMateProfileId: "guide_1",
        },
      });
      mockPrisma.localMateTelegramBinding.findFirst.mockResolvedValue({
        id: "bind_1",
        localMateProfileId: "guide_1",
        telegramChatId: "tg_123",
      });
      mockBridge.sendOrderNotificationToGuide.mockResolvedValue({ success: true, messageId: 888 });

      const summary = await service.processPendingNotifications(10, now);

      expect(summary.processed).toBe(1);
      expect(summary.sent).toBe(1);
      expect(mockBridge.sendOrderNotificationToGuide).toHaveBeenCalledTimes(1);
      expect(mockPrisma.marketplaceOrderPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "pay_transient_due" },
          data: expect.objectContaining({
            guideNotificationStatus: MarketplaceGuideNotificationStatus.SENT,
          }),
        }),
      );
    });
  });

  describe("Correct monetary payload passing", () => {
    it("passes exact snapshot amounts to the bridge", async () => {
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue({
        id: "pay_money",
        orderId: "ord_money",
        status: MarketplaceOrderPaymentStatus.PAID,
        tourTotalAmount: "2500000",
        platformFeeRateSnapshot: "15.00",
        platformFeeAmount: "375000",
        guideRemainingAmount: "2125000",
        currency: "VND",
        order: {
          id: "ord_money",
          orderNumber: "MP9988",
          status: MarketplaceOrderStatus.PENDING,
          assignedLocalMateProfileId: "guide_1",
        },
      });
      mockPrisma.localMateTelegramBinding.findFirst.mockResolvedValue({
        id: "bind_1",
        localMateProfileId: "guide_1",
        telegramChatId: "tg_123",
      });
      mockBridge.sendOrderNotificationToGuide.mockResolvedValue({
        success: true,
        messageId: 999,
      });

      await service.executeClaimedNotification("pay_money");

      expect(mockBridge.sendOrderNotificationToGuide).toHaveBeenCalledWith(
        expect.objectContaining({
          payment: {
            tourTotalAmount: "2500000",
            platformFeeRateSnapshot: "15.00",
            platformFeeAmount: "375000",
            guideRemainingAmount: "2125000",
            currency: "VND",
            status: MarketplaceOrderPaymentStatus.PAID,
          },
        }),
      );
    });
  });
});
