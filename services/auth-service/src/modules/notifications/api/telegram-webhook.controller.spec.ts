import { ForbiddenException } from "@nestjs/common";
import { SKIP_AUTHORIZATION_KEY } from "../../../shared/decorators/skip-authorization.decorator";
import { TelegramWebhookController } from "./telegram-webhook.controller";

describe("TelegramWebhookController", () => {
  const secret = "test-secret-1234567890";
  let controller: TelegramWebhookController;
  let mockNotificationService: any;
  let mockBridgeService: any;

  beforeEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = secret;
    mockNotificationService = {
      handleCallback: jest.fn().mockResolvedValue(undefined),
      callTelegram: jest.fn().mockResolvedValue(undefined),
    };
    mockBridgeService = {
      handleCallbackQuery: jest.fn().mockResolvedValue(undefined),
      handleInboundMessage: jest.fn().mockResolvedValue(undefined),
    };
    controller = new TelegramWebhookController(mockNotificationService, mockBridgeService);
    TelegramWebhookController.setPairingDelegate(undefined);
  });

  afterEach(() => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
  });

  describe("metadata", () => {
    it("skips authorization only on the webhook method", () => {
      expect(
        Reflect.getMetadata(SKIP_AUTHORIZATION_KEY, TelegramWebhookController),
      ).toBeUndefined();
      const method = Object.getOwnPropertyDescriptor(
        TelegramWebhookController.prototype,
        "handleWebhook",
      )?.value;
      expect(Reflect.getMetadata(SKIP_AUTHORIZATION_KEY, method)).toBe(true);
    });
  });

  describe("secret validation", () => {
    it("throws ForbiddenException when secret does not match", async () => {
      await expect(controller.handleWebhook("wrong-secret", {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("throws ForbiddenException when secret header is missing", async () => {
      await expect(controller.handleWebhook(undefined, {})).rejects.toThrow(ForbiddenException);
    });
  });

  describe("routing", () => {
    it("routes mo: callback queries to bridge service", async () => {
      const body = {
        update_id: 1,
        callback_query: {
          id: "cb_mo_1",
          data: "mo:a:ord_123",
          from: { id: 12345 },
        },
      };

      const result = await controller.handleWebhook(secret, body);

      expect(result).toEqual({ ok: true });
      expect(mockBridgeService.handleCallbackQuery).toHaveBeenCalledWith(body.callback_query);
      expect(mockNotificationService.handleCallback).not.toHaveBeenCalled();
    });

    it("routes non-mo callback queries to telegramNotificationService (GuestRequest callbacks intact)", async () => {
      const body = {
        update_id: 2,
        callback_query: {
          id: "cb_gr_1",
          data: "gr:c:req_456",
          from: { id: 54321 },
        },
      };

      const result = await controller.handleWebhook(secret, body);

      expect(result).toEqual({ ok: true });
      expect(mockNotificationService.handleCallback).toHaveBeenCalledWith(body.callback_query);
      expect(mockBridgeService.handleCallbackQuery).not.toHaveBeenCalled();
    });

    it("routes /start <token> messages to pairing delegate", async () => {
      const mockPairingDelegate = {
        handleStartPairing: jest.fn().mockResolvedValue(undefined),
      };
      TelegramWebhookController.setPairingDelegate(mockPairingDelegate);

      const body = {
        update_id: 3,
        message: {
          message_id: 10,
          text: "/start valid_token_123",
          chat: { id: 8888, type: "private" },
          from: { id: 9999 },
        },
      };

      const result = await controller.handleWebhook(secret, body);

      expect(result).toEqual({ ok: true });
      expect(mockPairingDelegate.handleStartPairing).toHaveBeenCalledWith({
        token: "valid_token_123",
        telegramUserId: "9999",
        telegramChatId: "8888",
        chatType: "private",
      });
      expect(mockBridgeService.handleInboundMessage).not.toHaveBeenCalled();
    });

    it("routes private non-command messages to bridgeService", async () => {
      const body = {
        update_id: 4,
        message: {
          message_id: 11,
          text: "Tôi sẽ tới trong 15 phút nữa",
          chat: { id: 8888, type: "private" },
          from: { id: 9999 },
        },
      };

      const result = await controller.handleWebhook(secret, body);

      expect(result).toEqual({ ok: true });
      expect(mockBridgeService.handleInboundMessage).toHaveBeenCalledWith(body.message);
    });
  });
});
