import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { TelegramMarketplaceBridgeService } from "./telegram-marketplace-bridge.service";
import { TelegramNotificationService } from "./telegram-notification.service";
import { TelegramWebhookController } from "../api/telegram-webhook.controller";

@Injectable()
export class TelegramPollingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramPollingService.name);
  private isRunning = false;
  private offset = 0;
  private pollAbortController: AbortController | null = null;

  constructor(
    private readonly bridgeService: TelegramMarketplaceBridgeService,
    private readonly telegramNotificationService: TelegramNotificationService,
  ) {}

  async onModuleInit() {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) {
      this.logger.warn("TELEGRAM_BOT_TOKEN not configured; polling disabled");
      return;
    }

    // In production, prefer webhooks unless explicitly forced. In dev, run polling if webhook is not set.
    const forcePolling = process.env.TELEGRAM_POLLING === "true";
    const isDev = process.env.NODE_ENV !== "production";

    if (!forcePolling && !isDev) {
      this.logger.log("Production environment without TELEGRAM_POLLING=true; polling disabled");
      return;
    }

    // Verify webhook status
    try {
      const webhookInfo = await this.telegramNotificationService.callTelegram<{
        result?: { url?: string };
      }>("getWebhookInfo", {});

      if (webhookInfo?.result?.url && !forcePolling) {
        this.logger.log(
          `Telegram webhook is currently configured to: ${webhookInfo.result.url}. Polling disabled.`,
        );
        return;
      }

      this.logger.log("Starting Telegram long-polling worker for local development/realtime updates...");
      this.startPollingLoop();
    } catch (err: any) {
      this.logger.warn(`Could not check Telegram webhook info: ${err.message}`);
    }
  }

  onModuleDestroy() {
    this.isRunning = false;
    if (this.pollAbortController) {
      this.pollAbortController.abort();
    }
  }

  private startPollingLoop() {
    this.isRunning = true;
    void this.pollLoop();
  }

  private async pollLoop() {
    // Fast offset initialization
    try {
      const initRes = await this.telegramNotificationService.callTelegram<{
        result?: Array<{ update_id: number }>;
      }>("getUpdates", { offset: -1, limit: 1 });
      const last = initRes?.result?.[0];
      if (last?.update_id) {
        this.offset = last.update_id + 1;
      }
    } catch {
      // Ignore initial offset failure, proceed with 0
    }

    while (this.isRunning) {
      try {
        const body: Record<string, any> = {
          offset: this.offset,
          timeout: 15,
          allowed_updates: ["message", "callback_query"],
        };

        const res = await this.telegramNotificationService.callTelegram<{
          result?: Array<{
            update_id: number;
            callback_query?: any;
            message?: any;
          }>;
        }>("getUpdates", body);

        const updates = res?.result ?? [];
        for (const update of updates) {
          await this.processUpdate(update);
          this.offset = Math.max(this.offset, update.update_id + 1);
        }
      } catch (err: any) {
        if (!this.isRunning) break;
        const msg = err?.message || String(err);
        if (msg.includes("abort") || msg.includes("timeout")) {
          // Normal timeout on long-poll, continue
        } else {
          this.logger.warn(`Telegram poll error: ${msg}. Retrying in 3s...`);
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
    }
  }

  private async processUpdate(update: {
    update_id: number;
    callback_query?: any;
    message?: any;
  }) {
    try {
      if (update.callback_query?.id) {
        if (update.callback_query.data?.startsWith("mo:")) {
          await this.bridgeService.handleCallbackQuery(update.callback_query);
        } else {
          await this.telegramNotificationService.handleCallback(update.callback_query);
        }
      }

      const pairingDelegate = TelegramWebhookController.getPairingDelegate();
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
        } else if (pairingDelegate && update.message.chat && update.message.from) {
          try {
            const pairResult: any = await pairingDelegate.handleStartPairing({
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
          update.message.text.startsWith("/ketthuc"))
      ) {
        await this.bridgeService.handleInboundMessage(update.message);
      }
    } catch (err: any) {
      this.logger.error(`Error processing Telegram update #${update.update_id}: ${err.message}`, err.stack);
    }
  }
}
