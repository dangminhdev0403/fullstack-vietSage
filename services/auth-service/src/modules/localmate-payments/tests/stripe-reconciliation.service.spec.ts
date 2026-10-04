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
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(mockPrisma)),
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
    const validOpenPayment = {
      id: "pay-rec-1",
      orderId: "ord-rec-1",
      currency: "VND",
      platformFeeAmount: "150000",
      status: MarketplaceOrderPaymentStatus.OPEN,
      providerCheckoutSessionId: "cs_rec_paid",
      expiresAt: new Date(Date.now() - 60000), // Past
      paidAt: null,
      providerPaymentIntentId: null,
    };

    it("reconciles to PAID when Stripe Checkout Session passes all authoritative checks", async () => {
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(validOpenPayment);
      mockPrisma.marketplaceOrderPayment.findUniqueOrThrow.mockResolvedValue(validOpenPayment);
      mockStripeClient.getCheckoutSession.mockResolvedValue({
        id: "cs_rec_paid",
        url: "https://checkout.stripe.com/pay/cs_rec_paid",
        expires_at: 1700001800,
        payment_status: "paid",
        status: "complete",
        client_reference_id: "ord-rec-1",
        payment_intent: "pi_authoritative",
        amount_total: 150000,
        currency: "vnd",
      });

      mockPrisma.marketplaceOrderPayment.update.mockResolvedValue({
        ...validOpenPayment,
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
          lastProviderErrorCode: null,
        }),
      });
    });

    it("does not mark PAID and sets amount_or_currency_mismatch when currency is not VND", async () => {
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(validOpenPayment);
      mockStripeClient.getCheckoutSession.mockResolvedValue({
        id: "cs_rec_paid",
        url: "https://checkout.stripe.com/pay/cs_rec_paid",
        expires_at: 1700001800,
        payment_status: "paid",
        status: "complete",
        client_reference_id: "ord-rec-1",
        payment_intent: "pi_authoritative",
        amount_total: 150000,
        currency: "usd", // Mismatch
      });

      const result = await service.reconcilePayment("pay-rec-1");

      expect(result.reconciled).toBe(false);
      expect(result.newStatus).toBe(MarketplaceOrderPaymentStatus.OPEN);
      expect(result.reason).toBe("amount_or_currency_mismatch");
      expect(mockPrisma.marketplaceOrderPayment.update).toHaveBeenCalledWith({
        where: { id: "pay-rec-1" },
        data: {
          lastProviderErrorCode: "amount_or_currency_mismatch",
        },
      });
    });

    it("does not mark PAID and sets amount_or_currency_mismatch when amount_total differs from DB snapshot", async () => {
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(validOpenPayment);
      mockStripeClient.getCheckoutSession.mockResolvedValue({
        id: "cs_rec_paid",
        url: "https://checkout.stripe.com/pay/cs_rec_paid",
        expires_at: 1700001800,
        payment_status: "paid",
        status: "complete",
        client_reference_id: "ord-rec-1",
        payment_intent: "pi_authoritative",
        amount_total: 99999, // Mismatch: DB has 150000
        currency: "vnd",
      });

      const result = await service.reconcilePayment("pay-rec-1");

      expect(result.reconciled).toBe(false);
      expect(result.newStatus).toBe(MarketplaceOrderPaymentStatus.OPEN);
      expect(result.reason).toBe("amount_or_currency_mismatch");
      expect(mockPrisma.marketplaceOrderPayment.update).toHaveBeenCalledWith({
        where: { id: "pay-rec-1" },
        data: {
          lastProviderErrorCode: "amount_or_currency_mismatch",
        },
      });
    });

    it("does not mark PAID when client_reference_id does not match order ID", async () => {
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(validOpenPayment);
      mockStripeClient.getCheckoutSession.mockResolvedValue({
        id: "cs_rec_paid",
        url: "https://checkout.stripe.com/pay/cs_rec_paid",
        expires_at: 1700001800,
        payment_status: "paid",
        status: "complete",
        client_reference_id: "different-order-id", // Mismatch
        payment_intent: "pi_authoritative",
        amount_total: 150000,
        currency: "vnd",
      });

      const result = await service.reconcilePayment("pay-rec-1");

      expect(result.reconciled).toBe(false);
      expect(result.newStatus).toBe(MarketplaceOrderPaymentStatus.OPEN);
      expect(result.reason).toBe("amount_or_currency_mismatch");
      expect(mockPrisma.marketplaceOrderPayment.update).toHaveBeenCalledWith({
        where: { id: "pay-rec-1" },
        data: {
          lastProviderErrorCode: "amount_or_currency_mismatch",
        },
      });
    });

    it("does not mark PAID when provider session id does not match payment record", async () => {
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(validOpenPayment);
      mockStripeClient.getCheckoutSession.mockResolvedValue({
        id: "cs_completely_different", // Mismatch
        url: "https://checkout.stripe.com/pay/cs_rec_paid",
        expires_at: 1700001800,
        payment_status: "paid",
        status: "complete",
        client_reference_id: "ord-rec-1",
        payment_intent: "pi_authoritative",
        amount_total: 150000,
        currency: "vnd",
      });

      const result = await service.reconcilePayment("pay-rec-1");

      expect(result.reconciled).toBe(false);
      expect(result.newStatus).toBe(MarketplaceOrderPaymentStatus.OPEN);
      expect(result.reason).toBe("amount_or_currency_mismatch");
      expect(mockPrisma.marketplaceOrderPayment.update).toHaveBeenCalledWith({
        where: { id: "pay-rec-1" },
        data: {
          lastProviderErrorCode: "amount_or_currency_mismatch",
        },
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
      mockPrisma.marketplaceOrderPayment.findUniqueOrThrow.mockResolvedValue(openPayment);
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
      mockPrisma.marketplaceOrderPayment.findUniqueOrThrow.mockResolvedValue(openPayment);
      mockPrisma.marketplaceOrderPayment.update.mockResolvedValue({
        ...openPayment,
        status: MarketplaceOrderPaymentStatus.EXPIRED,
      });

      const result = await service.reconcilePayment("pay-rec-no-session");

      expect(result.reconciled).toBe(true);
      expect(result.newStatus).toBe(MarketplaceOrderPaymentStatus.EXPIRED);
      expect(mockStripeClient.getCheckoutSession).not.toHaveBeenCalled();
    });

    it("protects terminal state: does not overwrite if payment is already PAID", async () => {
      const alreadyPaid = {
        ...validOpenPayment,
        status: MarketplaceOrderPaymentStatus.PAID,
        paidAt: new Date("2026-10-01T00:00:00Z"),
      };

      // Initially found as OPEN, but inside transaction is already PAID
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(validOpenPayment);
      mockPrisma.marketplaceOrderPayment.findUniqueOrThrow.mockResolvedValue(alreadyPaid);
      mockStripeClient.getCheckoutSession.mockResolvedValue({
        id: "cs_rec_paid",
        url: "https://checkout.stripe.com/pay/cs_rec_paid",
        expires_at: 1700001800,
        payment_status: "paid",
        status: "complete",
        client_reference_id: "ord-rec-1",
        payment_intent: "pi_authoritative",
        amount_total: 150000,
        currency: "vnd",
      });

      const result = await service.reconcilePayment("pay-rec-1");

      expect(result.reconciled).toBe(true);
      expect(result.newStatus).toBe(MarketplaceOrderPaymentStatus.PAID);
      // update in transaction must NOT have been called because status was already PAID
      expect(mockPrisma.marketplaceOrderPayment.update).not.toHaveBeenCalled();
    });
  });

  describe("reconcileStalePayments", () => {
    it("batches stale payments and reconciles each", async () => {
      const stalePayments = [
        {
          id: "p1",
          orderId: "o1",
          currency: "VND",
          platformFeeAmount: "150000",
          status: MarketplaceOrderPaymentStatus.OPEN,
          providerCheckoutSessionId: "cs1",
          expiresAt: new Date(Date.now() - 10000),
        },
        {
          id: "p2",
          orderId: "o2",
          currency: "VND",
          platformFeeAmount: "150000",
          status: MarketplaceOrderPaymentStatus.OPEN,
          providerCheckoutSessionId: "cs2",
          expiresAt: new Date(Date.now() - 20000),
        },
      ];

      mockPrisma.marketplaceOrderPayment.findMany.mockResolvedValue(stalePayments);
      mockPrisma.marketplaceOrderPayment.findUnique
        .mockResolvedValueOnce(stalePayments[0])
        .mockResolvedValueOnce(stalePayments[1]);
      mockPrisma.marketplaceOrderPayment.findUniqueOrThrow
        .mockResolvedValueOnce(stalePayments[0])
        .mockResolvedValueOnce(stalePayments[1]);

      mockStripeClient.getCheckoutSession
        .mockResolvedValueOnce({
          id: "cs1",
          url: "https://checkout.stripe.com/pay/cs1",
          expires_at: 1700001800,
          payment_status: "paid",
          status: "complete",
          client_reference_id: "o1",
          payment_intent: "pi_1",
          amount_total: 150000,
          currency: "vnd",
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
