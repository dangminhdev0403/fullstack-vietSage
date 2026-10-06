import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Inject,
  Optional,
  Post,
} from "@nestjs/common";
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

  static getPairingDelegate(): TelegramPairingDelegate | undefined {
    return this.pairingDelegate;
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
        await this.telegramNotificationService.handleCallback(update.callback_query);
      }
    }

    if (update.message?.text?.startsWith("/start")) {
      const textParts = update.message.text.trim().split(/\s+/);
      const token = textParts.length > 1 ? textParts[1].trim() : "";

      if (!token) {
        await this.telegramNotificationService
          .callTelegram("sendMessage", {
            chat_id: update.message.chat.id,
            text: "👋 <b>Xin chào! Đây là VietSage LocalMate Bot.</b>\n\nĐể kết nối tài khoản Hướng dẫn viên, vui lòng vào hệ thống VietSage > <b>Quản lý LocalMate</b> > chọn <b>Kết nối Telegram</b> để lấy liên kết hoặc mã kích hoạt.",
            parse_mode: "HTML",
          })
          .catch(() => {});
      } else if (TelegramWebhookController.pairingDelegate && update.message.chat && update.message.from) {
        try {
          const pairResult: any = await TelegramWebhookController.pairingDelegate.handleStartPairing({
            token,
            telegramUserId: String(update.message.from.id),
            telegramChatId: String(update.message.chat.id),
            chatType: update.message.chat.type || "unknown",
          });
          await this.telegramNotificationService
            .callTelegram("sendMessage", {
              chat_id: update.message.chat.id,
              text: `🎉 <b>Kết nối thành công!</b>\n\nChào mừng Hướng dẫn viên <b>${pairResult?.fullName || "LocalMate"}</b>. Kể từ bây giờ, các đơn đặt tour được chỉ định sẽ gửi thông báo trực tiếp về đây để bạn tiếp nhận và trò chuyện cùng khách hàng.`,
              parse_mode: "HTML",
            })
            .catch(() => {});
        } catch (err: any) {
          const errMsg = err?.message || "Mã kết nối không hợp lệ hoặc đã hết hạn.";
          await this.telegramNotificationService
            .callTelegram("sendMessage", {
              chat_id: update.message.chat.id,
              text: `⚠️ <b>Kết nối không thành công:</b> ${errMsg}\n\nVui lòng tạo mã kết nối mới trên hệ thống VietSage.`,
              parse_mode: "HTML",
            })
            .catch(() => {});
        }
      }
    } else if (
      update.message?.text &&
      (!update.message.text.startsWith("/") ||
        update.message.text.startsWith("/end") ||
        update.message.text.startsWith("/done") ||
        update.message.text.startsWith("/ketthuc")) &&
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
