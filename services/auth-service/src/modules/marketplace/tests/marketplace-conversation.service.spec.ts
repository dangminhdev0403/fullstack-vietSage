import { ConflictException, NotFoundException } from "@nestjs/common";
import { MarketplaceOrderStatus } from "@prisma/client";
import { MarketplaceConversationService } from "../application/marketplace-conversation.service";
import { RequestRealtimeEmitter } from "../../../request-realtime.emitter";

describe("T3 - Marketplace Conversation Service", () => {
  beforeEach(() => {
    jest
      .spyOn(RequestRealtimeEmitter, "emitMarketplaceConversationMessageCreated")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("getConversation", () => {
    it("returns conversation and messages for authorized same-stay order", async () => {
      const mockOrder = {
        id: "order-1",
        hotelId: "hotel-1",
        stayId: "stay-1",
        serviceTenantId: "tenant-1",
        assignedLocalMateProfileId: "guide-1",
        status: MarketplaceOrderStatus.ACKNOWLEDGED,
        orderNumber: "MP100",
      };

      const mockConversation = {
        id: "conv-1",
        orderId: "order-1",
        status: "ACTIVE",
        lastMessageAt: new Date("2026-10-01T10:00:00Z"),
      };

      const mockMessages = [
        {
          id: "msg-1",
          orderId: "order-1",
          senderType: "GUEST",
          body: "Xin chào",
          deliveryStatus: "SENT",
          createdAt: new Date("2026-10-01T10:00:00Z"),
        },
      ];

      const prisma = {
        marketplaceOrder: {
          findUnique: jest.fn().mockResolvedValue(mockOrder),
        },
      };

      const repo = {
        findOrCreateConversation: jest.fn().mockResolvedValue(mockConversation),
        listMessages: jest.fn().mockResolvedValue(mockMessages),
      };

      const service = new MarketplaceConversationService(prisma as never, repo as never);
      const result = await service.getConversation(
        { hotelId: "hotel-1", stayId: "stay-1" },
        "order-1",
      );

      expect(result.id).toBe("conv-1");
      expect(result.orderStatus).toBe(MarketplaceOrderStatus.ACKNOWLEDGED);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].body).toBe("Xin chào");
    });

    it("throws NotFoundException if order does not belong to same stay or hotel", async () => {
      const mockOrder = {
        id: "order-1",
        hotelId: "hotel-1",
        stayId: "stay-OTHER",
      };

      const prisma = {
        marketplaceOrder: {
          findUnique: jest.fn().mockResolvedValue(mockOrder),
        },
      };

      const service = new MarketplaceConversationService(prisma as never, {} as never);
      await expect(
        service.getConversation({ hotelId: "hotel-1", stayId: "stay-1" }, "order-1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("sendGuestMessage", () => {
    it("allows sending message when order is ACKNOWLEDGED and emits realtime", async () => {
      const mockOrder = {
        id: "order-1",
        hotelId: "hotel-1",
        stayId: "stay-1",
        serviceTenantId: "tenant-1",
        assignedLocalMateProfileId: "guide-1",
        status: MarketplaceOrderStatus.ACKNOWLEDGED,
        stay: { room: { id: "room-1" }, guestSessions: [{ id: "sess-1" }] },
      };

      const mockConversation = { id: "conv-1" };
      const createdMessage = {
        id: "msg-1",
        orderId: "order-1",
        senderType: "GUEST",
        body: "Em có mặt ở sảnh rồi ạ",
        clientMessageId: "client-id-1",
        deliveryStatus: "PENDING",
        createdAt: new Date(),
      };

      const prisma = {
        marketplaceOrder: {
          findUnique: jest.fn().mockResolvedValue(mockOrder),
        },
      };

      const repo = {
        findOrCreateConversation: jest.fn().mockResolvedValue(mockConversation),
        appendGuestMessage: jest.fn().mockResolvedValue({
          isDuplicate: false,
          message: createdMessage,
        }),
      };

      const dispatchSpy = jest.fn();
      const service = new MarketplaceConversationService(prisma as never, repo as never);
      service.setBridgeDispatcher({ dispatchGuestMessage: dispatchSpy });

      const result = await service.sendGuestMessage(
        { hotelId: "hotel-1", stayId: "stay-1", sessionId: "sess-1" },
        "order-1",
        { body: "Em có mặt ở sảnh rồi ạ", clientMessageId: "client-id-1" },
      );

      expect(result.id).toBe("msg-1");
      expect(result.body).toBe("Em có mặt ở sảnh rồi ạ");
      expect(RequestRealtimeEmitter.emitMarketplaceConversationMessageCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          stayId: "stay-1",
          orderId: "order-1",
          message: expect.objectContaining({ body: "Em có mặt ở sảnh rồi ạ" }),
        }),
      );
      expect(dispatchSpy).toHaveBeenCalled();
    });

    it("attaches a rejection handler to asynchronous Telegram dispatch", async () => {
      const mockOrder = {
        id: "order-1",
        hotelId: "hotel-1",
        stayId: "stay-1",
        serviceTenantId: "tenant-1",
        assignedLocalMateProfileId: "guide-1",
        status: MarketplaceOrderStatus.ACKNOWLEDGED,
        stay: { room: { id: "room-1" }, guestSessions: [{ id: "sess-1" }] },
      };
      const createdMessage = {
        id: "msg-1",
        orderId: "order-1",
        senderType: "GUEST",
        body: "Em có mặt ở sảnh rồi ạ",
        deliveryStatus: "PENDING",
        createdAt: new Date(),
      };
      const prisma = {
        marketplaceOrder: { findUnique: jest.fn().mockResolvedValue(mockOrder) },
      };
      const repo = {
        findOrCreateConversation: jest.fn().mockResolvedValue({ id: "conv-1" }),
        appendGuestMessage: jest.fn().mockResolvedValue({
          isDuplicate: false,
          message: createdMessage,
        }),
      };
      const dispatchResult = {
        catch: jest.fn().mockReturnValue(undefined),
      } as unknown as Promise<void>;
      const service = new MarketplaceConversationService(prisma as never, repo as never);
      service.setBridgeDispatcher({ dispatchGuestMessage: () => dispatchResult });

      await service.sendGuestMessage(
        { hotelId: "hotel-1", stayId: "stay-1", sessionId: "sess-1" },
        "order-1",
        { body: "Em có mặt ở sảnh rồi ạ", clientMessageId: "client-id-1" },
      );

      expect(dispatchResult.catch).toHaveBeenCalledWith(expect.any(Function));
    });

    it("rejects sending message when order is PENDING (not yet accepted)", async () => {
      const mockOrder = {
        id: "order-1",
        hotelId: "hotel-1",
        stayId: "stay-1",
        status: MarketplaceOrderStatus.PENDING,
      };

      const prisma = {
        marketplaceOrder: {
          findUnique: jest.fn().mockResolvedValue(mockOrder),
        },
      };

      const service = new MarketplaceConversationService(prisma as never, {} as never);
      await expect(
        service.sendGuestMessage({ hotelId: "hotel-1", stayId: "stay-1" }, "order-1", {
          body: "Hello",
          clientMessageId: "cid-1",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("rejects sending message when order is in terminal status (COMPLETED/CANCELLED)", async () => {
      const mockOrder = {
        id: "order-1",
        hotelId: "hotel-1",
        stayId: "stay-1",
        status: MarketplaceOrderStatus.COMPLETED,
      };

      const prisma = {
        marketplaceOrder: {
          findUnique: jest.fn().mockResolvedValue(mockOrder),
        },
      };

      const service = new MarketplaceConversationService(prisma as never, {} as never);
      await expect(
        service.sendGuestMessage({ hotelId: "hotel-1", stayId: "stay-1" }, "order-1", {
          body: "Hello",
          clientMessageId: "cid-1",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("returns existing message on duplicate clientMessageId without re-emitting", async () => {
      const mockOrder = {
        id: "order-1",
        hotelId: "hotel-1",
        stayId: "stay-1",
        status: MarketplaceOrderStatus.ACKNOWLEDGED,
        stay: { room: { id: "room-1" }, guestSessions: [] },
      };

      const existingMessage = {
        id: "msg-existing",
        orderId: "order-1",
        senderType: "GUEST",
        body: "Em có mặt ở sảnh rồi ạ",
        clientMessageId: "client-id-1",
        deliveryStatus: "SENT",
        createdAt: new Date(),
      };

      const prisma = {
        marketplaceOrder: {
          findUnique: jest.fn().mockResolvedValue(mockOrder),
        },
      };

      const repo = {
        findOrCreateConversation: jest.fn().mockResolvedValue({ id: "conv-1" }),
        appendGuestMessage: jest.fn().mockResolvedValue({
          isDuplicate: true,
          message: existingMessage,
        }),
      };

      const service = new MarketplaceConversationService(prisma as never, repo as never);
      const result = await service.sendGuestMessage(
        { hotelId: "hotel-1", stayId: "stay-1" },
        "order-1",
        { body: "Em có mặt ở sảnh rồi ạ", clientMessageId: "client-id-1" },
      );

      expect(result.id).toBe("msg-existing");
      expect(
        RequestRealtimeEmitter.emitMarketplaceConversationMessageCreated,
      ).not.toHaveBeenCalled();
    });

    it("allows public session to send message when payment is PAID even if order is PENDING, without hotel realtime", async () => {
      const mockOrder = {
        id: "order-pub-1",
        hotelId: null,
        stayId: null,
        publicSessionId: "pub-session-1",
        serviceTenantId: "tenant-1",
        assignedLocalMateProfileId: "guide-1",
        status: MarketplaceOrderStatus.PENDING,
        payment: { status: "PAID" },
        stay: null,
      };

      const createdMessage = {
        id: "msg-pub-1",
        orderId: "order-pub-1",
        senderType: "GUEST",
        body: "Chào bạn guide!",
        clientMessageId: "pub-cid-1",
        deliveryStatus: "PENDING",
        createdAt: new Date(),
      };

      const prisma = {
        marketplaceOrder: { findUnique: jest.fn().mockResolvedValue(mockOrder) },
      };
      const repo = {
        findOrCreateConversation: jest.fn().mockResolvedValue({ id: "conv-pub-1" }),
        appendGuestMessage: jest.fn().mockResolvedValue({
          isDuplicate: false,
          message: createdMessage,
        }),
      };

      const dispatchSpy = jest.fn();
      const service = new MarketplaceConversationService(prisma as never, repo as never);
      service.setBridgeDispatcher({ dispatchGuestMessage: dispatchSpy });

      const result = await service.sendGuestMessage(
        { publicSessionId: "pub-session-1" },
        "order-pub-1",
        { body: "Chào bạn guide!", clientMessageId: "pub-cid-1" },
      );

      expect(result.id).toBe("msg-pub-1");
      expect(
        RequestRealtimeEmitter.emitMarketplaceConversationMessageCreated,
      ).not.toHaveBeenCalled();
      expect(dispatchSpy).toHaveBeenCalled();
    });

    it("rejects public session message if payment is not yet completed (CREATING)", async () => {
      const mockOrder = {
        id: "order-pub-2",
        hotelId: null,
        stayId: null,
        publicSessionId: "pub-session-1",
        serviceTenantId: "tenant-1",
        assignedLocalMateProfileId: "guide-1",
        status: MarketplaceOrderStatus.PENDING,
        payment: { status: "CREATING" },
        stay: null,
      };

      const prisma = {
        marketplaceOrder: { findUnique: jest.fn().mockResolvedValue(mockOrder) },
      };

      const service = new MarketplaceConversationService(prisma as never, {} as never);
      await expect(
        service.sendGuestMessage({ publicSessionId: "pub-session-1" }, "order-pub-2", {
          body: "Hello",
          clientMessageId: "pub-cid-2",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("throws NotFoundException if publicSessionId does not match order", async () => {
      const mockOrder = {
        id: "order-pub-1",
        hotelId: null,
        stayId: null,
        publicSessionId: "other-session",
      };

      const prisma = {
        marketplaceOrder: { findUnique: jest.fn().mockResolvedValue(mockOrder) },
      };

      const service = new MarketplaceConversationService(prisma as never, {} as never);
      await expect(
        service.sendGuestMessage({ publicSessionId: "pub-session-1" }, "order-pub-1", {
          body: "Hello",
          clientMessageId: "pub-cid-3",
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
