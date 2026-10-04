import {
  BadRequestException,
  Injectable,
} from "@nestjs/common";
import { loadAppConfig, type AppConfig } from "../../../common/config/env.config";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { StripeSignatureVerifier } from "../infrastructure/stripe-signature.verifier";
import {
  MarketplacePaymentEventOutcome,
  MarketplaceOrderPaymentStatus,
  MarketplaceGuideNotificationStatus,
  MarketplacePaymentProvider,
  type MarketplaceOrderPayment,
} from "@prisma/client";
import type { WebhookProcessingResult } from "../domain/localmate-payment.dto";

@Injectable()
export class StripeWebhookService {
  private readonly config: AppConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly signatureVerifier: StripeSignatureVerifier,
    private readonly logger: AppLogger,
  ) {
    this.config = loadAppConfig();
  }

  async handleWebhook(
    rawBody: Buffer | string,
    signatureHeader?: string | null,
  ): Promise<WebhookProcessingResult> {
    const webhookSecret = this.config.stripe.webhookSecret;
    if (!webhookSecret) {
      throw new BadRequestException("Stripe webhook secret is not configured");
    }

    this.signatureVerifier.verify({
      rawBody,
      signatureHeader,
      secret: webhookSecret,
    });

    const bodyString = Buffer.isBuffer(rawBody)
      ? rawBody.toString("utf8")
      : String(rawBody);

    let event: any;
    try {
      event = JSON.parse(bodyString);
    } catch {
      throw new BadRequestException("Malformed JSON payload in Stripe webhook");
    }

    const eventId = event?.id;
    const eventType = event?.type;
    const eventObject = event?.data?.object;

    if (!eventId || typeof eventId !== "string" || !eventType || typeof eventType !== "string") {
      throw new BadRequestException("Invalid Stripe event structure");
    }

    // Idempotency check: see if event has already been recorded
    const existingEvent = await this.prisma.marketplacePaymentProviderEvent.findUnique({
      where: { providerEventId: eventId },
    });

    if (existingEvent) {
      this.logger.info("Duplicate Stripe event ignored", {
        module: "localmate-payments",
        service: "StripeWebhookService",
        operation: "handleWebhook",
        event: "STRIPE_WEBHOOK_DUPLICATE_IGNORED",
        providerEventId: eventId,
        eventType,
      });
      return {
        received: true,
        duplicate: true,
        outcome: existingEvent.outcome,
      };
    }

    switch (eventType) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        return this.handleCheckoutSessionPaid(eventId, eventType, eventObject);

      case "checkout.session.async_payment_failed":
        return this.handleCheckoutSessionFailed(eventId, eventType, eventObject);

      case "checkout.session.expired":
        return this.handleCheckoutSessionExpired(eventId, eventType, eventObject);

      case "charge.refunded":
        return this.handleChargeRefunded(eventId, eventType, eventObject);

      case "charge.dispute.created":
        return this.handleChargeDisputeCreated(eventId, eventType, eventObject);

      default:
        await this.prisma.marketplacePaymentProviderEvent.create({
          data: {
            provider: MarketplacePaymentProvider.STRIPE,
            providerEventId: eventId,
            eventType,
            outcome: MarketplacePaymentEventOutcome.IGNORED,
          },
        });
        return { received: true, outcome: MarketplacePaymentEventOutcome.IGNORED };
    }
  }

  private async findPaymentForSession(session: any): Promise<MarketplaceOrderPayment | null> {
    const paymentId = session?.metadata?.paymentId;
    if (paymentId && typeof paymentId === "string") {
      const byId = await this.prisma.marketplaceOrderPayment.findUnique({
        where: { id: paymentId },
      });
      if (byId) return byId;
    }

    const sessionId = session?.id;
    if (sessionId && typeof sessionId === "string") {
      const bySession = await this.prisma.marketplaceOrderPayment.findUnique({
        where: { providerCheckoutSessionId: sessionId },
      });
      if (bySession) return bySession;
    }

    const orderId = session?.client_reference_id ?? session?.metadata?.orderId;
    if (orderId && typeof orderId === "string") {
      const byOrder = await this.prisma.marketplaceOrderPayment.findUnique({
        where: { orderId },
      });
      if (byOrder) return byOrder;
    }

    return null;
  }

  private async handleCheckoutSessionPaid(
    eventId: string,
    eventType: string,
    session: any,
  ): Promise<WebhookProcessingResult> {
    const payment = await this.findPaymentForSession(session);

    if (!payment) {
      await this.prisma.marketplacePaymentProviderEvent.create({
        data: {
          provider: MarketplacePaymentProvider.STRIPE,
          providerEventId: eventId,
          eventType,
          outcome: MarketplacePaymentEventOutcome.REJECTED,
        },
      });
      return { received: true, outcome: MarketplacePaymentEventOutcome.REJECTED, reason: "payment_not_found" };
    }

    // Money & metadata validation:
    // Only payment_status === "paid" transitions to PAID
    const isPaidStatus = session?.payment_status === "paid";
    const sessionCurrency = String(session?.currency || "").toLowerCase();
    const expectedCurrency = payment.currency.toLowerCase();
    const sessionAmount = Number(session?.amount_total);
    const expectedAmount = Math.round(Number(payment.platformFeeAmount));
    const clientRefId = session?.client_reference_id;

    const hasCurrencyMismatch = sessionCurrency !== expectedCurrency;
    const hasAmountMismatch = Number.isNaN(sessionAmount) || sessionAmount !== expectedAmount;
    const hasOrderMismatch = Boolean(clientRefId && clientRefId !== payment.orderId);

    if (!isPaidStatus || hasCurrencyMismatch || hasAmountMismatch || hasOrderMismatch) {
      this.logger.warn("Stripe Checkout Session validation failed (mismatch or unpaid status)", {
        module: "localmate-payments",
        service: "StripeWebhookService",
        operation: "handleCheckoutSessionPaid",
        event: "STRIPE_CHECKOUT_VALIDATION_FAILED",
        providerEventId: eventId,
        paymentId: payment.id,
        isPaidStatus,
        hasCurrencyMismatch,
        hasAmountMismatch,
        hasOrderMismatch,
      });

      await this.prisma.$transaction(async (tx) => {
        await tx.marketplaceOrderPayment.update({
          where: { id: payment.id },
          data: {
            lastProviderErrorCode: "amount_or_currency_mismatch",
          },
        });
        await tx.marketplacePaymentProviderEvent.create({
          data: {
            provider: MarketplacePaymentProvider.STRIPE,
            providerEventId: eventId,
            eventType,
            paymentId: payment.id,
            outcome: MarketplacePaymentEventOutcome.REJECTED,
          },
        });
      });

      return {
        received: true,
        outcome: MarketplacePaymentEventOutcome.REJECTED,
        reason: "amount_or_currency_mismatch",
      };
    }

    // Success path: idempotent update in transaction
    await this.prisma.$transaction(async (tx) => {
      // Re-fetch inside transaction for race protection
      const current = await tx.marketplaceOrderPayment.findUniqueOrThrow({
        where: { id: payment.id },
      });

      // If already PAID or REFUNDED, don't overwrite paidAt or regress status
      const paymentIntentId =
        typeof session?.payment_intent === "string"
          ? session.payment_intent
          : current.providerPaymentIntentId;

      if (
        current.status !== MarketplaceOrderPaymentStatus.PAID &&
        current.status !== MarketplaceOrderPaymentStatus.REFUNDED
      ) {
        await tx.marketplaceOrderPayment.update({
          where: { id: payment.id },
          data: {
            status: MarketplaceOrderPaymentStatus.PAID,
            paidAt: current.paidAt ?? new Date(),
            providerPaymentIntentId: paymentIntentId,
            guideNotificationStatus: MarketplaceGuideNotificationStatus.PENDING,
            lastProviderErrorCode: null,
          },
        });
      }

      await tx.marketplacePaymentProviderEvent.create({
        data: {
          provider: MarketplacePaymentProvider.STRIPE,
          providerEventId: eventId,
          eventType,
          paymentId: payment.id,
          outcome: MarketplacePaymentEventOutcome.PROCESSED,
        },
      });
    });

    return { received: true, outcome: MarketplacePaymentEventOutcome.PROCESSED };
  }

  private async handleCheckoutSessionFailed(
    eventId: string,
    eventType: string,
    session: any,
  ): Promise<WebhookProcessingResult> {
    const payment = await this.findPaymentForSession(session);
    if (!payment) {
      await this.prisma.marketplacePaymentProviderEvent.create({
        data: {
          provider: MarketplacePaymentProvider.STRIPE,
          providerEventId: eventId,
          eventType,
          outcome: MarketplacePaymentEventOutcome.IGNORED,
        },
      });
      return { received: true, outcome: MarketplacePaymentEventOutcome.IGNORED };
    }

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.marketplaceOrderPayment.findUniqueOrThrow({
        where: { id: payment.id },
      });

      // Do not regress terminal success states (PAID, REFUNDED)
      if (
        current.status !== MarketplaceOrderPaymentStatus.PAID &&
        current.status !== MarketplaceOrderPaymentStatus.REFUNDED
      ) {
        await tx.marketplaceOrderPayment.update({
          where: { id: payment.id },
          data: {
            status: MarketplaceOrderPaymentStatus.FAILED,
            lastProviderErrorCode: "payment_failed",
          },
        });
      }

      await tx.marketplacePaymentProviderEvent.create({
        data: {
          provider: MarketplacePaymentProvider.STRIPE,
          providerEventId: eventId,
          eventType,
          paymentId: payment.id,
          outcome: MarketplacePaymentEventOutcome.PROCESSED,
        },
      });
    });

    return { received: true, outcome: MarketplacePaymentEventOutcome.PROCESSED };
  }

  private async handleCheckoutSessionExpired(
    eventId: string,
    eventType: string,
    session: any,
  ): Promise<WebhookProcessingResult> {
    const payment = await this.findPaymentForSession(session);
    if (!payment) {
      await this.prisma.marketplacePaymentProviderEvent.create({
        data: {
          provider: MarketplacePaymentProvider.STRIPE,
          providerEventId: eventId,
          eventType,
          outcome: MarketplacePaymentEventOutcome.IGNORED,
        },
      });
      return { received: true, outcome: MarketplacePaymentEventOutcome.IGNORED };
    }

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.marketplaceOrderPayment.findUniqueOrThrow({
        where: { id: payment.id },
      });

      // Only expire if currently OPEN or CREATING
      if (
        current.status === MarketplaceOrderPaymentStatus.OPEN ||
        current.status === MarketplaceOrderPaymentStatus.CREATING
      ) {
        await tx.marketplaceOrderPayment.update({
          where: { id: payment.id },
          data: {
            status: MarketplaceOrderPaymentStatus.EXPIRED,
          },
        });
      }

      await tx.marketplacePaymentProviderEvent.create({
        data: {
          provider: MarketplacePaymentProvider.STRIPE,
          providerEventId: eventId,
          eventType,
          paymentId: payment.id,
          outcome: MarketplacePaymentEventOutcome.PROCESSED,
        },
      });
    });

    return { received: true, outcome: MarketplacePaymentEventOutcome.PROCESSED };
  }

  private async handleChargeRefunded(
    eventId: string,
    eventType: string,
    charge: any,
  ): Promise<WebhookProcessingResult> {
    const paymentIntentId = charge?.payment_intent;
    const payment = paymentIntentId
      ? await this.prisma.marketplaceOrderPayment.findUnique({
          where: { providerPaymentIntentId: paymentIntentId },
        })
      : null;

    if (!payment) {
      await this.prisma.marketplacePaymentProviderEvent.create({
        data: {
          provider: MarketplacePaymentProvider.STRIPE,
          providerEventId: eventId,
          eventType,
          outcome: MarketplacePaymentEventOutcome.IGNORED,
        },
      });
      return { received: true, outcome: MarketplacePaymentEventOutcome.IGNORED };
    }

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.marketplaceOrderPayment.findUniqueOrThrow({
        where: { id: payment.id },
      });

      if (current.status !== MarketplaceOrderPaymentStatus.REFUNDED) {
        await tx.marketplaceOrderPayment.update({
          where: { id: payment.id },
          data: {
            status: MarketplaceOrderPaymentStatus.REFUNDED,
            refundedAmount: current.platformFeeAmount,
            refundedAt: current.refundedAt ?? new Date(),
          },
        });
      }

      await tx.marketplacePaymentProviderEvent.create({
        data: {
          provider: MarketplacePaymentProvider.STRIPE,
          providerEventId: eventId,
          eventType,
          paymentId: payment.id,
          outcome: MarketplacePaymentEventOutcome.PROCESSED,
        },
      });
    });

    return { received: true, outcome: MarketplacePaymentEventOutcome.PROCESSED };
  }

  private async handleChargeDisputeCreated(
    eventId: string,
    eventType: string,
    dispute: any,
  ): Promise<WebhookProcessingResult> {
    const paymentIntentId = dispute?.payment_intent;
    const payment = paymentIntentId
      ? await this.prisma.marketplaceOrderPayment.findUnique({
          where: { providerPaymentIntentId: paymentIntentId },
        })
      : null;

    if (!payment) {
      await this.prisma.marketplacePaymentProviderEvent.create({
        data: {
          provider: MarketplacePaymentProvider.STRIPE,
          providerEventId: eventId,
          eventType,
          outcome: MarketplacePaymentEventOutcome.IGNORED,
        },
      });
      return { received: true, outcome: MarketplacePaymentEventOutcome.IGNORED };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.marketplaceOrderPayment.update({
        where: { id: payment.id },
        data: {
          status: MarketplaceOrderPaymentStatus.DISPUTED,
        },
      });

      await tx.marketplacePaymentProviderEvent.create({
        data: {
          provider: MarketplacePaymentProvider.STRIPE,
          providerEventId: eventId,
          eventType,
          paymentId: payment.id,
          outcome: MarketplacePaymentEventOutcome.PROCESSED,
        },
      });
    });

    return { received: true, outcome: MarketplacePaymentEventOutcome.PROCESSED };
  }
}
