import { BadRequestException } from "@nestjs/common";
import { StripeWebhookService } from "../application/stripe-webhook.service";
import { StripeSignatureVerifier } from "../infrastructure/stripe-signature.verifier";
import { AppLogger } from "../../../common/logging/app-logger.service";
import {
  MarketplaceOrderPaymentStatus,
  MarketplaceGuideNotificationStatus,
  MarketplacePaymentEventOutcome,
} from "@prisma/client";

describe("StripeWebhookService", () => {
  let service: StripeWebhookService;
  let mockPrisma: any;
  let mockVerifier: jest.Mocked<StripeSignatureVerifier>;
  let mockLogger: jest.Mocked<AppLogger>;

  const secret = "whsec_test_secret_for_tests";

  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = secret;

    mockPrisma = {
      marketplacePaymentProviderEvent: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      marketplaceOrderPayment: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => {
        return cb(mockPrisma);
      }),
    };

    mockVerifier = {
      verify: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any;

    service = new StripeWebhookService(mockPrisma, mockVerifier, mockLogger);
  });

  const createEventPayload = (eventType: string, dataObject: any, eventId = "evt_123"): string => {
    return JSON.stringify({
      id: eventId,
      type: eventType,
      data: {
        object: dataObject,
      },
    });
  };

  it("throws BadRequestException when signature verifier fails", async () => {
    mockVerifier.verify.mockImplementation(() => {
      throw new BadRequestException("Invalid signature");
    });

    await expect(service.handleWebhook("bad-body", "sig-header")).rejects.toThrow(
      BadRequestException,
    );
  });

  it("throws BadRequestException on malformed JSON payload", async () => {
    mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });

    await expect(service.handleWebhook("not-json", "sig-header")).rejects.toThrow(
      BadRequestException,
    );
  });

  it("is idempotent: duplicate providerEventId returns received=true without re-executing transaction", async () => {
    mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
    mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue({
      id: "ev-rec-1",
      providerEventId: "evt_dup_1",
      outcome: MarketplacePaymentEventOutcome.PROCESSED,
    });

    const payload = createEventPayload(
      "checkout.session.completed",
      { id: "cs_1" },
      "evt_dup_1",
    );

    const result = await service.handleWebhook(payload, "sig-header");

    expect(result).toEqual({
      received: true,
      duplicate: true,
      outcome: MarketplacePaymentEventOutcome.PROCESSED,
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  describe("checkout.session.completed / paid handling", () => {
    const mockPayment = {
      id: "pay-100",
      orderId: "ord-100",
      currency: "VND",
      platformFeeAmount: "150000",
      status: MarketplaceOrderPaymentStatus.OPEN,
      paidAt: null,
      providerPaymentIntentId: null,
    };

    it("transitions OPEN payment to PAID, sets paidAt and guideNotificationStatus to PENDING on valid session", async () => {
      mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
      mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue(null);
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(mockPayment);
      mockPrisma.marketplaceOrderPayment.findUniqueOrThrow.mockResolvedValue(mockPayment);
      mockPrisma.marketplaceOrderPayment.update.mockResolvedValue({
        ...mockPayment,
        status: MarketplaceOrderPaymentStatus.PAID,
      });

      const sessionObj = {
        id: "cs_valid",
        payment_status: "paid",
        currency: "vnd",
        amount_total: 150000,
        client_reference_id: "ord-100",
        payment_intent: "pi_real_123",
        metadata: {
          paymentId: "pay-100",
          orderId: "ord-100",
        },
      };

      const payload = createEventPayload("checkout.session.completed", sessionObj, "evt_paid_1");
      const result = await service.handleWebhook(payload, "sig");

      expect(result).toEqual({ received: true, outcome: MarketplacePaymentEventOutcome.PROCESSED });
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.marketplaceOrderPayment.update).toHaveBeenCalledWith({
        where: { id: "pay-100" },
        data: expect.objectContaining({
          status: MarketplaceOrderPaymentStatus.PAID,
          providerPaymentIntentId: "pi_real_123",
          guideNotificationStatus: MarketplaceGuideNotificationStatus.PENDING,
          lastProviderErrorCode: null,
        }),
      });
      expect(mockPrisma.marketplacePaymentProviderEvent.create).toHaveBeenCalledWith({
        data: {
          provider: "STRIPE",
          providerEventId: "evt_paid_1",
          eventType: "checkout.session.completed",
          paymentId: "pay-100",
          outcome: MarketplacePaymentEventOutcome.PROCESSED,
        },
      });
    });

    it("rejects event and flags mismatch when currency does not match DB snapshot", async () => {
      mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
      mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue(null);
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(mockPayment);
      mockPrisma.marketplaceOrderPayment.findUniqueOrThrow.mockResolvedValue(mockPayment);

      const sessionObj = {
        id: "cs_usd",
        payment_status: "paid",
        currency: "usd", // Mismatch: DB has VND
        amount_total: 150000,
        client_reference_id: "ord-100",
        metadata: { paymentId: "pay-100" },
      };

      const payload = createEventPayload("checkout.session.completed", sessionObj, "evt_mismatch_curr");
      const result = await service.handleWebhook(payload, "sig");

      expect(result.outcome).toBe(MarketplacePaymentEventOutcome.REJECTED);
      expect(result.reason).toBe("amount_or_currency_mismatch");
      expect(mockPrisma.marketplaceOrderPayment.update).toHaveBeenCalledWith({
        where: { id: "pay-100" },
        data: { lastProviderErrorCode: "amount_or_currency_mismatch" },
      });
      expect(mockPrisma.marketplacePaymentProviderEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          outcome: MarketplacePaymentEventOutcome.REJECTED,
        }),
      });
    });

    it("rejects event and flags mismatch when amount does not match DB snapshot", async () => {
      mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
      mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue(null);
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(mockPayment);
      mockPrisma.marketplaceOrderPayment.findUniqueOrThrow.mockResolvedValue(mockPayment);

      const sessionObj = {
        id: "cs_wrong_amount",
        payment_status: "paid",
        currency: "vnd",
        amount_total: 99999, // Mismatch: DB has 150000
        client_reference_id: "ord-100",
        metadata: { paymentId: "pay-100" },
      };

      const payload = createEventPayload("checkout.session.completed", sessionObj, "evt_mismatch_amt");
      const result = await service.handleWebhook(payload, "sig");

      expect(result.outcome).toBe(MarketplacePaymentEventOutcome.REJECTED);
      expect(result.reason).toBe("amount_or_currency_mismatch");
    });

    it("rejects event when client_reference_id does not match order ID", async () => {
      mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
      mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue(null);
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(mockPayment);

      const sessionObj = {
        id: "cs_wrong_order",
        payment_status: "paid",
        currency: "vnd",
        amount_total: 150000,
        client_reference_id: "different-order-id",
        metadata: { paymentId: "pay-100" },
      };

      const payload = createEventPayload("checkout.session.completed", sessionObj, "evt_mismatch_order");
      const result = await service.handleWebhook(payload, "sig");

      expect(result.outcome).toBe(MarketplacePaymentEventOutcome.REJECTED);
    });

    it("rejects event when payment_status is unpaid", async () => {
      mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
      mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue(null);
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(mockPayment);

      const sessionObj = {
        id: "cs_unpaid",
        payment_status: "unpaid",
        currency: "vnd",
        amount_total: 150000,
        client_reference_id: "ord-100",
        metadata: { paymentId: "pay-100" },
      };

      const payload = createEventPayload("checkout.session.completed", sessionObj, "evt_unpaid");
      const result = await service.handleWebhook(payload, "sig");

      expect(result.outcome).toBe(MarketplacePaymentEventOutcome.REJECTED);
    });
  });

  describe("reordered and terminal state handling", () => {
    it("does not regress status if payment is already PAID when async_payment_failed arrives", async () => {
      mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
      mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue(null);

      const alreadyPaidPayment = {
        id: "pay-paid",
        orderId: "ord-paid",
        status: MarketplaceOrderPaymentStatus.PAID,
        paidAt: new Date("2026-10-01T00:00:00Z"),
      };

      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(alreadyPaidPayment);
      mockPrisma.marketplaceOrderPayment.findUniqueOrThrow.mockResolvedValue(alreadyPaidPayment);

      const sessionObj = {
        id: "cs_failed_reordered",
        metadata: { paymentId: "pay-paid" },
      };

      const payload = createEventPayload(
        "checkout.session.async_payment_failed",
        sessionObj,
        "evt_reordered_failed",
      );

      const result = await service.handleWebhook(payload, "sig");

      expect(result.outcome).toBe(MarketplacePaymentEventOutcome.PROCESSED);
      // Status update to FAILED must NOT have been called
      expect(mockPrisma.marketplaceOrderPayment.update).not.toHaveBeenCalled();
      expect(mockPrisma.marketplacePaymentProviderEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          outcome: MarketplacePaymentEventOutcome.PROCESSED,
        }),
      });
    });

    it("does not regress status if payment is already PAID when checkout.session.expired arrives", async () => {
      mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
      mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue(null);

      const alreadyPaidPayment = {
        id: "pay-paid",
        orderId: "ord-paid",
        status: MarketplaceOrderPaymentStatus.PAID,
      };

      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(alreadyPaidPayment);
      mockPrisma.marketplaceOrderPayment.findUniqueOrThrow.mockResolvedValue(alreadyPaidPayment);

      const sessionObj = {
        id: "cs_expired_reordered",
        metadata: { paymentId: "pay-paid" },
      };

      const payload = createEventPayload(
        "checkout.session.expired",
        sessionObj,
        "evt_reordered_expired",
      );

      const result = await service.handleWebhook(payload, "sig");

      expect(result.outcome).toBe(MarketplacePaymentEventOutcome.PROCESSED);
      // Status update to EXPIRED must NOT have been called
      expect(mockPrisma.marketplaceOrderPayment.update).not.toHaveBeenCalled();
    });

    it("transitions OPEN payment to EXPIRED when checkout.session.expired arrives", async () => {
      mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
      mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue(null);

      const openPayment = {
        id: "pay-open",
        orderId: "ord-open",
        status: MarketplaceOrderPaymentStatus.OPEN,
      };

      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(openPayment);
      mockPrisma.marketplaceOrderPayment.findUniqueOrThrow.mockResolvedValue(openPayment);

      const sessionObj = {
        id: "cs_expired",
        metadata: { paymentId: "pay-open" },
      };

      const payload = createEventPayload("checkout.session.expired", sessionObj, "evt_exp_1");
      const result = await service.handleWebhook(payload, "sig");

      expect(result.outcome).toBe(MarketplacePaymentEventOutcome.PROCESSED);
      expect(mockPrisma.marketplaceOrderPayment.update).toHaveBeenCalledWith({
        where: { id: "pay-open" },
        data: { status: MarketplaceOrderPaymentStatus.EXPIRED },
      });
    });
  });

  describe("charge.refunded and charge.dispute.created", () => {
    it("transitions payment to REFUNDED on charge.refunded", async () => {
      mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
      mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue(null);

      const paidPayment = {
        id: "pay-refund",
        orderId: "ord-refund",
        status: MarketplaceOrderPaymentStatus.PAID,
        platformFeeAmount: "150000",
        refundedAt: null,
      };

      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(paidPayment);
      mockPrisma.marketplaceOrderPayment.findUniqueOrThrow.mockResolvedValue(paidPayment);

      const chargeObj = {
        id: "ch_123",
        payment_intent: "pi_ref_123",
        amount_refunded: 150000,
      };

      const payload = createEventPayload("charge.refunded", chargeObj, "evt_ref_1");
      const result = await service.handleWebhook(payload, "sig");

      expect(result.outcome).toBe(MarketplacePaymentEventOutcome.PROCESSED);
      expect(mockPrisma.marketplaceOrderPayment.update).toHaveBeenCalledWith({
        where: { id: "pay-refund" },
        data: expect.objectContaining({
          status: MarketplaceOrderPaymentStatus.REFUNDED,
          refundedAmount: "150000",
        }),
      });
    });

    it("transitions payment to DISPUTED on charge.dispute.created", async () => {
      mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
      mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue(null);

      const paidPayment = {
        id: "pay-disp",
        orderId: "ord-disp",
        status: MarketplaceOrderPaymentStatus.PAID,
      };

      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(paidPayment);

      const disputeObj = {
        id: "dp_123",
        payment_intent: "pi_disp_123",
      };

      const payload = createEventPayload("charge.dispute.created", disputeObj, "evt_disp_1");
      const result = await service.handleWebhook(payload, "sig");

      expect(result.outcome).toBe(MarketplacePaymentEventOutcome.PROCESSED);
      expect(mockPrisma.marketplaceOrderPayment.update).toHaveBeenCalledWith({
        where: { id: "pay-disp" },
        data: { status: MarketplaceOrderPaymentStatus.DISPUTED },
      });
    });

    it("records outcome IGNORED on unhandled event types", async () => {
      mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
      mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue(null);

      const payload = createEventPayload("customer.created", { id: "cus_123" }, "evt_cus_1");
      const result = await service.handleWebhook(payload, "sig");

      expect(result.outcome).toBe(MarketplacePaymentEventOutcome.IGNORED);
      expect(mockPrisma.marketplacePaymentProviderEvent.create).toHaveBeenCalledWith({
        data: {
          provider: "STRIPE",
          providerEventId: "evt_cus_1",
          eventType: "customer.created",
          outcome: MarketplacePaymentEventOutcome.IGNORED,
        },
      });
    });
  });
});
