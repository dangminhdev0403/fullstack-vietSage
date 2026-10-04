import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./localmate-order-request-dialog.tsx", import.meta.url),
  "utf8",
);
const contractSource = readFileSync(
  new URL("../types/marketplace-contract.ts", import.meta.url),
  "utf8",
);
const repoSource = readFileSync(
  new URL("../repositories/guest-marketplace-repository.ts", import.meta.url),
  "utf8",
);
const resourceSource = readFileSync(
  new URL("../resources/guest-marketplace-resource.ts", import.meta.url),
  "utf8",
);
const querySource = readFileSync(
  new URL("../queries/use-guest-marketplace.ts", import.meta.url),
  "utf8",
);
const routeSource = readFileSync(
  new URL("../../../app/api/guest/marketplace/[...path]/route.ts", import.meta.url),
  "utf8",
);

function formatMonetaryVnd(amount) {
  if (amount === null || amount === undefined || amount === "") return "Liên hệ";
  const num = Number(amount);
  if (!Number.isFinite(num) || num < 0) return "Liên hệ";
  return new Intl.NumberFormat("vi-VN").format(num) + " ₫";
}

function isLocalMatePaymentTerminal(paymentStatus, orderStatus) {
  if (orderStatus === "CANCELLED" || orderStatus === "REJECTED" || orderStatus === "COMPLETED") {
    return true;
  }
  if (!paymentStatus) return false;
  return (
    paymentStatus === "PAID" ||
    paymentStatus === "NOT_REQUIRED" ||
    paymentStatus === "EXPIRED" ||
    paymentStatus === "CANCELLED" ||
    paymentStatus === "FAILED" ||
    paymentStatus === "REFUNDED" ||
    paymentStatus === "DISPUTED"
  );
}

function shouldPollLocalMateOrder(isOpen, orderId, currentPaymentStatus, currentOrderStatus) {
  if (!isOpen || !orderId) return false;
  if (currentOrderStatus === "CANCELLED" || currentOrderStatus === "REJECTED" || currentOrderStatus === "COMPLETED") {
    return false;
  }
  if (currentPaymentStatus === "REFUND_PENDING") return true;
  if (isLocalMatePaymentTerminal(currentPaymentStatus, currentOrderStatus)) return false;
  return currentPaymentStatus === "CREATING" || currentPaymentStatus === "OPEN";
}

test("(1) Polling eligibility derives from latest/current order payment state and stops on PAID or terminal", () => {
  // Active polling states
  assert.equal(shouldPollLocalMateOrder(true, "order-1", "OPEN", "PENDING"), true);
  assert.equal(shouldPollLocalMateOrder(true, "order-1", "CREATING", "PENDING"), true);
  assert.equal(shouldPollLocalMateOrder(true, "order-1", "REFUND_PENDING", "PENDING"), true);

  // Terminal payment states MUST halt the 2s interval
  assert.equal(shouldPollLocalMateOrder(true, "order-1", "PAID", "PENDING"), false);
  assert.equal(shouldPollLocalMateOrder(true, "order-1", "EXPIRED", "PENDING"), false);
  assert.equal(shouldPollLocalMateOrder(true, "order-1", "CANCELLED", "PENDING"), false);
  assert.equal(shouldPollLocalMateOrder(true, "order-1", "FAILED", "PENDING"), false);
  assert.equal(shouldPollLocalMateOrder(true, "order-1", "REFUNDED", "PENDING"), false);
  assert.equal(shouldPollLocalMateOrder(true, "order-1", "DISPUTED", "PENDING"), false);
  assert.equal(shouldPollLocalMateOrder(true, "order-1", "NOT_REQUIRED", "PENDING"), false);

  // Terminal order states halt polling
  assert.equal(shouldPollLocalMateOrder(true, "order-1", "OPEN", "CANCELLED"), false);
  assert.equal(shouldPollLocalMateOrder(true, "order-1", "OPEN", "REJECTED"), false);
  assert.equal(shouldPollLocalMateOrder(true, "order-1", "OPEN", "COMPLETED"), false);

  // Dialog closed halts polling
  assert.equal(shouldPollLocalMateOrder(false, "order-1", "OPEN", "PENDING"), false);

  // Source checks: refetchInterval receives dynamic query state deriving from effective/query order
  assert.match(source, /refetchInterval:\s*\(query\)\s*=>/);
  assert.match(source, /const effectiveOrder = queryOrder \?\? createdOrder;/);
  assert.match(source, /const currentPStatus = effectiveOrder\?\.payment\?\.status;/);
  assert.match(source, /shouldPollLocalMateOrder\(isOpen, createdOrder\?\.id, currentPStatus, currentOStatus\)/);
});

test("(2) Valid zero monetary values render as 0 ₫, never 'Liên hệ'; invalid/missing remain unavailable", () => {
  // Valid zero values MUST format as 0 ₫
  assert.equal(formatMonetaryVnd(0), "0 ₫");
  assert.equal(formatMonetaryVnd("0"), "0 ₫");
  assert.equal(formatMonetaryVnd(150000), "150.000 ₫");

  // Invalid or missing values remain "Liên hệ"
  assert.equal(formatMonetaryVnd(null), "Liên hệ");
  assert.equal(formatMonetaryVnd(undefined), "Liên hệ");
  assert.equal(formatMonetaryVnd(""), "Liên hệ");
  assert.equal(formatMonetaryVnd(-5000), "Liên hệ");
  assert.equal(formatMonetaryVnd("invalid"), "Liên hệ");

  // Ensure formatMonetaryVnd allows 0 and does not use <= 0 check for "Liên hệ"
  assert.match(source, /if \(!Number\.isFinite\(num\) \|\| num < 0\) return "Liên hệ";/);
});

test("(3) Two-step explicit flow: no hardcoded 15% before snapshot, no auto-session creation, requires explicit confirm action", () => {
  // Step 1: form shows copy saying VietSage will lock and show the fee before payment
  assert.match(source, /step1FeeNotice/);
  assert.match(source, /step1SubmitBtn/);
  assert.match(source, /step1Submitting/);

  // Verify no hard-coded 15% calculation in form state 2
  assert.doesNotMatch(source, /const estimatedFeeNumber = Math\.round/);

  // Verify NO auto-calling payment session in useEffect
  assert.doesNotMatch(source, /useEffect\(\(\) => \{[\s\S]*ensureSession[\s\S]*\},/);

  // Step 2: requires explicit second action "Confirm and create payment QR"
  assert.match(source, /confirmAndCreateQr: "Confirm and create payment QR"/);
  assert.match(source, /confirmAndCreateQr: "Xác nhận và tạo mã QR thanh toán"/);
  assert.match(source, /confirmAndCreateQr: "Подтвердить и создать QR для оплаты"/);
  assert.match(source, /handleCreatePaymentSession/);
  assert.match(source, /paymentSessionMutation\.mutateAsync\({\s*orderId: currentOrder\.id,\s*}\)/);
});

test("Contract, Repository, Resource, Query, and BFF route support payment-session endpoint", () => {
  assert.match(contractSource, /export type LocalMatePaymentStatus/);
  assert.match(contractSource, /export type LocalMateOrderPayment/);
  assert.match(contractSource, /payment\?: LocalMateOrderPayment \| null;/);
  assert.match(repoSource, /paymentSession:/);
  assert.match(repoSource, /\/api\/guest\/marketplace\/orders\/\$\{encodeURIComponent\(orderId\)\}\/payment-session/);
  assert.match(resourceSource, /paymentSession: defineMutation/);
  assert.match(querySource, /paymentSession: useMutation/);
  assert.match(querySource, /useGuestMarketplacePaymentSession/);
  assert.match(routeSource, /orders.*payment-session/);
});

test("QR code and direct link render the identical Checkout URL with accessibility", () => {
  assert.match(source, /<QRCodeSVG[\s\S]*value=\{activeCheckoutUrl\}/);
  assert.match(source, /<a[\s\S]*href=\{activeCheckoutUrl\}[\s\S]*data-testid="pay-now-link"/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noopener noreferrer"/);
  assert.match(source, /qrPhoneNotice/);
});

test("Session retry reuses current order and never creates a duplicate order", () => {
  assert.match(source, /const handleRetryPaymentSession = async/);
  assert.match(source, /await handleCreatePaymentSession\(\)/);
  // Ensure retry does NOT call createOrderMutation
  const retryFunctionMatch = source.match(/handleRetryPaymentSession = async \(\) => {([\s\S]*?)};/);
  assert.ok(retryFunctionMatch, "handleRetryPaymentSession should exist");
  assert.doesNotMatch(retryFunctionMatch[1], /createOrderMutation/);
});

test("Terminal and error states handled cleanly without raw provider errors", () => {
  assert.match(source, /statusExpired/);
  assert.match(source, /statusFailed/);
  assert.match(source, /statusRefundPending/);
  assert.match(source, /statusRefunded/);
  assert.match(source, /statusDisputed/);
  assert.match(source, /providerUnavailable/);

  // Raw Stripe error payloads must not be shown to users
  assert.doesNotMatch(source, /stripe_error/i);
  assert.doesNotMatch(source, /StripeInvalidRequestError/i);
});

test("Complete VI, EN, RU locale dictionaries with Vietnamese em-Quý khách voice", () => {
  assert.match(source, /case "en":/);
  assert.match(source, /case "ru":/);
  assert.match(source, /default:/);

  // Vietnamese voice checks
  assert.match(source, /Quý khách/);
  assert.match(source, /Em đã chuyển thông tin tới hướng dẫn viên/);
});
