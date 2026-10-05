import { Injectable, NotFoundException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { StripeClient } from "../infrastructure/stripe-client";
import { MarketplaceOrderPaymentStatus, MarketplaceGuideNotificationStatus } from "@prisma/client";
import type { ReconciliationResult } from "../domain/localmate-payment.dto";

@Injectable()
export class StripeReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeClient: StripeClient,
    private readonly logger: AppLogger,
  ) {}

  async reconcilePayment(paymentId: string): Promise<ReconciliationResult> {
    const payment = await this.prisma.marketplaceOrderPayment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} not found for reconciliation`);
    }

    const previousStatus = payment.status;

    if (
      payment.status === MarketplaceOrderPaymentStatus.REFUND_PENDING &&
      payment.providerPaymentIntentId
    ) {
      try {
        const intent = await this.stripeClient.getPaymentIntent(payment.providerPaymentIntentId);
        const amountRefunded = Number(intent.latest_charge?.amount_refunded ?? 0);
        const expectedAmount = Math.round(Number(payment.platformFeeAmount));
        const isValid =
          intent.id === payment.providerPaymentIntentId &&
          intent.currency.toLowerCase() === "vnd" &&
          Number.isFinite(amountRefunded) &&
          amountRefunded >= 0 &&
          amountRefunded <= expectedAmount;

        if (!isValid) {
          await this.prisma.marketplaceOrderPayment.update({
            where: { id: payment.id },
            data: { lastProviderErrorCode: "amount_or_currency_mismatch" },
          });
          return {
            paymentId: payment.id,
            orderId: payment.orderId,
            previousStatus,
            newStatus: previousStatus,
            reconciled: false,
            reason: "amount_or_currency_mismatch",
          };
        }

        if (amountRefunded > 0) {
          const updated = await this.prisma.$transaction(async (tx) => {
            const current = await tx.marketplaceOrderPayment.findUniqueOrThrow({
              where: { id: payment.id },
            });
            if (current.status !== MarketplaceOrderPaymentStatus.REFUND_PENDING) {
              return current;
            }
            const isFullRefund = amountRefunded === expectedAmount;
            return tx.marketplaceOrderPayment.update({
              where: { id: payment.id },
              data: {
                status: isFullRefund
                  ? MarketplaceOrderPaymentStatus.REFUNDED
                  : MarketplaceOrderPaymentStatus.REFUND_PENDING,
                refundedAmount: String(amountRefunded),
                refundedAt: isFullRefund ? (current.refundedAt ?? new Date()) : null,
                refundNextAttemptAt: isFullRefund ? null : current.refundNextAttemptAt,
                lastProviderErrorCode: isFullRefund ? null : "partial_refund",
              },
            });
          });
          return {
            paymentId: payment.id,
            orderId: payment.orderId,
            previousStatus,
            newStatus: updated.status,
            reconciled: true,
            reason: "provider_refund_authoritative",
          };
        }
      } catch (err: any) {
        this.logger.warn("Failed to reconcile refund with Stripe", {
          module: "localmate-payments",
          service: "StripeReconciliationService",
          operation: "reconcilePayment",
          event: "STRIPE_REFUND_RECONCILIATION_QUERY_FAILED",
          paymentId: payment.id,
          orderId: payment.orderId,
          error: err?.message,
        });
      }
    }

    if (
      payment.status === MarketplaceOrderPaymentStatus.OPEN ||
      payment.status === MarketplaceOrderPaymentStatus.CANCELLED
    ) {
      if (!payment.providerCheckoutSessionId) {
        // If expired with no session id, mark expired directly
        const isExpired = payment.expiresAt && payment.expiresAt < new Date();
        if (isExpired) {
          const updated = await this.prisma.$transaction(async (tx) => {
            const current = await tx.marketplaceOrderPayment.findUniqueOrThrow({
              where: { id: payment.id },
            });
            if (
              current.status === MarketplaceOrderPaymentStatus.OPEN ||
              current.status === MarketplaceOrderPaymentStatus.CREATING
            ) {
              return tx.marketplaceOrderPayment.update({
                where: { id: payment.id },
                data: { status: MarketplaceOrderPaymentStatus.EXPIRED },
              });
            }
            return current;
          });

          return {
            paymentId: payment.id,
            orderId: payment.orderId,
            previousStatus,
            newStatus: updated.status,
            reconciled: updated.status === MarketplaceOrderPaymentStatus.EXPIRED,
            reason: "no_provider_session_and_expired",
          };
        }
        return {
          paymentId: payment.id,
          orderId: payment.orderId,
          previousStatus,
          newStatus: previousStatus,
          reconciled: false,
        };
      }

      try {
        const session = await this.stripeClient.getCheckoutSession(
          payment.providerCheckoutSessionId,
        );

        if (session.payment_status === "paid") {
          const isSessionIdMatch = session.id === payment.providerCheckoutSessionId;
          const isOrderMatch = Boolean(
            session.client_reference_id && session.client_reference_id === payment.orderId,
          );
          const sessionCurrency = String(session.currency || "").toLowerCase();
          const expectedCurrency = payment.currency.toLowerCase();
          const isCurrencyMatch = sessionCurrency === expectedCurrency && sessionCurrency === "vnd";
          const sessionAmount = Number(session.amount_total);
          const expectedAmount = Math.round(Number(payment.platformFeeAmount));
          const isAmountMatch = !Number.isNaN(sessionAmount) && sessionAmount === expectedAmount;

          if (!isSessionIdMatch || !isOrderMatch || !isCurrencyMatch || !isAmountMatch) {
            this.logger.warn(
              "Stripe reconciliation validation failed (mismatch with DB snapshot)",
              {
                module: "localmate-payments",
                service: "StripeReconciliationService",
                operation: "reconcilePayment",
                event: "STRIPE_RECONCILIATION_VALIDATION_FAILED",
                paymentId: payment.id,
                orderId: payment.orderId,
                isSessionIdMatch,
                isOrderMatch,
                isCurrencyMatch,
                isAmountMatch,
                sessionAmount,
                expectedAmount,
                sessionCurrency,
                expectedCurrency,
              },
            );

            await this.prisma.marketplaceOrderPayment.update({
              where: { id: payment.id },
              data: {
                lastProviderErrorCode: "amount_or_currency_mismatch",
              },
            });

            return {
              paymentId: payment.id,
              orderId: payment.orderId,
              previousStatus,
              newStatus: previousStatus,
              reconciled: false,
              reason: "amount_or_currency_mismatch",
            };
          }

          // Authoritative checks passed -> transition to PAID inside transaction
          const updated = await this.prisma.$transaction(async (tx) => {
            const current = await tx.marketplaceOrderPayment.findUniqueOrThrow({
              where: { id: payment.id },
            });

            const providerPaymentIntentId =
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : current.providerPaymentIntentId;

            if (current.status === MarketplaceOrderPaymentStatus.CANCELLED) {
              return tx.marketplaceOrderPayment.update({
                where: { id: payment.id },
                data: {
                  status: MarketplaceOrderPaymentStatus.REFUND_PENDING,
                  paidAt: current.paidAt ?? new Date(),
                  providerPaymentIntentId,
                  guideNotificationStatus: MarketplaceGuideNotificationStatus.BLOCKED,
                  refundReasonCode: "PAYMENT_COMPLETED_AFTER_CANCELLATION",
                  refundNextAttemptAt: new Date(),
                  lastProviderErrorCode: null,
                },
              });
            }

            if (
              current.status === MarketplaceOrderPaymentStatus.OPEN ||
              current.status === MarketplaceOrderPaymentStatus.CREATING
            ) {
              return tx.marketplaceOrderPayment.update({
                where: { id: payment.id },
                data: {
                  status: MarketplaceOrderPaymentStatus.PAID,
                  paidAt: current.paidAt ?? new Date(),
                  providerPaymentIntentId,
                  guideNotificationStatus: MarketplaceGuideNotificationStatus.PENDING,
                  lastProviderErrorCode: null,
                },
              });
            }
            return current;
          });

          return {
            paymentId: payment.id,
            orderId: payment.orderId,
            previousStatus,
            newStatus: updated.status,
            reconciled:
              updated.status === MarketplaceOrderPaymentStatus.PAID ||
              updated.status === MarketplaceOrderPaymentStatus.REFUND_PENDING,
            reason: "provider_paid_authoritative",
          };
        }

        const isExpired =
          session.status === "expired" || (payment.expiresAt && payment.expiresAt < new Date());

        if (isExpired) {
          const updated = await this.prisma.$transaction(async (tx) => {
            const current = await tx.marketplaceOrderPayment.findUniqueOrThrow({
              where: { id: payment.id },
            });
            if (
              current.status === MarketplaceOrderPaymentStatus.OPEN ||
              current.status === MarketplaceOrderPaymentStatus.CREATING
            ) {
              return tx.marketplaceOrderPayment.update({
                where: { id: payment.id },
                data: { status: MarketplaceOrderPaymentStatus.EXPIRED },
              });
            }
            return current;
          });

          return {
            paymentId: payment.id,
            orderId: payment.orderId,
            previousStatus,
            newStatus: updated.status,
            reconciled: updated.status === MarketplaceOrderPaymentStatus.EXPIRED,
            reason: "session_expired",
          };
        }
      } catch (err: any) {
        this.logger.warn("Failed to reconcile payment with Stripe", {
          module: "localmate-payments",
          service: "StripeReconciliationService",
          operation: "reconcilePayment",
          event: "STRIPE_RECONCILIATION_QUERY_FAILED",
          paymentId: payment.id,
          orderId: payment.orderId,
          error: err?.message,
        });
      }
    }

    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      previousStatus,
      newStatus: previousStatus,
      reconciled: false,
    };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async reconcileStalePayments(): Promise<ReconciliationResult[]> {
    const now = new Date();
    const recentCancellationCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const stalePayments = await this.prisma.marketplaceOrderPayment.findMany({
      where: {
        OR: [
          {
            status: MarketplaceOrderPaymentStatus.OPEN,
            expiresAt: { lt: now },
          },
          {
            status: MarketplaceOrderPaymentStatus.CANCELLED,
            providerCheckoutSessionId: { not: null },
            updatedAt: { gte: recentCancellationCutoff },
          },
          {
            status: MarketplaceOrderPaymentStatus.REFUND_PENDING,
            providerPaymentIntentId: { not: null },
            OR: [{ refundNextAttemptAt: null }, { refundNextAttemptAt: { lte: now } }],
          },
        ],
      },
      take: 50,
    });

    const results: ReconciliationResult[] = [];
    for (const payment of stalePayments) {
      try {
        const result = await this.reconcilePayment(payment.id);
        results.push(result);
      } catch {
        // Continue processing others
      }
    }

    return results;
  }
}
