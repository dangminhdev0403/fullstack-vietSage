import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { loadAppConfig, type AppConfig } from "../../../common/config/env.config";
import { AppLogger } from "../../../common/logging/app-logger.service";
import {
  ALLOWLISTED_PROVIDER_ERROR_CODES,
  STRIPE_API_BASE_URL,
  STRIPE_CHECKOUT_EXPIRY_SECONDS,
  getCheckoutSessionIdempotencyKey,
  getRefundIdempotencyKey,
} from "../domain/localmate-payment.constants";

export interface StripeCheckoutSessionResponse {
  id: string;
  url: string | null;
  expires_at: number;
  payment_status: string;
  status: string;
  payment_intent?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  client_reference_id?: string | null;
}

export interface StripeRefundResponse {
  id: string;
  amount: number;
  status: string;
  currency: string;
  payment_intent?: string | null;
}

export interface StripePaymentIntentResponse {
  id: string;
  currency: string;
  latest_charge: {
    id: string;
    amount_refunded: number;
  } | null;
}

export interface CreateCheckoutSessionParams {
  paymentId: string;
  orderId: string;
  platformFeeAmount: number | string;
  checkoutAttemptId?: string;
  returnBaseUrl?: string;
  expiresAtUnixSeconds?: number;
}

export interface CreateRefundParams {
  paymentIntentId: string;
  amountVnd: number | string;
  refundedAmountVnd?: number | string;
  paymentId: string;
  orderId: string;
  reason?: string;
}

@Injectable()
export class StripeClient {
  private readonly config: AppConfig;

  constructor(private readonly logger: AppLogger) {
    this.config = loadAppConfig();
  }

  private getSecretKey(): string {
    const key = this.config.stripe.secretKey;
    if (!key || key.trim().length === 0) {
      throw new ServiceUnavailableException("Stripe secret key is not configured");
    }
    return key.trim();
  }

  private sanitizeErrorCode(rawCode: unknown): string {
    if (typeof rawCode === "string" && ALLOWLISTED_PROVIDER_ERROR_CODES.has(rawCode)) {
      return rawCode;
    }
    return "unknown_provider_error";
  }

  async createCheckoutSession(
    params: CreateCheckoutSessionParams,
  ): Promise<StripeCheckoutSessionResponse> {
    if (!this.config.stripe.checkoutEnabled) {
      throw new ServiceUnavailableException("Stripe Checkout is currently disabled");
    }

    const secretKey = this.getSecretKey();
    const returnBaseUrl = params.returnBaseUrl || this.config.stripe.checkoutReturnBaseUrl;

    if (!returnBaseUrl) {
      throw new InternalServerErrorException("STRIPE_CHECKOUT_RETURN_BASE_URL is not configured");
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresAt = params.expiresAtUnixSeconds ?? nowSeconds + STRIPE_CHECKOUT_EXPIRY_SECONDS;

    const amountInt = Math.round(Number(params.platformFeeAmount));
    if (amountInt <= 0) {
      throw new InternalServerErrorException(
        "Platform fee amount must be a positive integer for Stripe Checkout",
      );
    }

    const body = new URLSearchParams();
    body.append("mode", "payment");
    body.append("currency", "vnd");
    body.append("line_items[0][price_data][currency]", "vnd");
    body.append("line_items[0][price_data][unit_amount]", String(amountInt));
    body.append(
      "line_items[0][price_data][product_data][name]",
      "LocalMate booking confirmation fee",
    );
    body.append("line_items[0][quantity]", "1");
    body.append("client_reference_id", params.orderId);
    body.append("metadata[orderId]", params.orderId);
    body.append("metadata[paymentId]", params.paymentId);
    body.append("metadata[schemaVersion]", "1");
    if (params.checkoutAttemptId) {
      body.append("metadata[checkoutAttemptId]", params.checkoutAttemptId);
    }
    body.append("expires_at", String(expiresAt));
    body.append("success_url", `${returnBaseUrl}/localmate/payment-return?result=success`);
    body.append("cancel_url", `${returnBaseUrl}/localmate/payment-return?result=cancelled`);

    const idempotencyKey = getCheckoutSessionIdempotencyKey(
      params.paymentId,
      params.checkoutAttemptId,
    );

    const response = await fetch(`${STRIPE_API_BASE_URL}/checkout/sessions`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Idempotency-Key": idempotencyKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorJson = (await response.json().catch(() => null)) as {
        error?: { code?: string; message?: string; type?: string };
      } | null;

      const errorCode = this.sanitizeErrorCode(errorJson?.error?.code);
      this.logger.error("Failed to create Stripe Checkout Session", {
        module: "localmate-payments",
        service: "StripeClient",
        operation: "createCheckoutSession",
        event: "STRIPE_CHECKOUT_CREATION_FAILED",
        orderId: params.orderId,
        paymentId: params.paymentId,
        errorCode,
        httpStatus: response.status,
      });

      throw new ServiceUnavailableException({
        message: "Stripe Checkout Session creation failed",
        errorCode,
      });
    }

    const data = (await response.json()) as StripeCheckoutSessionResponse;
    return {
      id: data.id,
      url: data.url,
      expires_at: data.expires_at,
      payment_status: data.payment_status,
      status: data.status,
      payment_intent: data.payment_intent,
      amount_total: data.amount_total,
      currency: data.currency,
      client_reference_id: data.client_reference_id,
    };
  }

  async getCheckoutSession(sessionId: string): Promise<StripeCheckoutSessionResponse> {
    const secretKey = this.getSecretKey();

    const response = await fetch(
      `${STRIPE_API_BASE_URL}/checkout/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: "GET",
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
      },
    );

    if (!response.ok) {
      const errorJson = (await response.json().catch(() => null)) as {
        error?: { code?: string; message?: string };
      } | null;
      const errorCode = this.sanitizeErrorCode(errorJson?.error?.code);
      throw new ServiceUnavailableException({
        message: "Failed to retrieve Stripe Checkout Session",
        errorCode,
      });
    }

    const data = (await response.json()) as StripeCheckoutSessionResponse;
    return {
      id: data.id,
      url: data.url,
      expires_at: data.expires_at,
      payment_status: data.payment_status,
      status: data.status,
      payment_intent: data.payment_intent,
      amount_total: data.amount_total,
      currency: data.currency,
      client_reference_id: data.client_reference_id,
    };
  }

  async expireCheckoutSession(sessionId: string): Promise<StripeCheckoutSessionResponse> {
    const secretKey = this.getSecretKey();

    const response = await fetch(
      `${STRIPE_API_BASE_URL}/checkout/sessions/${encodeURIComponent(sessionId)}/expire`,
      {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
      },
    );

    if (!response.ok) {
      const errorJson = (await response.json().catch(() => null)) as {
        error?: { code?: string; message?: string };
      } | null;
      const errorCode = this.sanitizeErrorCode(errorJson?.error?.code);
      throw new ServiceUnavailableException({
        message: "Failed to expire Stripe Checkout Session",
        errorCode,
      });
    }

    return (await response.json()) as StripeCheckoutSessionResponse;
  }

  async getPaymentIntent(paymentIntentId: string): Promise<StripePaymentIntentResponse> {
    const secretKey = this.getSecretKey();
    const query = new URLSearchParams({ "expand[]": "latest_charge" });
    const response = await fetch(
      `${STRIPE_API_BASE_URL}/payment_intents/${encodeURIComponent(paymentIntentId)}?${query}`,
      {
        method: "GET",
        signal: AbortSignal.timeout(10_000),
        headers: { Authorization: ["Bearer", secretKey].join(" ") },
      },
    );

    if (!response.ok) {
      const errorJson = (await response.json().catch(() => null)) as {
        error?: { code?: string };
      } | null;
      throw new ServiceUnavailableException({
        message: "Failed to retrieve Stripe PaymentIntent",
        errorCode: this.sanitizeErrorCode(errorJson?.error?.code),
      });
    }

    const data = (await response.json()) as StripePaymentIntentResponse;
    return {
      id: data.id,
      currency: data.currency,
      latest_charge: data.latest_charge
        ? {
            id: data.latest_charge.id,
            amount_refunded: data.latest_charge.amount_refunded,
          }
        : null,
    };
  }

  async createRefund(params: CreateRefundParams): Promise<StripeRefundResponse> {
    const secretKey = this.getSecretKey();
    const amountInt = Math.round(Number(params.amountVnd));

    const body = new URLSearchParams();
    body.append("payment_intent", params.paymentIntentId);
    body.append("amount", String(amountInt));
    body.append("metadata[paymentId]", params.paymentId);
    body.append("metadata[orderId]", params.orderId);
    if (params.reason) {
      body.append("metadata[reasonCode]", params.reason);
    }

    const idempotencyKey = getRefundIdempotencyKey(params.paymentId, params.refundedAmountVnd);

    const response = await fetch(`${STRIPE_API_BASE_URL}/refunds`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Idempotency-Key": idempotencyKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorJson = (await response.json().catch(() => null)) as {
        error?: { code?: string; message?: string };
      } | null;
      const errorCode = this.sanitizeErrorCode(errorJson?.error?.code);
      this.logger.error("Failed to process Stripe refund", {
        module: "localmate-payments",
        service: "StripeClient",
        operation: "createRefund",
        event: "STRIPE_REFUND_FAILED",
        orderId: params.orderId,
        paymentId: params.paymentId,
        errorCode,
        httpStatus: response.status,
      });

      throw new ServiceUnavailableException({
        message: "Stripe refund failed",
        errorCode,
      });
    }

    const data = (await response.json()) as StripeRefundResponse;
    return {
      id: data.id,
      amount: data.amount,
      status: data.status,
      currency: data.currency,
      payment_intent: data.payment_intent,
    };
  }
}
