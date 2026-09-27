import { Body, Controller, ForbiddenException, Headers, Inject, Optional, Post } from "@nestjs/common";
import { ApiHeader } from "@nestjs/swagger";
import { timingSafeEqual } from "node:crypto";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { SkipAuthorization } from "../../../shared/decorators/skip-authorization.decorator";
import { TelegramNotificationService } from "../application/telegram-notification.service";
import { TelegramMarketplaceBridgeService } from "../application/telegram-marketplace-bridge.service";
import { TelegramUpdateSchema } from "../domain/schemas/telegram-update.schema";

export type TelegramPairingDelegate = {
  handleStartPairing: (input: {
    token: string;
    telegramUserId: string;
    telegramChatId: string;
    chatType: string;
  }) => Promise<unknown>;
};

@Controller("integrations/telegram")
export class TelegramWebhookController {
  private static pairingDelegate?: TelegramPairingDelegate;

  static setPairingDelegate(delegate: TelegramPairingDelegate | undefined) {
    this.pairingDelegate = delegate;
  }

  constructor(
    private readonly telegramNotificationService: TelegramNotificationService,
    @Optional()
    @Inject(TelegramMarketplaceBridgeService)
    private readonly bridgeService?: TelegramMarketplaceBridgeService,
  ) {}

  @Post("webhook")
  @SkipAuthorization()
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

    const parseResult = TelegramUpdateSchema.safeParse(body);
    if (!parseResult.success) {
      return { ok: true };
    }

    const update = parseResult.data;

    if (update.callback_query?.id) {
      if (update.callback_query.data?.startsWith("mo:") && this.bridgeService) {
        await this.bridgeService.handleCallbackQuery(update.callback_query);
      } else {
        await this.telegramNotificationService.handleCallback(update.callback_query as any);
      }
    }

    if (update.message?.text?.startsWith("/start ") && TelegramWebhookController.pairingDelegate) {
      const token = update.message.text.slice(7).trim();
      if (token && update.message.chat && update.message.from) {
        await TelegramWebhookController.pairingDelegate.handleStartPairing({
          token,
          telegramUserId: String(update.message.from.id),
          telegramChatId: String(update.message.chat.id),
          chatType: update.message.chat.type || "unknown",
        });
      }
    } else if (
      update.message?.text &&
      !update.message.text.startsWith("/") &&
      this.bridgeService
    ) {
      await this.bridgeService.handleInboundMessage(update.message);
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
