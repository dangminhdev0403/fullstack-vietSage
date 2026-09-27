import {
  createLocalMateOrderSchema,
  createMarketplaceOrderSchema,
} from "../domain/marketplace-order.schema";
import {
  marketplaceConversationMessageSchema,
  sendMarketplaceConversationMessageSchema,
  listMarketplaceConversationMessagesQuerySchema,
} from "../domain/marketplace-conversation.schema";

describe("T0 - Marketplace Conversation & Order Schemas", () => {
  describe("createLocalMateOrderSchema", () => {
    it("validates a valid LocalMate order request", () => {
      const validPayload = {
        serviceId: "srv-localmate-123",
        quantity: 1,
        requestedStartAt: "2026-10-01T09:00:00.000Z",
        partySize: 2,
        guestNote: "Trekking tour with guide A May",
        idempotencyKey: "idem-key-localmate-001",
      };

      const result = createLocalMateOrderSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.serviceId).toBe("srv-localmate-123");
        expect(result.data.partySize).toBe(2);
        expect(result.data.quantity).toBe(1);
      }
    });

    it("rejects invalid requestedStartAt that is not ISO datetime", () => {
      const invalidPayload = {
        serviceId: "srv-123",
        quantity: 1,
        requestedStartAt: "tomorrow morning",
        partySize: 2,
        idempotencyKey: "idem-key-localmate-002",
      };

      const result = createLocalMateOrderSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it("rejects non-positive or too large partySize", () => {
      expect(
        createLocalMateOrderSchema.safeParse({
          serviceId: "srv-123",
          requestedStartAt: "2026-10-01T09:00:00.000Z",
          partySize: 0,
          idempotencyKey: "idem-key-localmate-003",
        }).success,
      ).toBe(false);

      expect(
        createLocalMateOrderSchema.safeParse({
          serviceId: "srv-123",
          requestedStartAt: "2026-10-01T09:00:00.000Z",
          partySize: 101,
          idempotencyKey: "idem-key-localmate-004",
        }).success,
      ).toBe(false);
    });
  });

  describe("createMarketplaceOrderSchema backward compatibility", () => {
    it("allows standard marketplace orders without requestedStartAt/partySize", () => {
      const standardOrder = {
        serviceId: "srv-standard-123",
        quantity: 1,
        idempotencyKey: "idem-standard-001",
      };

      const result = createMarketplaceOrderSchema.safeParse(standardOrder);
      expect(result.success).toBe(true);
    });

    it("allows standard marketplace orders with optional requestedStartAt and partySize", () => {
      const extendedOrder = {
        serviceId: "srv-standard-123",
        quantity: 1,
        requestedStartAt: "2026-10-01T14:00:00.000Z",
        partySize: 4,
        idempotencyKey: "idem-standard-002",
      };

      const result = createMarketplaceOrderSchema.safeParse(extendedOrder);
      expect(result.success).toBe(true);
    });
  });

  describe("sendMarketplaceConversationMessageSchema", () => {
    it("validates a clean guest message", () => {
      const valid = {
        body: "Xin chào anh A Mẩy, em đã chốt lịch trekking sáng mai nhé!",
        clientMessageId: "client-msg-uuid-1234",
      };

      const result = sendMarketplaceConversationMessageSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.body).toBe(valid.body);
        expect(result.data.clientMessageId).toBe(valid.clientMessageId);
      }
    });

    it("rejects empty or whitespace-only message body", () => {
      const invalid = {
        body: "   ",
        clientMessageId: "client-msg-uuid-1234",
      };

      const result = sendMarketplaceConversationMessageSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects message body exceeding 1000 characters", () => {
      const tooLong = {
        body: "a".repeat(1001),
        clientMessageId: "client-msg-uuid-1234",
      };

      const result = sendMarketplaceConversationMessageSchema.safeParse(tooLong);
      expect(result.success).toBe(false);
    });

    it("rejects missing clientMessageId for idempotency", () => {
      const missingClientMsgId = {
        body: "Hello",
      };

      const result = sendMarketplaceConversationMessageSchema.safeParse(missingClientMsgId);
      expect(result.success).toBe(false);
    });
  });

  describe("marketplaceConversationMessageSchema", () => {
    it("validates conversation message DTO", () => {
      const validDto = {
        id: "msg-123",
        orderId: "order-456",
        senderType: "GUEST",
        body: "Hello LocalMate",
        deliveryStatus: "SENT",
        createdAt: "2026-10-01T09:05:00.000Z",
      };

      const result = marketplaceConversationMessageSchema.safeParse(validDto);
      expect(result.success).toBe(true);
    });

    it("rejects unknown senderType", () => {
      const invalidSender = {
        id: "msg-123",
        orderId: "order-456",
        senderType: "UNKNOWN_ACTOR",
        body: "Hello",
        deliveryStatus: "SENT",
        createdAt: "2026-10-01T09:05:00.000Z",
      };

      const result = marketplaceConversationMessageSchema.safeParse(invalidSender);
      expect(result.success).toBe(false);
    });
  });

  describe("listMarketplaceConversationMessagesQuerySchema", () => {
    it("provides default limit of 50", () => {
      const result = listMarketplaceConversationMessagesQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
      }
    });

    it("clamps limit properly", () => {
      const result = listMarketplaceConversationMessagesQuerySchema.safeParse({
        limit: "20",
        before: "msg-cursor-999",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20);
        expect(result.data.before).toBe("msg-cursor-999");
      }
    });
  });
});
