import { Body, Controller, ForbiddenException, Headers, Post } from "@nestjs/common";
import { ApiHeader } from "@nestjs/swagger";
import { timingSafeEqual } from "node:crypto";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { SkipAuthorization } from "../../../shared/decorators/skip-authorization.decorator";
import { TelegramNotificationService } from "../application/telegram-notification.service";

@SkipAuthorization()
@Controller("integrations/telegram")
export class TelegramWebhookController {
  constructor(private readonly telegramNotificationService: TelegramNotificationService) {}

  @Post("webhook")
  @ApiHeader({
    name: "X-Telegram-Bot-Api-Secret-Token",
    required: true,
    description: "Telegram webhook secret token configured via setWebhook secret_token.",
  })
  @ApiDescript("Telegram webhook endpoint for receiving updates from the Telegram Bot API")
  async handleWebhook(
    @Headers("x-telegram-bot-api-secret-token") secret: string | undefined,
    @Body() body: unknown,
  ) {
    this.assertWebhookSecret(secret);

    const update = body as {
      callback_query?: {
        id: string;
        data?: string;
        from?: { id?: number; first_name?: string; last_name?: string; username?: string };
      };
    };
    if (update.callback_query?.id) {
      await this.telegramNotificationService.handleCallback(update.callback_query);
    }

    return { ok: true };
  }

  private assertWebhookSecret(actual: string | undefined): void {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    if (!expected || !actual || !this.safeEquals(actual, expected)) {
      throw new ForbiddenException("Invalid Telegram webhook secret");
    }
  }

  private safeEquals(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);

    return (
      actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }
}
