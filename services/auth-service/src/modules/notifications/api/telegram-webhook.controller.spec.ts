import { SKIP_AUTHORIZATION_KEY } from "../../../shared/decorators/skip-authorization.decorator";
import { TelegramWebhookController } from "./telegram-webhook.controller";

describe("TelegramWebhookController authorization metadata", () => {
  it("skips authorization only on the webhook method", () => {
    expect(Reflect.getMetadata(SKIP_AUTHORIZATION_KEY, TelegramWebhookController)).toBeUndefined();
    const method = Object.getOwnPropertyDescriptor(
      TelegramWebhookController.prototype,
      "handleWebhook",
    )?.value as unknown;
    expect(Reflect.getMetadata(SKIP_AUTHORIZATION_KEY, method)).toBe(true);
  });
});
