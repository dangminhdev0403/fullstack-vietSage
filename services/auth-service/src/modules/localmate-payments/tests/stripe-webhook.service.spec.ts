import { BadRequestException } from "@nestjs/common";
import { StripeWebhookService } from "../application/stripe-webhook.service";
import { StripeSignatureVerifier } from "../infrastructure/stripe-signature.verifier";
import { AppLogger } from "../../../common/logging/app-logger.service";
import {
  MarketplaceOrderPaymentStatus,
  MarketplaceGuideNotificationStatus,
  MarketplacePaymentEventOutcome,
  MarketplaceOrderStatus,
  CapacityReservationStatus,
  MarketplaceOrderActorType,
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
      marketplaceOrder: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      marketplaceOrderItem: {
        findMany: jest.fn(),
      },
      marketplaceService: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      marketplaceOrderEvent: {
        create: jest.fn(),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(async (cb) => {
        return cb(mockPrisma);
      }),
    };

    mockVerifier = {
      verify: jest.fn(),
    };

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

    const payload = createEventPayload("checkout.session.completed", { id: "cs_1" }, "evt_dup_1");

    const result = await service.handleWebhook(payload, "sig-header");

    expect(result).toEqual({
      received: true,
      duplicate: true,
      outcome: MarketplacePaymentEventOutcome.PROCESSED,
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("treats a concurrent provider-event unique conflict as a duplicate", async () => {
    mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
    mockPrisma.marketplacePaymentProviderEvent.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        providerEventId: "evt_race",
        outcome: MarketplacePaymentEventOutcome.PROCESSED,
      });
    mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue({
      id: "pay-race",
      orderId: "ord-race",
      currency: "VND",
      platformFeeAmount: "150000",
      status: MarketplaceOrderPaymentStatus.OPEN,
      providerCheckoutSessionId: "cs_race",
    });
    mockPrisma.$transaction.mockRejectedValueOnce({ code: "P2002" });

    const payload = createEventPayload(
      "checkout.session.completed",
      {
        id: "cs_race",
        payment_status: "paid",
        currency: "vnd",
        amount_total: 150000,
        client_reference_id: "ord-race",
        payment_intent: "pi_race",
        metadata: { paymentId: "pay-race", orderId: "ord-race" },
      },
      "evt_race",
    );

    await expect(service.handleWebhook(payload, "sig")).resolves.toEqual({
      received: true,
      duplicate: true,
      outcome: MarketplacePaymentEventOutcome.PROCESSED,
    });
  });

  describe("checkout.session.completed / paid handling", () => {
    const mockPayment = {
      id: "pay-100",
      orderId: "ord-100",
      currency: "VND",
      platformFeeAmount: "150000",
      status: MarketplaceOrderPaymentStatus.OPEN,
      providerCheckoutSessionId: "cs_valid",
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
        id: "cs_valid",
        payment_status: "paid",
        currency: "usd", // Mismatch: DB has VND
        amount_total: 150000,
        client_reference_id: "ord-100",
        metadata: { paymentId: "pay-100" },
      };

      const payload = createEventPayload(
        "checkout.session.completed",
        sessionObj,
        "evt_mismatch_curr",
      );
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
        id: "cs_valid",
        payment_status: "paid",
        currency: "vnd",
        amount_total: 99999, // Mismatch: DB has 150000
        client_reference_id: "ord-100",
        metadata: { paymentId: "pay-100" },
      };

      const payload = createEventPayload(
        "checkout.session.completed",
        sessionObj,
        "evt_mismatch_amt",
      );
      const result = await service.handleWebhook(payload, "sig");

      expect(result.outcome).toBe(MarketplacePaymentEventOutcome.REJECTED);
      expect(result.reason).toBe("amount_or_currency_mismatch");
    });

    it("rejects event when client_reference_id does not match order ID", async () => {
      mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
      mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue(null);
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(mockPayment);

      const sessionObj = {
        id: "cs_valid",
        payment_status: "paid",
        currency: "vnd",
        amount_total: 150000,
        client_reference_id: "different-order-id",
        metadata: { paymentId: "pay-100" },
      };

      const payload = createEventPayload(
        "checkout.session.completed",
        sessionObj,
        "evt_mismatch_order",
      );
      const result = await service.handleWebhook(payload, "sig");

      expect(result.outcome).toBe(MarketplacePaymentEventOutcome.REJECTED);
    });

    it("rejects a paid event when client_reference_id is missing", async () => {
      mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
      mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue(null);
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(mockPayment);
      mockPrisma.marketplaceOrderPayment.findUniqueOrThrow.mockResolvedValue(mockPayment);

      const payload = createEventPayload(
        "checkout.session.completed",
        {
          id: "cs_valid",
          payment_status: "paid",
          currency: "vnd",
          amount_total: 150000,
          payment_intent: "pi_missing_order",
          metadata: { paymentId: "pay-100" },
        },
        "evt_missing_order",
      );

      const result = await service.handleWebhook(payload, "sig");

      expect(result.outcome).toBe(MarketplacePaymentEventOutcome.REJECTED);
      expect(mockPrisma.marketplaceOrderPayment.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: MarketplaceOrderPaymentStatus.PAID }),
        }),
      );
    });

    it("rejects event when payment_status is unpaid", async () => {
      mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
      mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue(null);
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(mockPayment);

      const sessionObj = {
        id: "cs_valid",
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

    it("rejects a paid event for a stale Checkout Session ID", async () => {
      mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
      mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue(null);
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue({
        ...mockPayment,
        providerCheckoutSessionId: "cs_current",
      });

      const payload = createEventPayload(
        "checkout.session.completed",
        {
          id: "cs_stale",
          payment_status: "paid",
          currency: "vnd",
          amount_total: 150000,
          client_reference_id: "ord-100",
          payment_intent: "pi_stale",
          metadata: { paymentId: "pay-100", orderId: "ord-100" },
        },
        "evt_stale_session",
      );

      const result = await service.handleWebhook(payload, "sig");

      expect(result.outcome).toBe(MarketplacePaymentEventOutcome.REJECTED);
      expect(result.reason).toBe("checkout_session_mismatch");
      expect(mockPrisma.marketplaceOrderPayment.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: MarketplaceOrderPaymentStatus.PAID }),
        }),
      );
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
        providerCheckoutSessionId: "cs_expired",
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

    it("releases still-PENDING order reservation and increments capacity exactly once when checkout.session.expired arrives", async () => {
      mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
      mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue(null);

      const openPayment = {
        id: "pay-open-2",
        orderId: "ord-pending-1",
        status: MarketplaceOrderPaymentStatus.OPEN,
        providerCheckoutSessionId: "cs_expired_2",
      };

      const pendingOrder = {
        id: "ord-pending-1",
        status: MarketplaceOrderStatus.PENDING,
        version: 1,
        capacityReservationStatus: CapacityReservationStatus.RESERVED,
        serviceId: "svc-1",
        quantity: 2,
        items: [{ serviceId: "svc-1", quantity: 2 }],
      };

      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(openPayment);
      mockPrisma.marketplaceOrderPayment.findUniqueOrThrow.mockResolvedValue(openPayment);
      mockPrisma.marketplaceOrder.findUnique.mockResolvedValue(pendingOrder);
      mockPrisma.marketplaceOrder.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.marketplaceOrderItem.findMany.mockResolvedValue([
        { serviceId: "svc-1", quantity: 2 },
      ]);
      mockPrisma.marketplaceService.findUnique.mockResolvedValue({
        id: "svc-1",
        capacityAvailable: 3,
      });

      const sessionObj = {
        id: "cs_expired_2",
        metadata: { paymentId: "pay-open-2" },
      };

      const payload = createEventPayload("checkout.session.expired", sessionObj, "evt_exp_2");
      const result = await service.handleWebhook(payload, "sig");

      expect(result.outcome).toBe(MarketplacePaymentEventOutcome.PROCESSED);
      expect(mockPrisma.marketplaceOrderPayment.update).toHaveBeenCalledWith({
        where: { id: "pay-open-2" },
        data: { status: MarketplaceOrderPaymentStatus.EXPIRED },
      });
      expect(mockPrisma.marketplaceOrder.updateMany).toHaveBeenCalledWith({
        where: {
          id: "ord-pending-1",
          status: MarketplaceOrderStatus.PENDING,
          version: 1,
        },
        data: expect.objectContaining({
          status: MarketplaceOrderStatus.CANCELLED,
          capacityReservationStatus: CapacityReservationStatus.RELEASED,
        }),
      });
      expect(mockPrisma.marketplaceService.update).toHaveBeenCalledWith({
        where: { id: "svc-1" },
        data: {
          capacityAvailable: { increment: 2 },
          version: { increment: 1 },
        },
      });
      expect(mockPrisma.marketplaceOrderEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: "ord-pending-1",
          actorType: MarketplaceOrderActorType.SYSTEM,
          fromStatus: MarketplaceOrderStatus.PENDING,
          toStatus: MarketplaceOrderStatus.CANCELLED,
        }),
      });
    });

    it("does not increment capacity on replay or concurrency conflict when updateMany count is 0", async () => {
      mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
      mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue(null);

      const openPayment = {
        id: "pay-open-conflict",
        orderId: "ord-pending-conflict",
        status: MarketplaceOrderPaymentStatus.OPEN,
        providerCheckoutSessionId: "cs_expired_conflict",
      };

      const pendingOrder = {
        id: "ord-pending-conflict",
        status: MarketplaceOrderStatus.PENDING,
        version: 1,
        capacityReservationStatus: CapacityReservationStatus.RESERVED,
        serviceId: "svc-1",
        quantity: 1,
        items: [{ serviceId: "svc-1", quantity: 1 }],
      };

      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(openPayment);
      mockPrisma.marketplaceOrderPayment.findUniqueOrThrow.mockResolvedValue(openPayment);
      mockPrisma.marketplaceOrder.findUnique.mockResolvedValue(pendingOrder);
      // Raced or replayed -> count 0
      mockPrisma.marketplaceOrder.updateMany.mockResolvedValue({ count: 0 });

      const sessionObj = {
        id: "cs_expired_conflict",
        metadata: { paymentId: "pay-open-conflict" },
      };

      const payload = createEventPayload(
        "checkout.session.expired",
        sessionObj,
        "evt_exp_conflict",
      );
      const result = await service.handleWebhook(payload, "sig");

      expect(result.outcome).toBe(MarketplacePaymentEventOutcome.PROCESSED);
      expect(mockPrisma.marketplaceService.update).not.toHaveBeenCalled();
      expect(mockPrisma.marketplaceOrderEvent.create).not.toHaveBeenCalled();
    });

    it("never cancels order or releases capacity if order is already ACKNOWLEDGED when checkout.session.expired arrives", async () => {
      mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
      mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue(null);

      const openPayment = {
        id: "pay-open-ack",
        orderId: "ord-ack",
        status: MarketplaceOrderPaymentStatus.OPEN,
        providerCheckoutSessionId: "cs_expired_ack",
      };

      const ackOrder = {
        id: "ord-ack",
        status: MarketplaceOrderStatus.ACKNOWLEDGED,
        version: 2,
        capacityReservationStatus: CapacityReservationStatus.RESERVED,
      };

      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(openPayment);
      mockPrisma.marketplaceOrderPayment.findUniqueOrThrow.mockResolvedValue(openPayment);
      mockPrisma.marketplaceOrder.findUnique.mockResolvedValue(ackOrder);

      const sessionObj = {
        id: "cs_expired_ack",
        metadata: { paymentId: "pay-open-ack" },
      };

      const payload = createEventPayload("checkout.session.expired", sessionObj, "evt_exp_ack");
      const result = await service.handleWebhook(payload, "sig");

      expect(result.outcome).toBe(MarketplacePaymentEventOutcome.PROCESSED);
      expect(mockPrisma.marketplaceOrder.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.marketplaceService.update).not.toHaveBeenCalled();
    });

    it("does not regress REFUND_PENDING when a late paid event arrives", async () => {
      mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
      mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue(null);
      const payment = {
        id: "pay-refund-pending",
        orderId: "ord-refund-pending",
        currency: "VND",
        platformFeeAmount: "150000",
        status: MarketplaceOrderPaymentStatus.REFUND_PENDING,
        providerCheckoutSessionId: "cs_refund_pending",
        providerPaymentIntentId: "pi_refund_pending",
        paidAt: new Date("2026-10-01T00:00:00Z"),
      };
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(payment);
      mockPrisma.marketplaceOrderPayment.findUniqueOrThrow.mockResolvedValue(payment);

      const payload = createEventPayload(
        "checkout.session.completed",
        {
          id: "cs_refund_pending",
          payment_status: "paid",
          currency: "vnd",
          amount_total: 150000,
          client_reference_id: "ord-refund-pending",
          payment_intent: "pi_refund_pending",
          metadata: { paymentId: payment.id, orderId: payment.orderId },
        },
        "evt_late_paid_refund_pending",
      );

      await service.handleWebhook(payload, "sig");
      expect(mockPrisma.marketplaceOrderPayment.update).not.toHaveBeenCalled();
    });

    it("moves a cancelled current-session payment to REFUND_PENDING when paid arrives late", async () => {
      mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
      mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue(null);
      const payment = {
        id: "pay-cancelled-paid",
        orderId: "ord-cancelled-paid",
        currency: "VND",
        platformFeeAmount: "150000",
        status: MarketplaceOrderPaymentStatus.CANCELLED,
        providerCheckoutSessionId: "cs_cancelled_paid",
        providerPaymentIntentId: null,
        paidAt: null,
      };
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(payment);
      mockPrisma.marketplaceOrderPayment.findUniqueOrThrow.mockResolvedValue(payment);

      const payload = createEventPayload(
        "checkout.session.completed",
        {
          id: "cs_cancelled_paid",
          payment_status: "paid",
          currency: "vnd",
          amount_total: 150000,
          client_reference_id: payment.orderId,
          payment_intent: "pi_cancelled_paid",
          metadata: { paymentId: payment.id, orderId: payment.orderId },
        },
        "evt_cancelled_paid",
      );

      await service.handleWebhook(payload, "sig");

      expect(mockPrisma.marketplaceOrderPayment.update).toHaveBeenCalledWith({
        where: { id: payment.id },
        data: expect.objectContaining({
          status: MarketplaceOrderPaymentStatus.REFUND_PENDING,
          providerPaymentIntentId: "pi_cancelled_paid",
          refundReasonCode: "PAYMENT_COMPLETED_AFTER_CANCELLATION",
          refundNextAttemptAt: expect.any(Date),
        }),
      });
    });

    it("moves an expired payment to REFUND_PENDING when paid arrives after its order was cancelled", async () => {
      mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
      mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue(null);
      const payment = {
        id: "pay-expired-late-paid",
        orderId: "ord-expired-cancelled",
        currency: "VND",
        platformFeeAmount: "150000",
        status: MarketplaceOrderPaymentStatus.EXPIRED,
        providerCheckoutSessionId: "cs_expired_late_paid",
        providerPaymentIntentId: null,
        paidAt: null,
      };
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(payment);
      mockPrisma.marketplaceOrderPayment.findUniqueOrThrow.mockResolvedValue(payment);
      mockPrisma.marketplaceOrder.findUnique.mockResolvedValue({
        id: payment.orderId,
        status: MarketplaceOrderStatus.CANCELLED,
      });

      const payload = createEventPayload(
        "checkout.session.completed",
        {
          id: payment.providerCheckoutSessionId,
          payment_status: "paid",
          currency: "vnd",
          amount_total: 150000,
          client_reference_id: payment.orderId,
          payment_intent: "pi_expired_late_paid",
          metadata: { paymentId: payment.id, orderId: payment.orderId },
        },
        "evt_expired_late_paid",
      );

      await service.handleWebhook(payload, "sig");

      expect(mockPrisma.marketplaceOrderPayment.update).toHaveBeenCalledWith({
        where: { id: payment.id },
        data: expect.objectContaining({
          status: MarketplaceOrderPaymentStatus.REFUND_PENDING,
          providerPaymentIntentId: "pi_expired_late_paid",
          guideNotificationStatus: MarketplaceGuideNotificationStatus.BLOCKED,
          refundReasonCode: "PAYMENT_COMPLETED_AFTER_CANCELLATION",
          refundNextAttemptAt: expect.any(Date),
        }),
      });
    });

    it("does not regress REFUND_PENDING when a late failed event arrives", async () => {
      mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
      mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue(null);
      const payment = {
        id: "pay-refund-pending",
        orderId: "ord-refund-pending",
        status: MarketplaceOrderPaymentStatus.REFUND_PENDING,
      };
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(payment);
      mockPrisma.marketplaceOrderPayment.findUniqueOrThrow.mockResolvedValue(payment);

      const payload = createEventPayload(
        "checkout.session.async_payment_failed",
        {
          id: "cs_refund_pending",
          metadata: { paymentId: payment.id, orderId: payment.orderId },
        },
        "evt_late_failed_refund_pending",
      );

      await service.handleWebhook(payload, "sig");
      expect(mockPrisma.marketplaceOrderPayment.update).not.toHaveBeenCalled();
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
        currency: "VND",
        platformFeeAmount: "150000",
        refundedAt: null,
      };

      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(paidPayment);
      mockPrisma.marketplaceOrderPayment.findUniqueOrThrow.mockResolvedValue(paidPayment);

      const chargeObj = {
        id: "ch_123",
        payment_intent: "pi_ref_123",
        amount_refunded: 150000,
        currency: "vnd",
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

    it("keeps REFUND_PENDING when Stripe reports only a partial refund", async () => {
      mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
      mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue(null);
      const payment = {
        id: "pay-partial-refund",
        orderId: "ord-partial-refund",
        status: MarketplaceOrderPaymentStatus.REFUND_PENDING,
        currency: "VND",
        platformFeeAmount: "150000",
        refundedAt: null,
      };
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(payment);
      mockPrisma.marketplaceOrderPayment.findUniqueOrThrow.mockResolvedValue(payment);

      const payload = createEventPayload(
        "charge.refunded",
        {
          id: "ch_partial",
          payment_intent: "pi_partial",
          amount_refunded: 50000,
          currency: "vnd",
        },
        "evt_partial_refund",
      );

      await service.handleWebhook(payload, "sig");

      expect(mockPrisma.marketplaceOrderPayment.update).toHaveBeenCalledWith({
        where: { id: payment.id },
        data: expect.objectContaining({
          status: MarketplaceOrderPaymentStatus.REFUND_PENDING,
          refundedAmount: "50000",
          lastProviderErrorCode: "partial_refund",
        }),
      });
    });

    it("rejects a refund event with a non-VND currency", async () => {
      mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
      mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue(null);
      const payment = {
        id: "pay-refund-currency",
        orderId: "ord-refund-currency",
        status: MarketplaceOrderPaymentStatus.REFUND_PENDING,
        currency: "VND",
        platformFeeAmount: "150000",
        refundedAt: null,
      };
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(payment);
      mockPrisma.marketplaceOrderPayment.findUniqueOrThrow.mockResolvedValue(payment);

      const result = await service.handleWebhook(
        createEventPayload(
          "charge.refunded",
          { payment_intent: "pi_currency", amount_refunded: 150000, currency: "usd" },
          "evt_refund_currency",
        ),
        "sig",
      );

      expect(result.outcome).toBe(MarketplacePaymentEventOutcome.REJECTED);
      expect(result.reason).toBe("amount_or_currency_mismatch");
    });

    it("rejects a refund amount larger than the payment snapshot", async () => {
      mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
      mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue(null);
      const payment = {
        id: "pay-invalid-refund",
        orderId: "ord-invalid-refund",
        status: MarketplaceOrderPaymentStatus.REFUND_PENDING,
        currency: "VND",
        platformFeeAmount: "150000",
        refundedAt: null,
      };
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(payment);
      mockPrisma.marketplaceOrderPayment.findUniqueOrThrow.mockResolvedValue(payment);

      const result = await service.handleWebhook(
        createEventPayload(
          "charge.refunded",
          { payment_intent: "pi_invalid", amount_refunded: 200000, currency: "vnd" },
          "evt_invalid_refund",
        ),
        "sig",
      );

      expect(result.outcome).toBe(MarketplacePaymentEventOutcome.REJECTED);
      expect(result.reason).toBe("amount_or_currency_mismatch");
      expect(mockPrisma.marketplaceOrderPayment.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ refundedAmount: "200000" }),
        }),
      );
    });

    it("does not regress DISPUTED when a late refund event arrives", async () => {
      mockVerifier.verify.mockReturnValue({ verified: true, timestamp: 123 });
      mockPrisma.marketplacePaymentProviderEvent.findUnique.mockResolvedValue(null);
      const payment = {
        id: "pay-disputed-refund",
        orderId: "ord-disputed-refund",
        status: MarketplaceOrderPaymentStatus.DISPUTED,
        currency: "VND",
        platformFeeAmount: "150000",
        refundedAt: null,
      };
      mockPrisma.marketplaceOrderPayment.findUnique.mockResolvedValue(payment);
      mockPrisma.marketplaceOrderPayment.findUniqueOrThrow.mockResolvedValue(payment);

      await service.handleWebhook(
        createEventPayload(
          "charge.refunded",
          { payment_intent: "pi_disputed", amount_refunded: 150000, currency: "vnd" },
          "evt_disputed_refund",
        ),
        "sig",
      );

      expect(mockPrisma.marketplaceOrderPayment.update).not.toHaveBeenCalled();
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
