import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  MarketplaceGuideNotificationStatus,
  MarketplaceOrderPaymentStatus,
  MarketplaceOrderStatus,
} from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { TelegramMarketplaceBridgeService } from "./telegram-marketplace-bridge.service";

export const NOTIFICATION_LEASE_MS = 60 * 1000; // 60s finite lease
export const BASE_BACKOFF_MS = 10 * 1000; // 10s base backoff
export const MAX_BACKOFF_MS = 300 * 1000; // 5m max backoff
export const MAX_NOTIFICATION_ATTEMPTS = 5;

export const ALLOWLISTED_NOTIFICATION_ERROR_CODES = {
  PRE_PAYMENT_BLOCKED: "PRE_PAYMENT_BLOCKED",
  PAYMENT_NOT_READY: "PAYMENT_NOT_READY",
  PAYMENT_TERMINAL_UNPAID: "PAYMENT_TERMINAL_UNPAID",
  ORDER_NOT_PENDING: "ORDER_NOT_PENDING",
  NO_ASSIGNED_LOCALMATE: "NO_ASSIGNED_LOCALMATE",
  NO_ACTIVE_TELEGRAM_BINDING: "NO_ACTIVE_TELEGRAM_BINDING",
  TELEGRAM_BOT_BLOCKED: "TELEGRAM_BOT_BLOCKED",
  TELEGRAM_SEND_FAILED: "TELEGRAM_SEND_FAILED",
  MAX_ATTEMPTS_EXCEEDED: "MAX_ATTEMPTS_EXCEEDED",
} as const;

export type AllowlistedNotificationErrorCode =
  (typeof ALLOWLISTED_NOTIFICATION_ERROR_CODES)[keyof typeof ALLOWLISTED_NOTIFICATION_ERROR_CODES];

@Injectable()
export class LocalmatePaidOrderNotificationService {
  private readonly logger = new Logger(LocalmatePaidOrderNotificationService.name);
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bridgeService: TelegramMarketplaceBridgeService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron(): Promise<void> {
    await this.processPendingNotifications();
  }

  /**
   * Atomically claim a due notification row using conditional updateMany.
   * Ensures multi-worker concurrency safety and lease recovery.
   */
  async claimNotification(
    paymentId: string,
    now: Date = new Date(),
    leaseMs: number = NOTIFICATION_LEASE_MS,
  ): Promise<boolean> {
    const leaseUntil = new Date(now.getTime() + leaseMs);

    const result = await this.prisma.marketplaceOrderPayment.updateMany({
      where: {
        id: paymentId,
        status: {
          in: [MarketplaceOrderPaymentStatus.PAID, MarketplaceOrderPaymentStatus.NOT_REQUIRED],
        },
        OR: [
          {
            guideNotificationStatus: MarketplaceGuideNotificationStatus.PENDING,
            OR: [{ notificationNextAttemptAt: null }, { notificationNextAttemptAt: { lte: now } }],
          },
          {
            guideNotificationStatus: MarketplaceGuideNotificationStatus.FAILED,
            notificationNextAttemptAt: { lte: now, not: null },
          },
          {
            guideNotificationStatus: MarketplaceGuideNotificationStatus.SENDING,
            notificationLeaseUntil: { lt: now }, // Lease expired, recovery
          },
        ],
      },
      data: {
        guideNotificationStatus: MarketplaceGuideNotificationStatus.SENDING,
        notificationLeaseUntil: leaseUntil,
      },
    });

    return result.count === 1;
  }

  /**
   * Executes dispatch for an already-claimed payment notification row.
   * Performs secondary eligibility checks, calls bridge, and updates DB status.
   */
  async executeClaimedNotification(
    paymentId: string,
    _now: Date = new Date(),
  ): Promise<{ success: boolean; errorCode?: string; isTerminal?: boolean }> {
    const payment = await this.prisma.marketplaceOrderPayment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          include: {
            stay: {
              select: {
                guestDisplayName: true,
                room: { select: { roomNumber: true } },
              },
            },
          },
        },
      },
    });

    if (!payment) {
      return {
        success: false,
        errorCode: ALLOWLISTED_NOTIFICATION_ERROR_CODES.PAYMENT_NOT_READY,
        isTerminal: true,
      };
    }

    // 1. Recheck payment eligibility
    const isPaymentEligible =
      payment.status === MarketplaceOrderPaymentStatus.PAID ||
      payment.status === MarketplaceOrderPaymentStatus.NOT_REQUIRED;

    if (!isPaymentEligible) {
      await this.prisma.marketplaceOrderPayment.update({
        where: { id: paymentId },
        data: {
          guideNotificationStatus: MarketplaceGuideNotificationStatus.BLOCKED,
          notificationLeaseUntil: null,
          notificationNextAttemptAt: null,
          lastProviderErrorCode: ALLOWLISTED_NOTIFICATION_ERROR_CODES.PAYMENT_NOT_READY,
        },
      });
      return {
        success: false,
        errorCode: ALLOWLISTED_NOTIFICATION_ERROR_CODES.PAYMENT_NOT_READY,
        isTerminal: true,
      };
    }

    // 2. Recheck order status: must remain PENDING
    const order = payment.order;
    if (!order || order.status !== MarketplaceOrderStatus.PENDING) {
      await this.prisma.marketplaceOrderPayment.update({
        where: { id: paymentId },
        data: {
          guideNotificationStatus: MarketplaceGuideNotificationStatus.BLOCKED,
          notificationLeaseUntil: null,
          notificationNextAttemptAt: null,
          lastProviderErrorCode: ALLOWLISTED_NOTIFICATION_ERROR_CODES.ORDER_NOT_PENDING,
        },
      });
      return {
        success: false,
        errorCode: ALLOWLISTED_NOTIFICATION_ERROR_CODES.ORDER_NOT_PENDING,
        isTerminal: true,
      };
    }

    // 3. Recheck assigned LocalMate
    if (!order.assignedLocalMateProfileId) {
      await this.prisma.marketplaceOrderPayment.update({
        where: { id: paymentId },
        data: {
          guideNotificationStatus: MarketplaceGuideNotificationStatus.BLOCKED,
          notificationLeaseUntil: null,
          notificationNextAttemptAt: null,
          lastProviderErrorCode: ALLOWLISTED_NOTIFICATION_ERROR_CODES.NO_ASSIGNED_LOCALMATE,
        },
      });
      return {
        success: false,
        errorCode: ALLOWLISTED_NOTIFICATION_ERROR_CODES.NO_ASSIGNED_LOCALMATE,
        isTerminal: true,
      };
    }

    // 4. Recheck active Telegram binding
    const binding = await this.prisma.localMateTelegramBinding.findFirst({
      where: {
        localMateProfileId: order.assignedLocalMateProfileId,
        revokedAt: null,
        blockedAt: null,
      },
    });

    if (!binding) {
      await this.prisma.marketplaceOrderPayment.update({
        where: { id: paymentId },
        data: {
          guideNotificationStatus: MarketplaceGuideNotificationStatus.BLOCKED,
          notificationLeaseUntil: null,
          notificationNextAttemptAt: null,
          lastProviderErrorCode: ALLOWLISTED_NOTIFICATION_ERROR_CODES.NO_ACTIVE_TELEGRAM_BINDING,
        },
      });
      return {
        success: false,
        errorCode: ALLOWLISTED_NOTIFICATION_ERROR_CODES.NO_ACTIVE_TELEGRAM_BINDING,
        isTerminal: true,
      };
    }

    // 5. Send order notification via bridge
    try {
      const orderPayload = {
        ...order,
        payment: {
          tourTotalAmount: payment.tourTotalAmount,
          platformFeeRateSnapshot: payment.platformFeeRateSnapshot,
          platformFeeAmount: payment.platformFeeAmount,
          guideRemainingAmount: payment.guideRemainingAmount,
          currency: payment.currency,
          status: payment.status,
        },
      };

      const bridgeResult = await this.bridgeService.sendOrderNotificationToGuide(orderPayload);

      if (bridgeResult?.success) {
        await this.prisma.marketplaceOrderPayment.update({
          where: { id: paymentId },
          data: {
            guideNotificationStatus: MarketplaceGuideNotificationStatus.SENT,
            notificationSentAt: new Date(),
            notificationLeaseUntil: null,
            notificationNextAttemptAt: null,
            lastProviderErrorCode: null,
          },
        });
        return { success: true };
      }

      if (bridgeResult?.isTerminal) {
        await this.prisma.marketplaceOrderPayment.update({
          where: { id: paymentId },
          data: {
            guideNotificationStatus: MarketplaceGuideNotificationStatus.BLOCKED,
            notificationLeaseUntil: null,
            notificationNextAttemptAt: null,
            lastProviderErrorCode:
              bridgeResult.errorCode ?? ALLOWLISTED_NOTIFICATION_ERROR_CODES.TELEGRAM_BOT_BLOCKED,
          },
        });
        return {
          success: false,
          isTerminal: true,
          errorCode:
            bridgeResult.errorCode ?? ALLOWLISTED_NOTIFICATION_ERROR_CODES.TELEGRAM_BOT_BLOCKED,
        };
      }

      return await this.handleTransientFailure(payment, bridgeResult?.errorCode);
    } catch {
      return await this.handleTransientFailure(
        payment,
        ALLOWLISTED_NOTIFICATION_ERROR_CODES.TELEGRAM_SEND_FAILED,
      );
    }
  }

  /**
   * Schedules bounded retry or marks terminal failure if max attempts reached.
   */
  private async handleTransientFailure(
    payment: { id: string; notificationAttemptCount: number },
    errorCode: string = ALLOWLISTED_NOTIFICATION_ERROR_CODES.TELEGRAM_SEND_FAILED,
  ): Promise<{ success: boolean; isTerminal: boolean; errorCode: string }> {
    const attempts = (payment.notificationAttemptCount ?? 0) + 1;

    if (attempts >= MAX_NOTIFICATION_ATTEMPTS) {
      await this.prisma.marketplaceOrderPayment.update({
        where: { id: payment.id },
        data: {
          guideNotificationStatus: MarketplaceGuideNotificationStatus.BLOCKED,
          notificationAttemptCount: attempts,
          notificationLeaseUntil: null,
          notificationNextAttemptAt: null,
          lastProviderErrorCode: ALLOWLISTED_NOTIFICATION_ERROR_CODES.MAX_ATTEMPTS_EXCEEDED,
        },
      });
      return {
        success: false,
        isTerminal: true,
        errorCode: ALLOWLISTED_NOTIFICATION_ERROR_CODES.MAX_ATTEMPTS_EXCEEDED,
      };
    }

    const backoffMs = Math.min(
      MAX_BACKOFF_MS,
      BASE_BACKOFF_MS * Math.pow(2, Math.max(0, attempts - 1)),
    );
    const nextAttemptAt = new Date(Date.now() + backoffMs);

    await this.prisma.marketplaceOrderPayment.update({
      where: { id: payment.id },
      data: {
        guideNotificationStatus: MarketplaceGuideNotificationStatus.FAILED,
        notificationAttemptCount: attempts,
        notificationLeaseUntil: null,
        notificationNextAttemptAt: nextAttemptAt,
        lastProviderErrorCode: errorCode,
      },
    });

    return {
      success: false,
      isTerminal: false,
      errorCode,
    };
  }

  /**
   * Main worker tick: queries due payments, claims them atomically, and processes them.
   */
  async processPendingNotifications(
    limit = 10,
    now: Date = new Date(),
  ): Promise<{ processed: number; sent: number; failed: number }> {
    if (this.isProcessing) {
      return { processed: 0, sent: 0, failed: 0 };
    }
    this.isProcessing = true;

    let processed = 0;
    let sent = 0;
    let failed = 0;

    try {
      const candidates = await this.prisma.marketplaceOrderPayment.findMany({
        where: {
          status: {
            in: [MarketplaceOrderPaymentStatus.PAID, MarketplaceOrderPaymentStatus.NOT_REQUIRED],
          },
          OR: [
            {
              guideNotificationStatus: MarketplaceGuideNotificationStatus.PENDING,
              OR: [
                { notificationNextAttemptAt: null },
                { notificationNextAttemptAt: { lte: now } },
              ],
            },
            {
              guideNotificationStatus: MarketplaceGuideNotificationStatus.FAILED,
              notificationNextAttemptAt: { lte: now, not: null },
            },
            {
              guideNotificationStatus: MarketplaceGuideNotificationStatus.SENDING,
              notificationLeaseUntil: { lt: now },
            },
          ],
        },
        take: limit,
        orderBy: { createdAt: "asc" },
      });

      for (const candidate of candidates) {
        processed++;
        const claimed = await this.claimNotification(candidate.id, now);
        if (!claimed) {
          continue; // Lost race to another worker
        }

        const dispatchResult = await this.executeClaimedNotification(candidate.id, now);
        if (dispatchResult.success) {
          sent++;
        } else {
          failed++;
        }
      }

      return { processed, sent, failed };
    } catch (error) {
      this.logger.error("Error in processPendingNotifications", error);
      return { processed, sent, failed };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Targeted dispatch for a specific order when payment is authoritatively confirmed.
   */
  async dispatchPaidOrderNotification(
    orderId: string,
    now: Date = new Date(),
  ): Promise<{ success: boolean; status: MarketplaceGuideNotificationStatus; reason?: string }> {
    const payment = await this.prisma.marketplaceOrderPayment.findUnique({
      where: { orderId },
    });

    if (!payment) {
      return {
        success: false,
        status: MarketplaceGuideNotificationStatus.BLOCKED,
        reason: "Payment record not found",
      };
    }

    if (
      payment.status !== MarketplaceOrderPaymentStatus.PAID &&
      payment.status !== MarketplaceOrderPaymentStatus.NOT_REQUIRED
    ) {
      return {
        success: false,
        status: payment.guideNotificationStatus,
        reason: ALLOWLISTED_NOTIFICATION_ERROR_CODES.PRE_PAYMENT_BLOCKED,
      };
    }

    const claimed = await this.claimNotification(payment.id, now);
    if (!claimed) {
      return {
        success: false,
        status: payment.guideNotificationStatus,
        reason: "Concurrent claim in progress or already claimed",
      };
    }

    const result = await this.executeClaimedNotification(payment.id, now);
    return {
      success: result.success,
      status: result.success
        ? MarketplaceGuideNotificationStatus.SENT
        : result.isTerminal
          ? MarketplaceGuideNotificationStatus.BLOCKED
          : MarketplaceGuideNotificationStatus.FAILED,
      reason: result.errorCode,
    };
  }
}
