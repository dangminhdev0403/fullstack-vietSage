import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { MarketplaceMessageDeliveryStatus, MarketplaceOrderStatus } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { TelegramMarketplaceBridgeService } from "./telegram-marketplace-bridge.service";

@Injectable()
export class TelegramMarketplaceRetryService {
  private readonly logger = new Logger(TelegramMarketplaceRetryService.name);
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bridgeService: TelegramMarketplaceBridgeService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleRetryCron(): Promise<void> {
    await this.processPendingRetries();
  }

  async processPendingRetries(): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    try {
      const now = new Date();
      // Atomic search for pending retryable messages
      const pendingMessages = await this.prisma.marketplaceConversationMessage.findMany({
        where: {
          deliveryStatus: MarketplaceMessageDeliveryStatus.FAILED,
          nextAttemptAt: { lte: now },
          attemptCount: { lt: 3 },
        },
        include: {
          conversation: {
            include: {
              order: true,
            },
          },
        },
        take: 20,
      });

      let retriedCount = 0;

      for (const message of pendingMessages) {
        const order = message.conversation?.order;
        if (!order || order.status !== MarketplaceOrderStatus.ACKNOWLEDGED) {
          // Terminal/unacknowledged order: stop retrying
          await this.prisma.marketplaceConversationMessage.update({
            where: { id: message.id },
            data: { nextAttemptAt: null },
          });
          continue;
        }

        const claimed = await this.prisma.marketplaceConversationMessage.updateMany({
          where: {
            id: message.id,
            deliveryStatus: MarketplaceMessageDeliveryStatus.FAILED,
            nextAttemptAt: { lte: now },
            attemptCount: { lt: 3 },
          },
          data: {
            nextAttemptAt: new Date(Date.now() + 120 * 1000),
          },
        });
        if (claimed.count !== 1) continue;

        await this.bridgeService.sendGuestMessageToGuide({
          message,
          order,
          conversation: message.conversation,
        });

        retriedCount++;
      }

      return retriedCount;
    } catch (error) {
      this.logger.error("Error processing pending Telegram message retries", error);
      return 0;
    } finally {
      this.isProcessing = false;
    }
  }
}
