import {
  MarketplaceMessageDeliveryStatus,
  MarketplaceOrderPaymentStatus,
  MarketplaceOrderStatus,
} from "@prisma/client";
import { TelegramMarketplaceRetryService } from "../application/telegram-marketplace-retry.service";

describe("TelegramMarketplaceRetryService", () => {
  let service: TelegramMarketplaceRetryService;
  let mockPrisma: any;
  let mockBridgeService: any;

  beforeEach(() => {
    mockPrisma = {
      marketplaceConversationMessage: {
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    mockBridgeService = {
      sendGuestMessageToGuide: jest.fn().mockResolvedValue(undefined),
    };
    service = new TelegramMarketplaceRetryService(mockPrisma, mockBridgeService);
  });

  it("retries pending failed messages for acknowledged orders", async () => {
    const message = {
      id: "msg_1",
      deliveryStatus: MarketplaceMessageDeliveryStatus.FAILED,
      attemptCount: 1,
      conversation: {
        id: "conv_1",
        order: {
          id: "ord_1",
          status: MarketplaceOrderStatus.ACKNOWLEDGED,
        },
      },
    };

    mockPrisma.marketplaceConversationMessage.findMany.mockResolvedValue([message]);

    const count = await service.processPendingRetries();

    expect(count).toBe(1);
    expect(mockPrisma.marketplaceConversationMessage.updateMany).toHaveBeenCalledWith({
      where: {
        id: "msg_1",
        deliveryStatus: MarketplaceMessageDeliveryStatus.FAILED,
        nextAttemptAt: { lte: expect.any(Date) },
        attemptCount: { lt: 3 },
      },
      data: { nextAttemptAt: expect.any(Date) },
    });
    expect(mockBridgeService.sendGuestMessageToGuide).toHaveBeenCalledWith({
      message,
      order: message.conversation.order,
      conversation: message.conversation,
    });
  });

  it("skips delivery when another runtime already claimed the retry", async () => {
    const message = {
      id: "msg_claimed",
      deliveryStatus: MarketplaceMessageDeliveryStatus.FAILED,
      attemptCount: 1,
      nextAttemptAt: new Date("2026-10-04T00:00:00.000Z"),
      conversation: {
        id: "conv_1",
        order: { id: "ord_1", status: MarketplaceOrderStatus.ACKNOWLEDGED },
      },
    };
    mockPrisma.marketplaceConversationMessage.findMany.mockResolvedValue([message]);
    mockPrisma.marketplaceConversationMessage.updateMany.mockResolvedValue({ count: 0 });

    const count = await service.processPendingRetries();

    expect(count).toBe(0);
    expect(mockBridgeService.sendGuestMessageToGuide).not.toHaveBeenCalled();
  });

  it("drops retry for messages belonging to unpaid pending orders or terminal orders", async () => {
    const messageTerminal = {
      id: "msg_term",
      deliveryStatus: MarketplaceMessageDeliveryStatus.FAILED,
      attemptCount: 1,
      conversation: {
        id: "conv_term",
        order: {
          id: "ord_term",
          status: MarketplaceOrderStatus.CANCELLED,
        },
      },
    };

    const messageUnpaid = {
      id: "msg_unpaid",
      deliveryStatus: MarketplaceMessageDeliveryStatus.FAILED,
      attemptCount: 1,
      conversation: {
        id: "conv_unpaid",
        order: {
          id: "ord_unpaid",
          status: MarketplaceOrderStatus.PENDING,
          payment: { status: MarketplaceOrderPaymentStatus.OPEN },
        },
      },
    };

    mockPrisma.marketplaceConversationMessage.findMany.mockResolvedValue([
      messageTerminal,
      messageUnpaid,
    ]);

    const count = await service.processPendingRetries();

    expect(count).toBe(0);
    expect(mockPrisma.marketplaceConversationMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "msg_term" },
        data: { nextAttemptAt: null },
      }),
    );
    expect(mockPrisma.marketplaceConversationMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "msg_unpaid" },
        data: { nextAttemptAt: null },
      }),
    );
    expect(mockBridgeService.sendGuestMessageToGuide).not.toHaveBeenCalled();
  });

  it("retains retry eligibility and retries failed guest messages for paid pending orders", async () => {
    const message = {
      id: "msg_pending_paid",
      deliveryStatus: MarketplaceMessageDeliveryStatus.FAILED,
      attemptCount: 1,
      conversation: {
        id: "conv_pending",
        order: {
          id: "ord_pending",
          status: MarketplaceOrderStatus.PENDING,
          payment: {
            status: MarketplaceOrderPaymentStatus.PAID,
          },
        },
      },
    };

    mockPrisma.marketplaceConversationMessage.findMany.mockResolvedValue([message]);

    const count = await service.processPendingRetries();

    expect(count).toBe(1);
    expect(mockPrisma.marketplaceConversationMessage.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "msg_pending_paid" },
        data: { nextAttemptAt: null },
      }),
    );
    expect(mockPrisma.marketplaceConversationMessage.updateMany).toHaveBeenCalledWith({
      where: {
        id: "msg_pending_paid",
        deliveryStatus: MarketplaceMessageDeliveryStatus.FAILED,
        nextAttemptAt: { lte: expect.any(Date) },
        attemptCount: { lt: 3 },
      },
      data: { nextAttemptAt: expect.any(Date) },
    });
    expect(mockBridgeService.sendGuestMessageToGuide).toHaveBeenCalledWith({
      message,
      order: message.conversation.order,
      conversation: message.conversation,
    });
  });

  it("retains retry eligibility and retries failed guest messages for pending orders when payment is NOT_REQUIRED", async () => {
    const message = {
      id: "msg_pending_not_req",
      deliveryStatus: MarketplaceMessageDeliveryStatus.FAILED,
      attemptCount: 1,
      conversation: {
        id: "conv_pending_2",
        order: {
          id: "ord_pending_2",
          status: MarketplaceOrderStatus.PENDING,
          payment: {
            status: MarketplaceOrderPaymentStatus.NOT_REQUIRED,
          },
        },
      },
    };

    mockPrisma.marketplaceConversationMessage.findMany.mockResolvedValue([message]);

    const count = await service.processPendingRetries();

    expect(count).toBe(1);
    expect(mockPrisma.marketplaceConversationMessage.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "msg_pending_not_req" },
        data: { nextAttemptAt: null },
      }),
    );
    expect(mockBridgeService.sendGuestMessageToGuide).toHaveBeenCalledWith({
      message,
      order: message.conversation.order,
      conversation: message.conversation,
    });
  });
});
