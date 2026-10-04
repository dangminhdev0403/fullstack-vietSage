import { MarketplaceMessageDeliveryStatus, MarketplaceOrderStatus } from "@prisma/client";
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

  it("drops retry for messages belonging to unacknowledged or terminal orders", async () => {
    const message = {
      id: "msg_2",
      deliveryStatus: MarketplaceMessageDeliveryStatus.FAILED,
      attemptCount: 1,
      conversation: {
        id: "conv_2",
        order: {
          id: "ord_2",
          status: MarketplaceOrderStatus.CANCELLED,
        },
      },
    };

    mockPrisma.marketplaceConversationMessage.findMany.mockResolvedValue([message]);

    const count = await service.processPendingRetries();

    expect(count).toBe(0);
    expect(mockPrisma.marketplaceConversationMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "msg_2" },
        data: { nextAttemptAt: null },
      }),
    );
    expect(mockBridgeService.sendGuestMessageToGuide).not.toHaveBeenCalled();
  });
});
