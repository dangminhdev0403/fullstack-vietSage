import type {
  MarketplaceOrderPaymentStatus,
  MarketplaceGuideNotificationStatus,
} from "@prisma/client";

export interface LocalMatePaymentSummaryDto {
  status: MarketplaceOrderPaymentStatus;
  currency: "VND";
  tourTotalAmount: string;
  platformFeeRateSnapshot: string;
  platformFeeAmount: string;
  guideRemainingAmount: string;
  checkoutUrl: string | null;
  expiresAt: string | null;
}

export interface CreateCheckoutSessionResult {
  paymentId: string;
  orderId: string;
  status: MarketplaceOrderPaymentStatus;
  checkoutUrl: string | null;
  expiresAt: string | null;
  isNewSession: boolean;
}

export interface RefundPaymentResult {
  paymentId: string;
  orderId: string;
  status: MarketplaceOrderPaymentStatus;
  refundedAmount: string;
  refundedAt: string | null;
  alreadyRefunded: boolean;
}

export interface ReconciliationResult {
  paymentId: string;
  orderId: string;
  previousStatus: MarketplaceOrderPaymentStatus;
  newStatus: MarketplaceOrderPaymentStatus;
  reconciled: boolean;
  reason?: string;
}

export interface WebhookProcessingResult {
  received: boolean;
  duplicate?: boolean;
  outcome?: string;
  reason?: string;
}
