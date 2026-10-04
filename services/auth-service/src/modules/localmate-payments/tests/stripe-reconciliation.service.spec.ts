import { StripeReconciliationService } from "../application/stripe-reconciliation.service";
import { StripeClient } from "../infrastructure/stripe-client";
import { AppLogger } from "../../../common/logging/app-logger.service";
import {
  MarketplaceOrderPaymentStatus,
  MarketplaceGuideNotificationStatus,
} from "@prisma/client";

describe("StripeReconciliationService", () => {
  let service: StripeReconciliationService;
  let mockPrisma: any;
  let mockStripeClient: jest.Mocked<StripeClient>;
  let mockLogger: jest.Mocked<AppLogger>;

  beforeEach(() => {
    mockPrisma = {
      marketplaceOrderPayment: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    mockStripeClient = {
      getCheckoutSession: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any;

    service = new StripeReconciliationService(
      mockPrisma,
      mockStripeClient,
      mockLogger,
    );
  });

  describe("reconcilePayment", () => {
    it("reconciles to PAID when Stripe Checkout Session shows paid", async () => {
      const openPayment = {
        id: "pay-rec-1",
        orderId: "ord-rec-1",
        status: MarketplaceOrderPaymentStatus.OPEN,
        providerCheckoutSessionId: "cs_rec_paid",
        expiresAt: new Date(Date.now() - 60000), // Past
      };

      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(openPayment);
      mockStripeClient.getCheckoutSession.mockResolvedValue({
        id: "cs_rec_paid",
        url: "https://checkout.stripe.com/pay/cs_rec_paid",
        expires_at: 1700001800,
        payment_status: "paid",
        status: "complete",
        payment_intent: "pi_authoritative",
        amount_total: 150000,
        currency: "vnd",
      });

      mockPrisma.marketplaceOrderPayment.update.mockResolvedValue({
        ...openPayment,
        status: MarketplaceOrderPaymentStatus.PAID,
      });

      const result = await service.reconcilePayment("pay-rec-1");

      expect(result.reconciled).toBe(true);
      expect(result.newStatus).toBe(MarketplaceOrderPaymentStatus.PAID);
      expect(mockPrisma.marketplaceOrderPayment.update).toHaveBeenCalledWith({
        where: { id: "pay-rec-1" },
        data: expect.objectContaining({
          status: MarketplaceOrderPaymentStatus.PAID,
          providerPaymentIntentId: "pi_authoritative",
          guideNotificationStatus: MarketplaceGuideNotificationStatus.PENDING,
        }),
      });
    });

    it("reconciles to EXPIRED when Stripe session is expired", async () => {
      const openPayment = {
        id: "pay-rec-2",
        orderId: "ord-rec-2",
        status: MarketplaceOrderPaymentStatus.OPEN,
        providerCheckoutSessionId: "cs_rec_exp",
        expiresAt: new Date(Date.now() - 60000),
      };

      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(openPayment);
      mockStripeClient.getCheckoutSession.mockResolvedValue({
        id: "cs_rec_exp",
        url: null,
        expires_at: 1700001800,
        payment_status: "unpaid",
        status: "expired",
      });

      mockPrisma.marketplaceOrderPayment.update.mockResolvedValue({
        ...openPayment,
        status: MarketplaceOrderPaymentStatus.EXPIRED,
      });

      const result = await service.reconcilePayment("pay-rec-2");

      expect(result.reconciled).toBe(true);
      expect(result.newStatus).toBe(MarketplaceOrderPaymentStatus.EXPIRED);
    });

    it("expires open payment directly when no provider session exists and expiresAt is in past", async () => {
      const openPayment = {
        id: "pay-rec-no-session",
        orderId: "ord-no-session",
        status: MarketplaceOrderPaymentStatus.OPEN,
        providerCheckoutSessionId: null,
        expiresAt: new Date(Date.now() - 60000),
      };

      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(openPayment);
      mockPrisma.marketplaceOrderPayment.update.mockResolvedValue({
        ...openPayment,
        status: MarketplaceOrderPaymentStatus.EXPIRED,
      });

      const result = await service.reconcilePayment("pay-rec-no-session");

      expect(result.reconciled).toBe(true);
      expect(result.newStatus).toBe(MarketplaceOrderPaymentStatus.EXPIRED);
      expect(mockStripeClient.getCheckoutSession).not.toHaveBeenCalled();
    });
  });

  describe("reconcileStalePayments", () => {
    it("batches stale payments and reconciles each", async () => {
      const stalePayments = [
        {
          id: "p1",
          orderId: "o1",
          status: MarketplaceOrderPaymentStatus.OPEN,
          providerCheckoutSessionId: "cs1",
          expiresAt: new Date(Date.now() - 10000),
        },
        {
          id: "p2",
          orderId: "o2",
          status: MarketplaceOrderPaymentStatus.OPEN,
          providerCheckoutSessionId: "cs2",
          expiresAt: new Date(Date.now() - 20000),
        },
      ];

      mockPrisma.marketplaceOrderPayment.findMany.mockResolvedValue(stalePayments);
      mockPrisma.marketplaceOrderPayment.findUnique
        .mockResolvedValueOnce(stalePayments[0])
        .mockResolvedValueOnce(stalePayments[1]);

      mockStripeClient.getCheckoutSession
        .mockResolvedValueOnce({
          id: "cs1",
          url: "https://checkout.stripe.com/pay/cs1",
          expires_at: 1700001800,
          payment_status: "paid",
          status: "complete",
          payment_intent: "pi_1",
        })
        .mockResolvedValueOnce({
          id: "cs2",
          url: null,
          expires_at: 1700001800,
          payment_status: "unpaid",
          status: "expired",
        });

      mockPrisma.marketplaceOrderPayment.update
        .mockResolvedValueOnce({ ...stalePayments[0], status: MarketplaceOrderPaymentStatus.PAID })
        .mockResolvedValueOnce({ ...stalePayments[1], status: MarketplaceOrderPaymentStatus.EXPIRED });

      const results = await service.reconcileStalePayments();

      expect(results).toHaveLength(2);
      expect(results[0].newStatus).toBe(MarketplaceOrderPaymentStatus.PAID);
      expect(results[1].newStatus).toBe(MarketplaceOrderPaymentStatus.EXPIRED);
    });
  });
});
