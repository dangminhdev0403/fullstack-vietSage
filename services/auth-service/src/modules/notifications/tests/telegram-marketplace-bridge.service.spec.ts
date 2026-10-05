import {
  MarketplaceMessageDeliveryStatus,
  MarketplaceOrderActorType,
  MarketplaceOrderPaymentStatus,
  MarketplaceOrderStatus,
} from "@prisma/client";
import { TelegramMarketplaceBridgeService } from "../application/telegram-marketplace-bridge.service";
import { RequestRealtimeEmitter } from "../../../request-realtime.emitter";

describe("TelegramMarketplaceBridgeService", () => {
  let service: TelegramMarketplaceBridgeService;
  let mockPrisma: any;
  let mockTelegram: any;
  let mockPayments: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(RequestRealtimeEmitter, "emitExternalServiceOrderStatusChanged")
      .mockImplementation(() => {});
    jest
      .spyOn(RequestRealtimeEmitter, "emitMarketplaceConversationMessageCreated")
      .mockImplementation(() => {});

    mockPrisma = {
      marketplaceOrder: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      localMateTelegramBinding: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      marketplaceConversation: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      marketplaceConversationMessage: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      marketplaceOrderEvent: {
        create: jest.fn(),
      },
      marketplaceService: {
        update: jest.fn(),
      },
      marketplaceOrderPayment: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(mockPrisma)),
    };

    mockTelegram = {
      callTelegram: jest.fn().mockResolvedValue({ result: { message_id: 12345 } }),
    };
    mockPayments = {
      refundLocalMatePayment: jest.fn().mockResolvedValue({
        status: MarketplaceOrderPaymentStatus.REFUNDED,
      }),
    };

    service = new TelegramMarketplaceBridgeService(mockPrisma, mockTelegram, mockPayments);
  });

  describe("sendOrderNotificationToGuide", () => {
    it("dispatches order card with protect_content and inline keyboard when binding exists", async () => {
      mockPrisma.localMateTelegramBinding.findFirst.mockResolvedValue({
        id: "bind_1",
        localMateProfileId: "guide_1",
        telegramChatId: "tg_chat_1",
      });
      mockPrisma.marketplaceConversation.findUnique.mockResolvedValue({ id: "conv_1" });
      mockPrisma.marketplaceConversationMessage.create.mockResolvedValue({});

      await service.sendOrderNotificationToGuide({
        id: "ord_1",
        orderNumber: "MP123456",
        assignedLocalMateProfileId: "guide_1",
        serviceNameSnapshot: "Tour Phố Cổ",
        stay: { guestDisplayName: "John Doe", room: { roomNumber: "101" } },
        requestedStartAt: new Date(),
        partySize: 2,
        partnerSubtotal: 500000,
      });

      expect(mockTelegram.callTelegram).toHaveBeenCalledWith(
        "sendMessage",
        expect.objectContaining({
          chat_id: "tg_chat_1",
          protect_content: true,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ Nhận đơn", callback_data: "mo:a:ord_1" },
                { text: "❌ Từ chối", callback_data: "mo:r:ord_1" },
              ],
            ],
          },
        }),
      );
    });

    it("does nothing if order is not assigned to a LocalMate", async () => {
      await service.sendOrderNotificationToGuide({
        id: "ord_2",
        assignedLocalMateProfileId: null,
      });

      expect(mockTelegram.callTelegram).not.toHaveBeenCalled();
    });

    it("blocks notification and does not call Telegram when payment status is OPEN (pre-payment block)", async () => {
      mockPrisma.localMateTelegramBinding.findFirst.mockResolvedValue({
        id: "bind_1",
        localMateProfileId: "guide_1",
        telegramChatId: "tg_chat_1",
      });

      const result = await service.sendOrderNotificationToGuide({
        id: "ord_unpaid",
        orderNumber: "MP999",
        assignedLocalMateProfileId: "guide_1",
        stay: { guestDisplayName: "Bob", room: { roomNumber: "102" } },
        payment: {
          status: "OPEN",
          tourTotalAmount: 1000000,
          platformFeeAmount: 150000,
          guideRemainingAmount: 850000,
        },
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("PAYMENT_NOT_READY");
      expect(mockTelegram.callTelegram).not.toHaveBeenCalled();
    });

    it("includes tour total, VietSage paid amount, guide remaining amount, and buttons when payment is PAID", async () => {
      mockPrisma.localMateTelegramBinding.findFirst.mockResolvedValue({
        id: "bind_1",
        localMateProfileId: "guide_1",
        telegramChatId: "tg_chat_1",
      });
      mockPrisma.marketplaceConversation.findUnique.mockResolvedValue({ id: "conv_1" });
      mockPrisma.marketplaceConversationMessage.create.mockResolvedValue({});

      const result = await service.sendOrderNotificationToGuide({
        id: "ord_paid",
        orderNumber: "MP888",
        assignedLocalMateProfileId: "guide_1",
        serviceNameSnapshot: "Tour Ẩm Thực Hà Nội",
        stay: { guestDisplayName: "Sarah", room: { roomNumber: "305" } },
        requestedStartAt: new Date("2026-10-10T10:00:00Z"),
        partySize: 3,
        payment: {
          status: "PAID",
          tourTotalAmount: 1500000,
          platformFeeAmount: 225000,
          guideRemainingAmount: 1275000,
        },
      });

      expect(result.success).toBe(true);
      expect(mockTelegram.callTelegram).toHaveBeenCalledWith(
        "sendMessage",
        expect.objectContaining({
          chat_id: "tg_chat_1",
          protect_content: true,
          text: expect.stringMatching(/Mã đơn.*#MP888/),
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ Nhận đơn", callback_data: "mo:a:ord_paid" },
                { text: "❌ Từ chối", callback_data: "mo:r:ord_paid" },
              ],
            ],
          },
        }),
      );

      const sentCall = mockTelegram.callTelegram.mock.calls.find(
        (c: any) => c[0] === "sendMessage",
      );
      const sentText = sentCall[1].text;
      expect(sentText).toContain("1.500.000 VND"); // Tour total
      expect(sentText).toContain("225.000 VND"); // Paid to VietSage
      expect(sentText).toContain("1.275.000 VND"); // Guide collects
      expect(sentText).toContain("Tour total");
      expect(sentText).toContain("Paid to VietSage");
      expect(sentText).toContain("Guide collects");
    });
  });

  describe("handleCallbackQuery", () => {
    it("authorizes callback against both Telegram user and source chat", async () => {
      mockPrisma.localMateTelegramBinding.findFirst.mockResolvedValue(null);

      await service.handleCallbackQuery({
        id: "cb_chat_scope",
        data: "mo:a:ord_1",
        from: { id: 1001 },
        message: { message_id: 888, chat: { id: 777, type: "private" } },
      });

      expect(mockPrisma.localMateTelegramBinding.findFirst).toHaveBeenCalledWith({
        where: {
          telegramUserId: "1001",
          telegramChatId: "777",
          revokedAt: null,
          blockedAt: null,
        },
      });
      expect(mockPrisma.marketplaceOrder.findUnique).not.toHaveBeenCalled();
    });

    it("rejects unauthorized user attempting to accept order", async () => {
      mockPrisma.localMateTelegramBinding.findFirst.mockResolvedValue(null);

      await service.handleCallbackQuery({
        id: "cb_1",
        data: "mo:a:ord_1",
        from: { id: 99999 },
      });

      expect(mockTelegram.callTelegram).toHaveBeenCalledWith(
        "answerCallbackQuery",
        expect.objectContaining({
          callback_query_id: "cb_1",
          show_alert: true,
          text: "Bạn không có quyền thực hiện thao tác này.",
        }),
      );
      expect(mockPrisma.marketplaceOrder.update).not.toHaveBeenCalled();
    });

    it("accepts order and transitions to ACKNOWLEDGED for the assigned guide", async () => {
      mockPrisma.localMateTelegramBinding.findFirst.mockResolvedValue({
        id: "bind_1",
        localMateProfileId: "guide_1",
        telegramUserId: "1001",
      });
      mockPrisma.marketplaceOrder.findUnique.mockResolvedValue({
        id: "ord_1",
        orderNumber: "MP100",
        assignedLocalMateProfileId: "guide_1",
        status: MarketplaceOrderStatus.PENDING,
        version: 1,
        hotelId: "h1",
        stayId: "s1",
        serviceTenantId: "st1",
        serviceId: "svc1",
        stay: { guestDisplayName: "Alice", room: { id: "r1", roomNumber: "201" } },
      });
      mockPrisma.marketplaceOrder.update.mockResolvedValue({ id: "ord_1", version: 2 });
      mockPrisma.marketplaceConversation.findUnique.mockResolvedValue({ id: "conv_1" });

      await service.handleCallbackQuery({
        id: "cb_2",
        data: "mo:a:ord_1",
        from: { id: 1001 },
        message: { message_id: 888, chat: { id: 777, type: "private" } },
      });

      expect(mockPrisma.marketplaceOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "ord_1", version: 1 },
          data: { status: MarketplaceOrderStatus.ACKNOWLEDGED, version: { increment: 1 } },
        }),
      );
      expect(mockPrisma.marketplaceOrderEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId: "ord_1",
            toStatus: MarketplaceOrderStatus.ACKNOWLEDGED,
            actorType: MarketplaceOrderActorType.SERVICE_STAFF,
          }),
        }),
      );
      expect(RequestRealtimeEmitter.emitExternalServiceOrderStatusChanged).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: "ord_1",
          toStatus: MarketplaceOrderStatus.ACKNOWLEDGED,
        }),
      );
      expect(mockTelegram.callTelegram).toHaveBeenCalledWith(
        "answerCallbackQuery",
        expect.objectContaining({
          callback_query_id: "cb_2",
          text: "Bạn đã nhận đơn thành công!",
        }),
      );
    });

    it("rejects order, persists refund intent, and requests the paid fee refund", async () => {
      mockPrisma.localMateTelegramBinding.findFirst.mockResolvedValue({
        id: "bind_1",
        localMateProfileId: "guide_1",
        telegramUserId: "1001",
      });
      mockPrisma.marketplaceOrder.findUnique.mockResolvedValue({
        id: "ord_1",
        orderNumber: "MP100",
        assignedLocalMateProfileId: "guide_1",
        status: MarketplaceOrderStatus.PENDING,
        version: 1,
        hotelId: "h1",
        stayId: "s1",
        serviceTenantId: "st1",
        serviceId: "svc1",
        quantity: 2,
        service: { id: "svc1", capacityAvailable: 5 },
        payment: { id: "pay-1", status: MarketplaceOrderPaymentStatus.PAID },
      });
      mockPrisma.marketplaceOrder.update.mockResolvedValue({ id: "ord_1", version: 2 });
      mockPrisma.marketplaceOrderPayment.updateMany.mockResolvedValue({ count: 1 });

      await service.handleCallbackQuery({
        id: "cb_3",
        data: "mo:r:ord_1",
        from: { id: 1001 },
        message: { message_id: 888, chat: { id: 777, type: "private" } },
      });

      expect(mockPrisma.marketplaceService.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "svc1" },
          data: { capacityAvailable: { increment: 2 }, version: { increment: 1 } },
        }),
      );
      expect(mockPrisma.marketplaceOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "ord_1", version: 1 },
          data: { status: MarketplaceOrderStatus.REJECTED, version: { increment: 1 } },
        }),
      );
      expect(mockPrisma.marketplaceOrderPayment.updateMany).toHaveBeenCalledWith({
        where: { id: "pay-1", status: MarketplaceOrderPaymentStatus.PAID },
        data: expect.objectContaining({
          status: MarketplaceOrderPaymentStatus.REFUND_PENDING,
          refundReasonCode: "GUIDE_REJECTED",
          refundNextAttemptAt: expect.any(Date),
        }),
      });
      expect(mockPayments.refundLocalMatePayment).toHaveBeenCalledWith({
        paymentId: "pay-1",
        reason: "GUIDE_REJECTED",
      });
    });
  });

  describe("sendGuestMessageToGuide", () => {
    it("delivers message and updates deliveryStatus to SENT", async () => {
      mockPrisma.localMateTelegramBinding.findFirst.mockResolvedValue({
        id: "bind_1",
        telegramChatId: "tg_chat_1",
      });

      await service.sendGuestMessageToGuide({
        message: { id: "msg_1", body: "Xin chào bạn!" },
        order: { assignedLocalMateProfileId: "guide_1", orderNumber: "MP100" },
        conversation: { id: "conv_1" },
      });

      expect(mockTelegram.callTelegram).toHaveBeenCalledWith(
        "sendMessage",
        expect.objectContaining({
          chat_id: "tg_chat_1",
          protect_content: true,
        }),
      );
      expect(mockPrisma.marketplaceConversationMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "msg_1" },
          data: expect.objectContaining({
            deliveryStatus: MarketplaceMessageDeliveryStatus.SENT,
            telegramMessageId: "12345",
          }),
        }),
      );
    });

    it("marks binding blockedAt when Telegram returns bot blocked", async () => {
      mockPrisma.localMateTelegramBinding.findFirst.mockResolvedValue({
        id: "bind_1",
        telegramChatId: "tg_chat_1",
      });
      mockTelegram.callTelegram.mockRejectedValue(
        new Error("Forbidden: bot was blocked by the user"),
      );

      await service.sendGuestMessageToGuide({
        message: { id: "msg_1", body: "Alo" },
        order: { assignedLocalMateProfileId: "guide_1", orderNumber: "MP100" },
        conversation: { id: "conv_1" },
      });

      expect(mockPrisma.localMateTelegramBinding.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "bind_1" },
          data: expect.objectContaining({ blockedAt: expect.any(Date) }),
        }),
      );
      expect(mockPrisma.marketplaceConversationMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "msg_1" },
          data: expect.objectContaining({
            deliveryStatus: MarketplaceMessageDeliveryStatus.FAILED,
            nextAttemptAt: null,
          }),
        }),
      );
    });

    it("schedules nextAttemptAt on transient failure", async () => {
      mockPrisma.localMateTelegramBinding.findFirst.mockResolvedValue({
        id: "bind_1",
        telegramChatId: "tg_chat_1",
      });
      mockTelegram.callTelegram.mockRejectedValue(new Error("ETIMEDOUT: Connection timed out"));

      await service.sendGuestMessageToGuide({
        message: { id: "msg_2", body: "Test" },
        order: { assignedLocalMateProfileId: "guide_1", orderNumber: "MP100" },
        conversation: { id: "conv_1" },
      });

      expect(mockPrisma.marketplaceConversationMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "msg_2" },
          data: expect.objectContaining({
            deliveryStatus: MarketplaceMessageDeliveryStatus.FAILED,
            nextAttemptAt: expect.any(Date),
          }),
        }),
      );
    });

    it("doubles transient retry delay after each failed attempt", async () => {
      jest.useFakeTimers().setSystemTime(new Date("2026-10-03T00:00:00.000Z"));
      mockPrisma.localMateTelegramBinding.findFirst.mockResolvedValue({
        id: "bind_1",
        telegramChatId: "tg_chat_1",
      });
      mockTelegram.callTelegram.mockRejectedValue(new Error("ETIMEDOUT: Connection timed out"));

      await service.sendGuestMessageToGuide({
        message: { id: "msg_3", body: "Test", attemptCount: 1 },
        order: { assignedLocalMateProfileId: "guide_1", orderNumber: "MP100" },
        conversation: { id: "conv_1" },
      });

      expect(mockPrisma.marketplaceConversationMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "msg_3" },
          data: expect.objectContaining({
            nextAttemptAt: new Date("2026-10-03T00:02:00.000Z"),
          }),
        }),
      );
      jest.useRealTimers();
    });
  });

  describe("handleInboundMessage", () => {
    it("routes message to conversation via reply_to_message", async () => {
      mockPrisma.localMateTelegramBinding.findFirst.mockResolvedValue({
        id: "bind_1",
        localMateProfileId: "guide_1",
        telegramUserId: "1001",
        telegramChatId: "chat_1",
      });
      mockPrisma.marketplaceConversationMessage.findFirst.mockResolvedValue({
        orderId: "ord_1",
        conversationId: "conv_1",
      });
      mockPrisma.marketplaceOrder.findUnique.mockResolvedValue({
        id: "ord_1",
        assignedLocalMateProfileId: "guide_1",
        status: MarketplaceOrderStatus.ACKNOWLEDGED,
        hotelId: "h1",
        stayId: "s1",
        stay: { guestSessions: [{ id: "sess_1" }] },
      });
      mockPrisma.marketplaceConversationMessage.findUnique.mockResolvedValue(null);
      mockPrisma.marketplaceConversation.findUnique.mockResolvedValue({ id: "conv_1" });
      mockPrisma.marketplaceConversationMessage.create.mockResolvedValue({
        id: "msg_new",
        orderId: "ord_1",
        senderType: MarketplaceOrderActorType.SERVICE_STAFF,
        body: "Chào bạn, mình sẽ đến đúng giờ!",
        deliveryStatus: MarketplaceMessageDeliveryStatus.RECEIVED,
        createdAt: new Date(),
      });

      await service.handleInboundMessage({
        message_id: 555,
        from: { id: 1001 },
        chat: { id: 1001, type: "private" },
        text: "Chào bạn, mình sẽ đến đúng giờ!",
        reply_to_message: { message_id: 12345, chat: { id: 1001, type: "private" } },
      });

      expect(mockPrisma.marketplaceConversationMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId: "ord_1",
            senderType: MarketplaceOrderActorType.SERVICE_STAFF,
            body: "Chào bạn, mình sẽ đến đúng giờ!",
            deliveryStatus: MarketplaceMessageDeliveryStatus.RECEIVED,
          }),
        }),
      );
      expect(RequestRealtimeEmitter.emitMarketplaceConversationMessageCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: "ord_1",
          message: expect.objectContaining({ body: "Chào bạn, mình sẽ đến đúng giờ!" }),
        }),
      );
    });

    it("rejects a Telegram reply when the mapped order belongs to another LocalMate", async () => {
      mockPrisma.localMateTelegramBinding.findFirst.mockResolvedValue({
        id: "bind_1",
        localMateProfileId: "guide_1",
        telegramUserId: "1001",
        telegramChatId: "chat_1",
      });
      mockPrisma.marketplaceConversationMessage.findFirst.mockResolvedValue({ orderId: "ord_2" });
      mockPrisma.marketplaceOrder.findUnique.mockResolvedValue({
        id: "ord_2",
        assignedLocalMateProfileId: "guide_2",
        status: MarketplaceOrderStatus.ACKNOWLEDGED,
        hotelId: "h1",
        stayId: "s1",
        stay: { guestSessions: [{ id: "sess_1" }] },
      });
      mockPrisma.marketplaceConversationMessage.findUnique.mockResolvedValue(null);
      mockPrisma.marketplaceConversation.findUnique.mockResolvedValue({ id: "conv_2" });
      mockPrisma.marketplaceConversationMessage.create.mockResolvedValue({
        id: "msg_wrong_guide",
        orderId: "ord_2",
        senderType: MarketplaceOrderActorType.SERVICE_STAFF,
        body: "Tin nhắn sai người nhận",
        deliveryStatus: MarketplaceMessageDeliveryStatus.RECEIVED,
        createdAt: new Date(),
      });

      await service.handleInboundMessage({
        message_id: 556,
        from: { id: 1001 },
        chat: { id: 1001, type: "private" },
        text: "Tin nhắn sai người nhận",
        reply_to_message: { message_id: 12346, chat: { id: 1001, type: "private" } },
      });

      expect(mockPrisma.marketplaceConversationMessage.create).not.toHaveBeenCalled();
      expect(
        RequestRealtimeEmitter.emitMarketplaceConversationMessageCreated,
      ).not.toHaveBeenCalled();
    });

    it("prompts for Reply and persists nothing when guide has multiple active orders (ambiguous no-reply)", async () => {
      mockPrisma.localMateTelegramBinding.findFirst.mockResolvedValue({
        id: "bind_1",
        localMateProfileId: "guide_1",
        telegramUserId: "1001",
        telegramChatId: "chat_1",
      });
      mockPrisma.marketplaceOrder.findMany.mockResolvedValue([
        { id: "ord_1", status: MarketplaceOrderStatus.ACKNOWLEDGED },
        { id: "ord_2", status: MarketplaceOrderStatus.ACKNOWLEDGED },
      ]);

      await service.handleInboundMessage({
        message_id: 777,
        from: { id: 1001 },
        chat: { id: 1001, type: "private" },
        text: "Tin nhắn không reply",
      });

      expect(mockTelegram.callTelegram).toHaveBeenCalledWith(
        "sendMessage",
        expect.objectContaining({
          text: expect.stringContaining("Bạn có nhiều đơn hàng đang hoạt động"),
        }),
      );
      expect(mockPrisma.marketplaceConversationMessage.create).not.toHaveBeenCalled();
    });

    it("ignores duplicate delivery when message_id was already persisted", async () => {
      mockPrisma.localMateTelegramBinding.findFirst.mockResolvedValue({
        id: "bind_1",
        localMateProfileId: "guide_1",
        telegramUserId: "1001",
        telegramChatId: "chat_1",
      });
      mockPrisma.marketplaceConversationMessage.findFirst.mockResolvedValue({
        orderId: "ord_1",
      });
      mockPrisma.marketplaceOrder.findUnique.mockResolvedValue({
        id: "ord_1",
        assignedLocalMateProfileId: "guide_1",
        status: MarketplaceOrderStatus.ACKNOWLEDGED,
      });
      mockPrisma.marketplaceConversationMessage.findUnique.mockResolvedValue({
        id: "msg_existing",
      });

      await service.handleInboundMessage({
        message_id: 555,
        from: { id: 1001 },
        chat: { id: 1001, type: "private" },
        text: "Trùng tin nhắn",
        reply_to_message: { message_id: 12345, chat: { id: 1001, type: "private" } },
      });

      expect(mockPrisma.marketplaceConversationMessage.create).not.toHaveBeenCalled();
    });
  });
});
