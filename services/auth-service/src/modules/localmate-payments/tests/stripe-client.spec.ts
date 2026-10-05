import { InternalServerErrorException, ServiceUnavailableException } from "@nestjs/common";
import { StripeClient } from "../infrastructure/stripe-client";
import { AppLogger } from "../../../common/logging/app-logger.service";

describe("StripeClient", () => {
  let client: StripeClient;
  let mockLogger: jest.Mocked<AppLogger>;
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any;

    process.env.STRIPE_CHECKOUT_ENABLED = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_mock_secret_key_12345";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock_webhook_secret_12345";
    process.env.STRIPE_CHECKOUT_RETURN_BASE_URL = "https://app.vietsage.com";

    client = new StripeClient(mockLogger);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("createCheckoutSession", () => {
    it("creates a checkout session with VND zero-decimal amount and correct idempotency key", async () => {
      let capturedUrl = "";
      let capturedOptions: any = null;

      global.fetch = jest.fn().mockImplementation(async (url, options) => {
        capturedUrl = String(url);
        capturedOptions = options;
        return {
          ok: true,
          json: async () => ({
            id: "cs_test_123",
            url: "https://checkout.stripe.com/pay/cs_test_123",
            expires_at: 1700001800,
            payment_status: "unpaid",
            status: "open",
            client_reference_id: "order-456",
          }),
        };
      });

      const result = await client.createCheckoutSession({
        paymentId: "pay-123",
        orderId: "order-456",
        platformFeeAmount: "150000",
        expiresAtUnixSeconds: 1700001800,
      });

      expect(capturedUrl).toBe("https://api.stripe.com/v1/checkout/sessions");
      expect(capturedOptions.method).toBe("POST");
      expect(capturedOptions.headers["Authorization"]).toBe("Bearer sk_test_mock_secret_key_12345");
      expect(capturedOptions.headers["Idempotency-Key"]).toBe("localmate:pay-123:checkout:v1");
      expect(capturedOptions.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
      expect(capturedOptions.signal).toBeInstanceOf(AbortSignal);

      const bodyParams = new URLSearchParams(capturedOptions.body);
      expect(bodyParams.get("mode")).toBe("payment");
      expect(bodyParams.get("currency")).toBe("vnd");
      expect(bodyParams.get("line_items[0][price_data][currency]")).toBe("vnd");
      // Zero-decimal: integer VND amount without multiplying by 100
      expect(bodyParams.get("line_items[0][price_data][unit_amount]")).toBe("150000");
      expect(bodyParams.get("client_reference_id")).toBe("order-456");
      expect(bodyParams.get("metadata[paymentId]")).toBe("pay-123");
      expect(bodyParams.get("metadata[orderId]")).toBe("order-456");
      expect(bodyParams.get("metadata[schemaVersion]")).toBe("1");
      expect(bodyParams.get("expires_at")).toBe("1700001800");
      expect(bodyParams.get("success_url")).toBe(
        "https://app.vietsage.com/localmate/payment-return?result=success",
      );
      expect(bodyParams.get("cancel_url")).toBe(
        "https://app.vietsage.com/localmate/payment-return?result=cancelled",
      );

      expect(result.id).toBe("cs_test_123");
      expect(result.url).toBe("https://checkout.stripe.com/pay/cs_test_123");
      expect(result.payment_status).toBe("unpaid");
    });

    it("throws ServiceUnavailableException when provider is disabled", async () => {
      process.env.STRIPE_CHECKOUT_ENABLED = "false";
      const disabledClient = new StripeClient(mockLogger);

      await expect(
        disabledClient.createCheckoutSession({
          paymentId: "pay-123",
          orderId: "order-456",
          platformFeeAmount: 50000,
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it("redacts raw provider errors and maps allowlisted code", async () => {
      global.fetch = jest.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            error: {
              code: "parameter_invalid_empty",
              message: "Missing parameter: secret cards xyz",
              type: "invalid_request_error",
            },
          }),
        };
      });

      await expect(
        client.createCheckoutSession({
          paymentId: "pay-err",
          orderId: "order-err",
          platformFeeAmount: 50000,
        }),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to create Stripe Checkout Session",
        expect.objectContaining({
          errorCode: "parameter_invalid_empty",
          paymentId: "pay-err",
          orderId: "order-err",
        }),
      );
    });

    it("uses a distinct idempotency key for a replacement Checkout Session", async () => {
      let capturedOptions: any = null;
      global.fetch = jest.fn().mockImplementation(async (_url, options) => {
        capturedOptions = options;
        return {
          ok: true,
          json: async () => ({
            id: "cs_retry",
            url: "https://checkout.stripe.com/pay/cs_retry",
            expires_at: 1_900_000_000,
            payment_status: "unpaid",
            status: "open",
          }),
        };
      });

      await client.createCheckoutSession({
        paymentId: "pay-123",
        orderId: "order-456",
        platformFeeAmount: "150000",
        checkoutAttemptId: "cs_expired_old",
      });

      expect(capturedOptions.headers["Idempotency-Key"]).toBe(
        "localmate:pay-123:checkout:cs_expired_old",
      );
      expect(new URLSearchParams(capturedOptions.body).get("metadata[checkoutAttemptId]")).toBe(
        "cs_expired_old",
      );
    });

    it("maps unknown error code to unknown_provider_error without leaking message", async () => {
      global.fetch = jest.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 500,
          json: async () => ({
            error: {
              code: "internal_sensitive_stripe_database_down",
              message: "database host 10.0.0.1 failed",
            },
          }),
        };
      });

      try {
        await client.createCheckoutSession({
          paymentId: "pay-500",
          orderId: "order-500",
          platformFeeAmount: 50000,
        });
        fail("Expected exception");
      } catch (err: any) {
        expect(err.response?.errorCode).toBe("unknown_provider_error");
        expect(JSON.stringify(err)).not.toContain("10.0.0.1");
        expect(JSON.stringify(err)).not.toContain("sk_test_mock_secret_key_12345");
      }
    });
  });

  describe("getCheckoutSession", () => {
    it("retrieves checkout session by session id", async () => {
      global.fetch = jest.fn().mockImplementation(async (url) => {
        expect(String(url)).toBe("https://api.stripe.com/v1/checkout/sessions/cs_123");
        return {
          ok: true,
          json: async () => ({
            id: "cs_123",
            payment_status: "paid",
            status: "complete",
            amount_total: 150000,
            currency: "vnd",
            payment_intent: "pi_789",
          }),
        };
      });

      const session = await client.getCheckoutSession("cs_123");
      expect(session.id).toBe("cs_123");
      expect(session.payment_status).toBe("paid");
      expect(session.payment_intent).toBe("pi_789");
    });
  });

  describe("expireCheckoutSession", () => {
    it("calls expire endpoint for session id", async () => {
      global.fetch = jest.fn().mockImplementation(async (url, options) => {
        expect(String(url)).toBe("https://api.stripe.com/v1/checkout/sessions/cs_123/expire");
        expect(options.method).toBe("POST");
        return {
          ok: true,
          json: async () => ({
            id: "cs_123",
            status: "expired",
          }),
        };
      });

      const session = await client.expireCheckoutSession("cs_123");
      expect(session.status).toBe("expired");
    });
  });

  describe("getPaymentIntent", () => {
    it("retrieves the latest charge refund total", async () => {
      global.fetch = jest.fn().mockImplementation(async (url, options) => {
        expect(String(url)).toBe(
          "https://api.stripe.com/v1/payment_intents/pi_refund?expand%5B%5D=latest_charge",
        );
        expect(options.method).toBe("GET");
        return {
          ok: true,
          json: async () => ({
            id: "pi_refund",
            currency: "vnd",
            latest_charge: { id: "ch_refund", amount_refunded: 150000 },
          }),
        };
      });

      await expect(client.getPaymentIntent("pi_refund")).resolves.toEqual({
        id: "pi_refund",
        currency: "vnd",
        latest_charge: { id: "ch_refund", amount_refunded: 150000 },
      });
    });
  });

  describe("createRefund", () => {
    it("creates a refund with idempotency key and VND amount", async () => {
      let capturedOptions: any = null;

      global.fetch = jest.fn().mockImplementation(async (url, options) => {
        expect(String(url)).toBe("https://api.stripe.com/v1/refunds");
        capturedOptions = options;
        return {
          ok: true,
          json: async () => ({
            id: "re_123",
            amount: 150000,
            status: "succeeded",
            currency: "vnd",
            payment_intent: "pi_789",
          }),
        };
      });

      const refund = await client.createRefund({
        paymentIntentId: "pi_789",
        amountVnd: "150000",
        paymentId: "pay-ref",
        orderId: "order-ref",
        reason: "GUIDE_REJECTED",
      });

      expect(capturedOptions.headers["Idempotency-Key"]).toBe("localmate:pay-ref:refund:v1");
      const bodyParams = new URLSearchParams(capturedOptions.body);
      expect(bodyParams.get("payment_intent")).toBe("pi_789");
      expect(bodyParams.get("amount")).toBe("150000");
      expect(bodyParams.get("metadata[paymentId]")).toBe("pay-ref");
      expect(bodyParams.get("metadata[orderId]")).toBe("order-ref");
      expect(bodyParams.get("metadata[reasonCode]")).toBe("GUIDE_REJECTED");
      expect(bodyParams.get("reason")).toBeNull();

      expect(refund.id).toBe("re_123");
      expect(refund.status).toBe("succeeded");
    });

    it("uses the refunded snapshot to identify a remaining refund request", async () => {
      let capturedOptions: any = null;
      global.fetch = jest.fn().mockImplementation(async (_url, options) => {
        capturedOptions = options;
        return {
          ok: true,
          json: async () => ({
            id: "re_remaining",
            amount: 100000,
            status: "pending",
            currency: "vnd",
            payment_intent: "pi_partial",
          }),
        };
      });

      await client.createRefund({
        paymentIntentId: "pi_partial",
        amountVnd: "100000",
        refundedAmountVnd: "50000",
        paymentId: "pay-partial",
        orderId: "order-partial",
      });

      expect(capturedOptions.headers["Idempotency-Key"]).toBe("localmate:pay-partial:refund:50000");
    });
  });
});
