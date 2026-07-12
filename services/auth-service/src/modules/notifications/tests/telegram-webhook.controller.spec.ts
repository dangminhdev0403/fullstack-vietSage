import { ForbiddenException } from "@nestjs/common";
import { TelegramWebhookController } from "../api/telegram-webhook.controller";
import type { TelegramNotificationService } from "../application/telegram-notification.service";

describe("TelegramWebhookController", () => {
  const originalSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  function createController() {
    const handleCallback = jest.fn();
    const service = { handleCallback } as unknown as TelegramNotificationService;

    return { controller: new TelegramWebhookController(service), handleCallback };
  }

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
    else process.env.TELEGRAM_WEBHOOK_SECRET = originalSecret;
  });

  it("rejects webhook calls without the Telegram secret header", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "expected-secret";
    const { controller, handleCallback } = createController();

    await expect(controller.handleWebhook(undefined, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(handleCallback).not.toHaveBeenCalled();
  });

  it("rejects webhook calls with the wrong Telegram secret header", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "expected-secret";
    const { controller, handleCallback } = createController();

    await expect(controller.handleWebhook("wrong-secret", {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(handleCallback).not.toHaveBeenCalled();
  });

  it("accepts webhook calls with the official Telegram secret-token header", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "expected-secret";
    const { controller, handleCallback } = createController();

    await expect(
      controller.handleWebhook("expected-secret", {
        callback_query: { id: "callback-1", data: "guest_request:confirm:req-1" },
      }),
    ).resolves.toEqual({ ok: true });

    expect(handleCallback).toHaveBeenCalledWith({
      id: "callback-1",
      data: "guest_request:confirm:req-1",
    });
  });
});
