import { Body, Controller, ForbiddenException, Param, Post } from "@nestjs/common";
import { SkipAuthorization } from "../../shared/decorators/skip-authorization.decorator";
import { TelegramNotificationService } from "./telegram-notification.service";
import { ApiDescript } from "../../shared/decorators/api-descript.decorator";

@SkipAuthorization()
@Controller("integrations/telegram")
export class TelegramWebhookController {
  constructor(private readonly telegramNotificationService: TelegramNotificationService) {}

  @Post("webhook/:secret")
  @ApiDescript("Telegram webhook endpoint for receiving updates from the Telegram Bot API")
  async handleWebhook(@Param("secret") secret: string, @Body() body: unknown) {
    if (!process.env.TELEGRAM_WEBHOOK_SECRET || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
      throw new ForbiddenException("Invalid Telegram webhook secret");
    }

    const update = body as { callback_query?: { id: string; data?: string; from?: { id?: number; first_name?: string; last_name?: string; username?: string } } };
    if (update.callback_query?.id) {
      await this.telegramNotificationService.handleCallback(update.callback_query);
    }

    return { ok: true };
  }
}
