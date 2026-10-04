import { Injectable, NotFoundException } from "@nestjs/common";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { StripeClient } from "../infrastructure/stripe-client";
import {
  MarketplaceOrderPaymentStatus,
  MarketplaceGuideNotificationStatus,
} from "@prisma/client";
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

    if (payment.status === MarketplaceOrderPaymentStatus.OPEN) {
      if (!payment.providerCheckoutSessionId) {
        // If expired with no session id, mark expired directly
        const isExpired = payment.expiresAt && payment.expiresAt < new Date();
        if (isExpired) {
          const updated = await this.prisma.marketplaceOrderPayment.update({
            where: { id: payment.id },
            data: { status: MarketplaceOrderPaymentStatus.EXPIRED },
          });
          return {
            paymentId: payment.id,
            orderId: payment.orderId,
            previousStatus,
            newStatus: updated.status,
            reconciled: true,
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
          const updated = await this.prisma.marketplaceOrderPayment.update({
            where: { id: payment.id },
            data: {
              status: MarketplaceOrderPaymentStatus.PAID,
              paidAt: new Date(),
              providerPaymentIntentId:
                typeof session.payment_intent === "string"
                  ? session.payment_intent
                  : payment.providerPaymentIntentId,
              guideNotificationStatus: MarketplaceGuideNotificationStatus.PENDING,
              lastProviderErrorCode: null,
            },
          });
          return {
            paymentId: payment.id,
            orderId: payment.orderId,
            previousStatus,
            newStatus: updated.status,
            reconciled: true,
            reason: "provider_paid_authoritative",
          };
        }

        const isExpired =
          session.status === "expired" ||
          (payment.expiresAt && payment.expiresAt < new Date());

        if (isExpired) {
          const updated = await this.prisma.marketplaceOrderPayment.update({
            where: { id: payment.id },
            data: { status: MarketplaceOrderPaymentStatus.EXPIRED },
          });
          return {
            paymentId: payment.id,
            orderId: payment.orderId,
            previousStatus,
            newStatus: updated.status,
            reconciled: true,
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

  async reconcileStalePayments(): Promise<ReconciliationResult[]> {
    const now = new Date();
    const stalePayments = await this.prisma.marketplaceOrderPayment.findMany({
      where: {
        status: MarketplaceOrderPaymentStatus.OPEN,
        expiresAt: { lt: now },
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
