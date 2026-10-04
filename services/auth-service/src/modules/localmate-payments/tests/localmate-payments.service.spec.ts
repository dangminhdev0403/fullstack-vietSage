import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { LocalMatePaymentsService } from "../application/localmate-payments.service";
import { StripeClient } from "../infrastructure/stripe-client";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { MarketplaceOrderPaymentStatus } from "@prisma/client";

describe("LocalMatePaymentsService", () => {
  let service: LocalMatePaymentsService;
  let mockPrisma: any;
  let mockStripeClient: jest.Mocked<StripeClient>;
  let mockLogger: jest.Mocked<AppLogger>;

  beforeEach(() => {
    process.env.STRIPE_CHECKOUT_ENABLED = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_mock_12345";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock_12345";
    process.env.STRIPE_CHECKOUT_RETURN_BASE_URL = "https://app.vietsage.com";

    mockPrisma = {
      marketplaceOrderPayment: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    mockStripeClient = {
      createCheckoutSession: jest.fn(),
      getCheckoutSession: jest.fn(),
      expireCheckoutSession: jest.fn(),
      createRefund: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any;

    service = new LocalMatePaymentsService(mockPrisma, mockStripeClient, mockLogger);
  });

  describe("createOrGetCheckoutSession", () => {
    it("creates a new checkout session when none exists", async () => {
      const mockPayment = {
        id: "pay-1",
        orderId: "ord-1",
        status: MarketplaceOrderPaymentStatus.OPEN,
        platformFeeAmount: "150000",
        checkoutUrl: null,
        expiresAt: null,
      };

      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(mockPayment);
      mockStripeClient.createCheckoutSession.mockResolvedValue({
        id: "cs_stripe_1",
        url: "https://checkout.stripe.com/c/pay/cs_stripe_1",
        expires_at: 1700001800,
        payment_status: "unpaid",
        status: "open",
      });

      mockPrisma.marketplaceOrderPayment.update.mockResolvedValue({
        ...mockPayment,
        providerCheckoutSessionId: "cs_stripe_1",
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_stripe_1",
        expiresAt: new Date(1700001800 * 1000),
      });

      const result = await service.createOrGetCheckoutSession({ orderId: "ord-1" });

      expect(result.isNewSession).toBe(true);
      expect(result.checkoutUrl).toBe("https://checkout.stripe.com/c/pay/cs_stripe_1");
      expect(mockStripeClient.createCheckoutSession).toHaveBeenCalledWith({
        paymentId: "pay-1",
        orderId: "ord-1",
        platformFeeAmount: "150000",
      });
    });

    it("reuses existing unexpired session without creating a new one", async () => {
      const futureDate = new Date(Date.now() + 600000); // 10 min in future
      const existingPayment = {
        id: "pay-reuse",
        orderId: "ord-reuse",
        status: MarketplaceOrderPaymentStatus.OPEN,
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_existing",
        expiresAt: futureDate,
        platformFeeAmount: "150000",
      };

      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(existingPayment);

      const result = await service.createOrGetCheckoutSession({ orderId: "ord-reuse" });

      expect(result.isNewSession).toBe(false);
      expect(result.checkoutUrl).toBe("https://checkout.stripe.com/c/pay/cs_existing");
      expect(mockStripeClient.createCheckoutSession).not.toHaveBeenCalled();
    });

    it("returns without calling Stripe when fee is 0% / NOT_REQUIRED", async () => {
      const notRequiredPayment = {
        id: "pay-0",
        orderId: "ord-0",
        status: MarketplaceOrderPaymentStatus.NOT_REQUIRED,
        checkoutUrl: null,
        expiresAt: null,
      };

      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(notRequiredPayment);

      const result = await service.createOrGetCheckoutSession({ orderId: "ord-0" });

      expect(result.status).toBe(MarketplaceOrderPaymentStatus.NOT_REQUIRED);
      expect(result.checkoutUrl).toBeNull();
      expect(result.isNewSession).toBe(false);
      expect(mockStripeClient.createCheckoutSession).not.toHaveBeenCalled();
    });

    it("returns current state without creating new session when payment is already PAID", async () => {
      const paidPayment = {
        id: "pay-paid",
        orderId: "ord-paid",
        status: MarketplaceOrderPaymentStatus.PAID,
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_paid",
        expiresAt: new Date(),
      };

      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(paidPayment);

      const result = await service.createOrGetCheckoutSession({ orderId: "ord-paid" });

      expect(result.status).toBe(MarketplaceOrderPaymentStatus.PAID);
      expect(result.isNewSession).toBe(false);
      expect(mockStripeClient.createCheckoutSession).not.toHaveBeenCalled();
    });

    it("throws ServiceUnavailableException when Stripe checkout is disabled", async () => {
      process.env.STRIPE_CHECKOUT_ENABLED = "false";
      const disabledService = new LocalMatePaymentsService(
        mockPrisma,
        mockStripeClient,
        mockLogger,
      );

      const payment = {
        id: "pay-dis",
        orderId: "ord-dis",
        status: MarketplaceOrderPaymentStatus.OPEN,
        platformFeeAmount: "150000",
        checkoutUrl: null,
        expiresAt: null,
      };
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(payment);

      await expect(
        disabledService.createOrGetCheckoutSession({ orderId: "ord-dis" }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it("throws NotFoundException when order payment record does not exist", async () => {
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(null);

      await expect(
        service.createOrGetCheckoutSession({ orderId: "ord-none" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("refundLocalMatePayment", () => {
    it("is idempotent: returns alreadyRefunded=true if status is already REFUNDED", async () => {
      const alreadyRefunded = {
        id: "pay-ref-done",
        orderId: "ord-ref-done",
        status: MarketplaceOrderPaymentStatus.REFUNDED,
        refundedAmount: "150000",
        refundedAt: new Date(),
      };
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(alreadyRefunded);

      const result = await service.refundLocalMatePayment({ paymentId: "pay-ref-done" });

      expect(result.alreadyRefunded).toBe(true);
      expect(result.status).toBe(MarketplaceOrderPaymentStatus.REFUNDED);
      expect(mockStripeClient.createRefund).not.toHaveBeenCalled();
    });

    it("throws BadRequestException when trying to refund unpaid/open payment", async () => {
      const openPayment = {
        id: "pay-open",
        orderId: "ord-open",
        status: MarketplaceOrderPaymentStatus.OPEN,
        platformFeeAmount: "150000",
        providerPaymentIntentId: null,
      };
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(openPayment);

      await expect(
        service.refundLocalMatePayment({ paymentId: "pay-open" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("atomically marks REFUND_PENDING and leaves webhook to confirm REFUNDED", async () => {
      const paidPayment = {
        id: "pay-to-ref",
        orderId: "ord-to-ref",
        status: MarketplaceOrderPaymentStatus.PAID,
        platformFeeAmount: "150000",
        providerPaymentIntentId: "pi_real_ref",
      };
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(paidPayment);
      mockStripeClient.createRefund.mockResolvedValue({
        id: "re_stripe_1",
        amount: 150000,
        status: "succeeded",
        currency: "vnd",
        payment_intent: "pi_real_ref",
      });

      mockPrisma.marketplaceOrderPayment.update.mockResolvedValue({
        ...paidPayment,
        status: MarketplaceOrderPaymentStatus.REFUNDED,
        refundedAmount: "150000",
        refundedAt: new Date(),
      });

      const result = await service.refundLocalMatePayment({
        paymentId: "pay-to-ref",
        reason: "guide_rejected",
      });

      expect(result.status).toBe(MarketplaceOrderPaymentStatus.REFUND_PENDING);
      expect(result.alreadyRefunded).toBe(false);
      expect(mockStripeClient.createRefund).toHaveBeenCalledWith({
        paymentIntentId: "pi_real_ref",
        amountVnd: "150000",
        paymentId: "pay-to-ref",
        orderId: "ord-to-ref",
        reason: "guide_rejected",
      });
      // Verifies intermediate REFUND_PENDING update was made
      expect(mockPrisma.marketplaceOrderPayment.update).toHaveBeenCalledWith({
        where: { id: "pay-to-ref" },
        data: { status: MarketplaceOrderPaymentStatus.REFUND_PENDING },
      });
    });

    it("keeps REFUND_PENDING when Stripe has accepted but not completed the refund", async () => {
      const paidPayment = {
        id: "pay-pending",
        orderId: "ord-pending",
        status: MarketplaceOrderPaymentStatus.PAID,
        platformFeeAmount: "150000",
        refundedAmount: "0",
        refundedAt: null,
        providerPaymentIntentId: "pi_pending",
      };
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(paidPayment);
      mockStripeClient.createRefund.mockResolvedValue({
        id: "re_pending",
        amount: 150000,
        status: "pending",
        currency: "vnd",
        payment_intent: "pi_pending",
      });

      const result = await service.refundLocalMatePayment({ paymentId: "pay-pending" });

      expect(result.status).toBe(MarketplaceOrderPaymentStatus.REFUND_PENDING);
      expect(result.refundedAmount).toBe("0");
      expect(result.refundedAt).toBeNull();
      expect(mockPrisma.marketplaceOrderPayment.update).toHaveBeenCalledTimes(1);
    });

    it("retries persisted REFUND_PENDING rows", async () => {
      mockPrisma.marketplaceOrderPayment.findMany.mockResolvedValue([
        { id: "pay-retry-1" },
        { id: "pay-retry-2" },
      ]);
      const retry = jest
        .spyOn(service, "refundLocalMatePayment")
        .mockResolvedValueOnce({} as never)
        .mockRejectedValueOnce(new Error("provider unavailable"));

      await expect(service.retryPendingRefunds()).resolves.toBeUndefined();

      expect(retry).toHaveBeenNthCalledWith(1, { paymentId: "pay-retry-1" });
      expect(retry).toHaveBeenNthCalledWith(2, { paymentId: "pay-retry-2" });
    });
  });

  describe("cancelOrExpireOpenPayment", () => {
    it("expires Stripe session and marks payment CANCELLED", async () => {
      const openPayment = {
        id: "pay-cancel",
        orderId: "ord-cancel",
        status: MarketplaceOrderPaymentStatus.OPEN,
        providerCheckoutSessionId: "cs_to_expire",
      };
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(openPayment);

      await service.cancelOrExpireOpenPayment("ord-cancel");

      expect(mockStripeClient.expireCheckoutSession).toHaveBeenCalledWith("cs_to_expire");
      expect(mockPrisma.marketplaceOrderPayment.update).toHaveBeenCalledWith({
        where: { id: "pay-cancel" },
        data: { status: MarketplaceOrderPaymentStatus.CANCELLED },
      });
    });
  });
});
