import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { loadAppConfig, type AppConfig } from "../../../common/config/env.config";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { StripeClient } from "../infrastructure/stripe-client";
import { MarketplaceOrderPaymentStatus, type MarketplaceOrderPayment } from "@prisma/client";
import type {
  CreateCheckoutSessionResult,
  LocalMatePaymentSummaryDto,
  RefundPaymentResult,
} from "../domain/localmate-payment.dto";

export interface CreateOrGetPaymentSessionParams {
  orderId: string;
  stayId?: string;
}

export interface RefundPaymentParams {
  paymentId?: string;
  orderId?: string;
  reason?: string;
}

@Injectable()
export class LocalMatePaymentsService {
  private readonly config: AppConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeClient: StripeClient,
    private readonly logger: AppLogger,
  ) {
    this.config = loadAppConfig();
  }

  async getPaymentByOrderId(orderId: string): Promise<MarketplaceOrderPayment | null> {
    return this.prisma.marketplaceOrderPayment.findUnique({
      where: { orderId },
    });
  }

  async getPaymentSummary(orderId: string): Promise<LocalMatePaymentSummaryDto | null> {
    const payment = await this.getPaymentByOrderId(orderId);
    if (!payment) {
      return null;
    }

    return {
      status: payment.status,
      currency: "VND",
      tourTotalAmount: payment.tourTotalAmount.toString(),
      platformFeeRateSnapshot: payment.platformFeeRateSnapshot.toString(),
      platformFeeAmount: payment.platformFeeAmount.toString(),
      guideRemainingAmount: payment.guideRemainingAmount.toString(),
      checkoutUrl: payment.checkoutUrl,
      expiresAt: payment.expiresAt ? payment.expiresAt.toISOString() : null,
    };
  }

  async createOrGetCheckoutSession(
    params: CreateOrGetPaymentSessionParams,
  ): Promise<CreateCheckoutSessionResult> {
    const payment = await this.prisma.marketplaceOrderPayment.findUnique({
      where: { orderId: params.orderId },
    });

    if (!payment) {
      throw new NotFoundException(`Payment record not found for order ${params.orderId}`);
    }

    // 0% platform fee -> NOT_REQUIRED
    if (payment.status === MarketplaceOrderPaymentStatus.NOT_REQUIRED) {
      return {
        paymentId: payment.id,
        orderId: payment.orderId,
        status: payment.status,
        checkoutUrl: null,
        expiresAt: null,
        isNewSession: false,
      };
    }

    // Terminal states never create a new session
    if (
      payment.status === MarketplaceOrderPaymentStatus.PAID ||
      payment.status === MarketplaceOrderPaymentStatus.CANCELLED ||
      payment.status === MarketplaceOrderPaymentStatus.REFUND_PENDING ||
      payment.status === MarketplaceOrderPaymentStatus.REFUNDED ||
      payment.status === MarketplaceOrderPaymentStatus.DISPUTED
    ) {
      return {
        paymentId: payment.id,
        orderId: payment.orderId,
        status: payment.status,
        checkoutUrl: payment.checkoutUrl,
        expiresAt: payment.expiresAt ? payment.expiresAt.toISOString() : null,
        isNewSession: false,
      };
    }

    // Active unexpired session check
    const now = new Date();
    if (
      payment.status === MarketplaceOrderPaymentStatus.OPEN &&
      payment.checkoutUrl &&
      payment.expiresAt &&
      payment.expiresAt > now
    ) {
      return {
        paymentId: payment.id,
        orderId: payment.orderId,
        status: payment.status,
        checkoutUrl: payment.checkoutUrl,
        expiresAt: payment.expiresAt.toISOString(),
        isNewSession: false,
      };
    }

    if (!this.config.stripe.checkoutEnabled) {
      this.logger.warn("Attempted to create Stripe Checkout Session while provider is disabled", {
        module: "localmate-payments",
        service: "LocalMatePaymentsService",
        operation: "createOrGetCheckoutSession",
        event: "STRIPE_CHECKOUT_DISABLED",
        orderId: params.orderId,
      });
      throw new ServiceUnavailableException("Stripe Checkout is currently disabled");
    }

    // Call Stripe to create a new session
    const session = await this.stripeClient.createCheckoutSession({
      paymentId: payment.id,
      orderId: payment.orderId,
      platformFeeAmount: payment.platformFeeAmount.toString(),
      checkoutAttemptId: payment.providerCheckoutSessionId ?? undefined,
    });

    const expiresAtDate = new Date(session.expires_at * 1000);

    const activated = await this.prisma.marketplaceOrderPayment.updateMany({
      where: {
        id: payment.id,
        status: payment.status,
        providerCheckoutSessionId: payment.providerCheckoutSessionId,
      },
      data: {
        status: MarketplaceOrderPaymentStatus.OPEN,
        providerCheckoutSessionId: session.id,
        checkoutUrl: session.url,
        expiresAt: expiresAtDate,
        lastProviderErrorCode: null,
      },
    });

    if (activated.count === 0) {
      const current = await this.prisma.marketplaceOrderPayment.findUnique({
        where: { id: payment.id },
      });
      if (!current) {
        await this.stripeClient.expireCheckoutSession(session.id).catch(() => undefined);
        throw new NotFoundException(`Payment ${payment.id} disappeared during Checkout creation`);
      }
      if (current.providerCheckoutSessionId !== session.id) {
        await this.stripeClient.expireCheckoutSession(session.id).catch(() => undefined);
      }
      return {
        paymentId: current.id,
        orderId: current.orderId,
        status: current.status,
        checkoutUrl: current.checkoutUrl,
        expiresAt: current.expiresAt ? current.expiresAt.toISOString() : null,
        isNewSession: false,
      };
    }

    this.logger.info("Created new Stripe Checkout Session for LocalMate payment", {
      module: "localmate-payments",
      service: "LocalMatePaymentsService",
      operation: "createOrGetCheckoutSession",
      event: "STRIPE_CHECKOUT_SESSION_CREATED",
      orderId: params.orderId,
      paymentId: payment.id,
      providerCheckoutSessionId: session.id,
      expiresAt: expiresAtDate.toISOString(),
    });

    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      status: MarketplaceOrderPaymentStatus.OPEN,
      checkoutUrl: session.url,
      expiresAt: expiresAtDate.toISOString(),
      isNewSession: true,
    };
  }

  async refundLocalMatePayment(params: RefundPaymentParams): Promise<RefundPaymentResult> {
    let payment = params.paymentId
      ? await this.prisma.marketplaceOrderPayment.findUnique({
          where: { id: params.paymentId },
        })
      : params.orderId
        ? await this.prisma.marketplaceOrderPayment.findUnique({
            where: { orderId: params.orderId },
          })
        : null;

    if (!payment) {
      throw new NotFoundException("Payment record not found for refund");
    }

    // Idempotent: already refunded
    if (payment.status === MarketplaceOrderPaymentStatus.REFUNDED) {
      return {
        paymentId: payment.id,
        orderId: payment.orderId,
        status: payment.status,
        refundedAmount: payment.refundedAmount.toString(),
        refundedAt: payment.refundedAt ? payment.refundedAt.toISOString() : null,
        alreadyRefunded: true,
      };
    }

    if (
      payment.status !== MarketplaceOrderPaymentStatus.PAID &&
      payment.status !== MarketplaceOrderPaymentStatus.REFUND_PENDING
    ) {
      throw new BadRequestException(
        `Cannot refund payment in status ${payment.status}. Only PAID payments can be refunded.`,
      );
    }

    if (!payment.providerPaymentIntentId) {
      throw new BadRequestException(
        "Missing Stripe payment intent ID. Cannot process refund without payment intent.",
      );
    }

    if (payment.status === MarketplaceOrderPaymentStatus.PAID) {
      const transitioned = await this.prisma.marketplaceOrderPayment.updateMany({
        where: { id: payment.id, status: MarketplaceOrderPaymentStatus.PAID },
        data: {
          status: MarketplaceOrderPaymentStatus.REFUND_PENDING,
          refundReasonCode: params.reason,
          refundNextAttemptAt: new Date(),
        },
      });
      if (transitioned.count === 0) {
        const current = await this.prisma.marketplaceOrderPayment.findUnique({
          where: { id: payment.id },
        });
        if (!current) throw new NotFoundException("Payment record not found for refund");
        if (current.status === MarketplaceOrderPaymentStatus.REFUNDED) {
          return {
            paymentId: current.id,
            orderId: current.orderId,
            status: current.status,
            refundedAmount: current.refundedAmount.toString(),
            refundedAt: current.refundedAt ? current.refundedAt.toISOString() : null,
            alreadyRefunded: true,
          };
        }
        if (current.status !== MarketplaceOrderPaymentStatus.REFUND_PENDING) {
          return {
            paymentId: current.id,
            orderId: current.orderId,
            status: current.status,
            refundedAmount: current.refundedAmount.toString(),
            refundedAt: current.refundedAt ? current.refundedAt.toISOString() : null,
            alreadyRefunded: false,
          };
        }
        payment = current;
      }
    }

    if (!payment.providerPaymentIntentId) {
      throw new BadRequestException(
        "Missing Stripe payment intent ID. Cannot process refund without payment intent.",
      );
    }

    const attemptNumber = (payment.refundAttemptCount ?? 0) + 1;
    const nextAttemptAt = new Date(
      Date.now() + Math.min(60, 2 ** Math.min(attemptNumber, 5)) * 60_000,
    );
    const claimed = await this.prisma.marketplaceOrderPayment.updateMany({
      where: {
        id: payment.id,
        status: MarketplaceOrderPaymentStatus.REFUND_PENDING,
        refundAttemptCount: { lt: 10 },
        OR: [{ refundNextAttemptAt: null }, { refundNextAttemptAt: { lte: new Date() } }],
      },
      data: {
        refundAttemptCount: { increment: 1 },
        refundNextAttemptAt: nextAttemptAt,
        refundReasonCode: params.reason ?? payment.refundReasonCode,
        lastProviderErrorCode: null,
      },
    });

    if (claimed.count === 0) {
      return {
        paymentId: payment.id,
        orderId: payment.orderId,
        status: MarketplaceOrderPaymentStatus.REFUND_PENDING,
        refundedAmount: payment.refundedAmount?.toString() ?? "0",
        refundedAt: payment.refundedAt?.toISOString() ?? null,
        alreadyRefunded: false,
      };
    }

    let refund;
    const refundedAmount = Math.round(Number(payment.refundedAmount ?? 0));
    const expectedAmount = Math.round(Number(payment.platformFeeAmount)) - refundedAmount;
    if (expectedAmount <= 0) {
      return {
        paymentId: payment.id,
        orderId: payment.orderId,
        status: MarketplaceOrderPaymentStatus.REFUND_PENDING,
        refundedAmount: payment.refundedAmount?.toString() ?? "0",
        refundedAt: payment.refundedAt?.toISOString() ?? null,
        alreadyRefunded: false,
      };
    }
    try {
      refund = await this.stripeClient.createRefund({
        paymentIntentId: payment.providerPaymentIntentId,
        amountVnd: String(expectedAmount),
        ...(refundedAmount > 0 ? { refundedAmountVnd: String(refundedAmount) } : {}),
        paymentId: payment.id,
        orderId: payment.orderId,
        reason: params.reason ?? payment.refundReasonCode ?? undefined,
      });
    } catch (error) {
      await this.prisma.marketplaceOrderPayment.update({
        where: { id: payment.id },
        data: { lastProviderErrorCode: "refund_request_failed" },
      });
      throw error;
    }

    if (
      refund.amount !== expectedAmount ||
      refund.currency.toLowerCase() !== "vnd" ||
      refund.payment_intent !== payment.providerPaymentIntentId
    ) {
      await this.prisma.marketplaceOrderPayment.update({
        where: { id: payment.id },
        data: { lastProviderErrorCode: "amount_or_currency_mismatch" },
      });
      throw new ServiceUnavailableException(
        "Stripe refund response did not match payment snapshot",
      );
    }

    this.logger.info("Requested Stripe refund for LocalMate payment", {
      module: "localmate-payments",
      service: "LocalMatePaymentsService",
      operation: "refundLocalMatePayment",
      event: "STRIPE_REFUND_REQUESTED",
      paymentId: payment.id,
      orderId: payment.orderId,
      providerStatus: refund.status,
    });

    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      status: MarketplaceOrderPaymentStatus.REFUND_PENDING,
      refundedAmount: payment.refundedAmount?.toString() ?? "0",
      refundedAt: payment.refundedAt?.toISOString() ?? null,
      alreadyRefunded: false,
    };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async retryPendingRefunds(): Promise<void> {
    const payments = await this.prisma.marketplaceOrderPayment.findMany({
      where: {
        status: MarketplaceOrderPaymentStatus.REFUND_PENDING,
        refundAttemptCount: { lt: 10 },
        OR: [{ refundNextAttemptAt: null }, { refundNextAttemptAt: { lte: new Date() } }],
      },
      select: { id: true },
      take: 50,
      orderBy: { updatedAt: "asc" },
    });

    for (const payment of payments) {
      await this.refundLocalMatePayment({ paymentId: payment.id }).catch((error) => {
        this.logger.warn("Failed to retry pending LocalMate refund", {
          module: "localmate-payments",
          service: "LocalMatePaymentsService",
          operation: "retryPendingRefunds",
          paymentId: payment.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  async cancelOrExpireOpenPayment(orderId: string): Promise<void> {
    const payment = await this.prisma.marketplaceOrderPayment.findUnique({
      where: { orderId },
    });

    if (!payment) return;
    if (
      payment.status === MarketplaceOrderPaymentStatus.PAID ||
      payment.status === MarketplaceOrderPaymentStatus.REFUND_PENDING
    ) {
      await this.refundLocalMatePayment({
        paymentId: payment.id,
        reason: "GUEST_CANCELLED_BEFORE_GUIDE_ACKNOWLEDGEMENT",
      });
      return;
    }

    if (payment.providerCheckoutSessionId) {
      await this.stripeClient
        .expireCheckoutSession(payment.providerCheckoutSessionId)
        .catch(() => undefined);
    }

    const cancelled = await this.prisma.marketplaceOrderPayment.updateMany({
      where: {
        id: payment.id,
        status: {
          in: [
            MarketplaceOrderPaymentStatus.CREATING,
            MarketplaceOrderPaymentStatus.OPEN,
            MarketplaceOrderPaymentStatus.EXPIRED,
            MarketplaceOrderPaymentStatus.FAILED,
          ],
        },
      },
      data: { status: MarketplaceOrderPaymentStatus.CANCELLED },
    });

    if (cancelled.count === 0) {
      const current = await this.prisma.marketplaceOrderPayment.findUnique({
        where: { id: payment.id },
      });
      if (
        current?.status === MarketplaceOrderPaymentStatus.PAID ||
        current?.status === MarketplaceOrderPaymentStatus.REFUND_PENDING
      ) {
        await this.refundLocalMatePayment({
          paymentId: current.id,
          reason: "GUEST_CANCELLED_BEFORE_GUIDE_ACKNOWLEDGEMENT",
        });
      }
    }
  }
}
