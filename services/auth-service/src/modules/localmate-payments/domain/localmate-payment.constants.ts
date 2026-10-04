export const STRIPE_SIGNATURE_HEADER = "stripe-signature";
export const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300;
export const STRIPE_API_BASE_URL = "https://api.stripe.com/v1";
export const LOCALMATE_DEFAULT_PAYMENT_CURRENCY = "VND";
export const STRIPE_CHECKOUT_EXPIRY_SECONDS = 1800; // 30 minutes

export const getCheckoutSessionIdempotencyKey = (paymentId: string): string =>
  `localmate:${paymentId}:checkout:v1`;

export const getRefundIdempotencyKey = (paymentId: string): string =>
  `localmate:${paymentId}:refund:v1`;

export const HANDLED_STRIPE_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
  "charge.dispute.created",
] as const;

export type HandledStripeWebhookEvent = (typeof HANDLED_STRIPE_WEBHOOK_EVENTS)[number];

export const ALLOWLISTED_PROVIDER_ERROR_CODES = new Set([
  "parameter_invalid_empty",
  "parameter_invalid_integer",
  "parameter_invalid_string",
  "parameter_missing",
  "parameter_unknown",
  "resource_missing",
  "resource_already_exists",
  "payment_intent_unexpected_state",
  "payment_intent_incompatible_payment_method",
  "charge_already_refunded",
  "amount_too_large",
  "amount_too_small",
  "currency_mismatch",
  "rate_limit",
  "api_connection_error",
  "authentication_error",
  "invalid_request_error",
  "api_error",
  "card_declined",
  "expired_card",
  "insufficient_funds",
  "amount_or_currency_mismatch",
  "provider_disabled",
  "unknown_provider_error",
]);
