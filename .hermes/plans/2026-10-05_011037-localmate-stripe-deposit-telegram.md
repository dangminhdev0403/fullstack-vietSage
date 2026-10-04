---
status: processing
current_phase: continuous-code-dag
updated_at: 2026-10-05T02:03:00+07:00
next: H0 schema/contract validated; freeze the synthetic dirty baseline, launch independent Antigravity lanes A/C/D/E, then launch B as soon as A's concrete payment service is integrated.
verification: pending
execution_mode: focused-code
execution_shape: single-continuous-contract-dag
implementation_route: multi-agent-isolated-worktrees
production_payment_activation: blocked-pending-supported-stripe-merchant-account
---

# LocalMate 15% Stripe Checkout and Durable Telegram Handoff Implementation Plan

> **For Hermes:** Execute as one continuous contract DAG using bounded external coding-agent orchestration. Do not stop for phase-by-phase confirmation. The host owns the schema/contract, integration, protected actions, and final verification. Agents code only in isolated worktrees with disjoint write sets and return `DONE` or `BLOCKED`.

**Goal:** When a guest explicitly confirms a LocalMate booking, create an order-specific Stripe Checkout QR for VietSage's configurable 15% platform fee, notify the assigned guide through Telegram only after authoritative payment confirmation, let the guide accept/reject and collect the remaining 85% directly, and keep retries, refunds, accounting, and reconciliation idempotent.

**Architecture:** Keep booking state, payment state, and Telegram-delivery state separate. The NestJS backend owns prices, percentage snapshots, Stripe API calls, webhook verification, refunds, and delivery retries. The AI/n8n flow only proposes a verified `LOCALMATE_BOOKING` action; the guest performs an explicit confirmation. The frontend uses the installed `qrcode.react`, opens Stripe-hosted Checkout, and polls the existing order-detail query while payment is non-terminal; no new realtime transport is required for the payment MVP.

**Tech stack:** NestJS 11, Prisma/PostgreSQL, native `fetch`/`URLSearchParams`, Node `crypto`, Stripe Checkout API, Next.js 16, React 19, `@dangminhdev04032005/query-resource`, existing `qrcode.react`, Telegram Bot API, Jest, Node test runner.

---

## Delivery mode

This is one difficult task, not a sequence of user-facing phases.

- Run a **single continuous DAG**. Integrate completed producers immediately and launch newly unblocked consumers without waiting for unrelated lanes.
- No phase approval pauses. Ask only for protected gates: applying a migration, adding dependencies/tools, using real Stripe/Telegram credentials, provider writes, commit/push, deploy, or production activation.
- Use the current dirty tree as the accepted implementation baseline. Preserve all LocalMate realtime/Telegram work already present.
- Build isolated worktrees from a synthetic local baseline created with a temporary Git index. Never commit/push that synthetic baseline.
- One writable agent per worktree. No two agents own the same path.
- Agent scope: implementation plus one focused check. Host scope: inspect real diffs, integrate in dependency order, repair contract gaps, run final affected tests/build once, refresh Graphify/Repomix.
- Agent response contract: `DONE|BLOCKED`, changed paths, exact focused check and result, residual issue. No prose design review.
- No agent commits, pushes, deploys, installs packages/tools, applies migrations, edits secrets, or contacts live providers.

## Current repository evidence

- Active repo: `C:\Users\Dangminhdev0403\Desktop\workspace\fullstack-vietSage`.
- Branch at planning time: `master`, ahead of `origin/master`; dirty LocalMate/Telegram/realtime files must be preserved.
- Graph: `graphify-out/graph.json` exists.
- Existing scoped context: `graphify-out/repomix/localmate-review.xml` exists; regenerate narrower lane packs before dispatch.
- LocalMate order currently creates a normal `MarketplaceOrder`, immediately invokes Telegram notification, charges the normal Marketplace fee model, and can later enter folio/settlement paths.
- Existing generic Marketplace pricing adds `deliveryServiceFeeRate` (default 10%) to customer price. It is not the LocalMate platform fee.
- Existing LocalMate UI says no upfront payment and posts directly to `POST /guest/marketplace/orders`.
- Existing frontend already has `qrcode.react`; do not add another QR dependency.
- Backend has no Stripe package; use native HTTPS/fetch and Node crypto. Do not change package manifests.
- Stripe CLI is not installed. `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` were unset during planning.
- Stripe supports VND as zero-decimal. Stripe's supported merchant-country list did not show Vietnam during research. Sandbox implementation is allowed after code approval; live activation remains blocked until VietSage confirms a supported Stripe merchant account/legal entity.

## Locked business decisions

1. The default LocalMate platform fee is **15.00%**.
2. VietSage keeps that fee as platform revenue; it is not money held for the guide.
3. The guide collects the remaining amount directly from the guest.
4. The configured percentage is snapshotted on every order. Later edits affect new orders only.
5. LocalMate does not add the existing Marketplace delivery/service fee on top of the guide price.
6. LocalMate completion must not post the full tour amount to the hotel folio and must not create partner debt/settlement for the guide's 85%.
7. Guide rejection, guide timeout, or guest cancellation before guide acknowledgement refunds the paid platform fee in full. Cancellation after acknowledgement is an admin-review conflict in this scope.
8. Telegram is blocked until payment is `PAID` or `NOT_REQUIRED`.
9. Redirect/success pages never establish payment truth. Only a verified Stripe webhook or provider reconciliation can do that.
10. n8n/AI never receives Stripe secrets, calculates payment amounts, creates payment sessions, or confirms payment.

## Money invariants

All calculations use `Prisma.Decimal`; never JavaScript floating-point arithmetic.

```text
tourTotalAmount       = unitPriceSnapshot × quantity
platformFeeAmount     = roundVND(tourTotalAmount × platformFeeRateSnapshot / 100)
guideRemainingAmount  = tourTotalAmount - platformFeeAmount
customerTotalAmount   = tourTotalAmount
hotelServiceFeeAmount = 0 for LocalMate
```

For VND, Stripe `unit_amount` equals the integer VND amount; do not multiply by 100.

Required assertions:

- Currency is `VND` for the first implementation; fail closed for other currencies until explicitly supported.
- `0 <= platformFeeRateSnapshot <= 100`.
- `0 <= platformFeeAmount <= tourTotalAmount`.
- `platformFeeAmount + guideRemainingAmount = tourTotalAmount`.
- A `0%` fee creates `NOT_REQUIRED`, skips Stripe, and immediately makes Telegram delivery eligible.

## State model

Do not add payment states to `MarketplaceOrderStatus`.

### Booking

```text
PENDING -> ACKNOWLEDGED -> COMPLETED
PENDING -> REJECTED
PENDING -> CANCELLED
ACKNOWLEDGED -> CANCELLED only through the existing authorized/admin policy
```

### Payment

```text
CREATING -> OPEN -> PAID
CREATING -> FAILED
OPEN -> EXPIRED
OPEN -> CANCELLED
PAID -> REFUND_PENDING -> REFUNDED
PAID -> DISPUTED
0% fee -> NOT_REQUIRED
```

Terminal payment states: `NOT_REQUIRED`, `PAID`, `EXPIRED`, `CANCELLED`, `REFUNDED`, `FAILED`, `DISPUTED`.

### Guide notification

```text
BLOCKED -> PENDING -> SENDING -> SENT
                    -> FAILED -> SENDING
```

Eligibility: payment is `PAID` or `NOT_REQUIRED`, order is still `PENDING`, and the assigned LocalMate Telegram binding remains valid.

## Persistence contract

### Extend `MarketplacePricingConfig`

```prisma
localMatePlatformFeeRate Decimal @default(15.00) @db.Decimal(5, 2)
```

The existing admin `platform.marketplace.view/manage` boundary remains authoritative.

### Add `MarketplaceOrderPayment`

One row per LocalMate order:

```text
id
orderId unique
provider                         STRIPE
status
currency                         VND
tourTotalAmount
platformFeeRateSnapshot
platformFeeAmount
guideRemainingAmount
providerCheckoutSessionId        unique nullable
providerPaymentIntentId          unique nullable
checkoutUrl                      nullable
expiresAt                        nullable
paidAt                           nullable
refundedAmount                   default 0
refundedAt                       nullable
guideNotificationStatus          default BLOCKED
notificationAttemptCount         default 0
notificationNextAttemptAt        nullable
notificationLeaseUntil           nullable
notificationSentAt               nullable
lastProviderErrorCode            nullable, allowlisted code only
createdAt
updatedAt
```

Do not store card data, Stripe customer payloads, webhook bodies, Telegram tokens, or raw provider errors.

### Add `MarketplacePaymentProviderEvent`

A compact webhook inbox/audit record:

```text
id
provider
providerEventId unique
eventType
paymentId nullable
outcome                           PROCESSED | IGNORED | REJECTED
processedAt
createdAt
```

Do not store the raw event body. Insert/update payment and event outcome in one DB transaction.

### Migration

Create one additive migration candidate under:

```text
services/auth-service/prisma/migrations/<timestamp>_add_localmate_payment_checkout/migration.sql
```

The implementation may create and validate the candidate. **Do not apply it to any existing database without separate approval.** Rehearse it only against a disposable PostgreSQL database during final verification.

## HTTP/API contract

### Guest order creation

Keep:

```http
POST /guest/marketplace/orders
```

For a verified LocalMate service, the backend transaction creates:

- normal order with LocalMate-specific financial snapshots;
- one payment snapshot;
- notification status `BLOCKED` unless fee is 0%;
- no Telegram side effect inside or immediately after order creation.

Response adds a narrow payment summary; it never exposes provider secrets:

```ts
payment: {
  status: LocalMatePaymentStatus;
  tourTotalAmount: string;
  platformFeeRateSnapshot: string;
  platformFeeAmount: string;
  guideRemainingAmount: string;
  currency: "VND";
  checkoutUrl: string | null;
  expiresAt: string | null;
}
```

### Create/retrieve Checkout Session

```http
POST /guest/marketplace/orders/:orderId/payment-session
```

Rules:

- Guest session must own the order/stay.
- Order must be assigned to a LocalMate profile.
- Return the existing open session when available.
- A failed network response is retried with stable provider idempotency key:
  `localmate:{paymentId}:checkout:v1`.
- `NOT_REQUIRED` returns current payment state without calling Stripe.
- Terminal paid/refunded/disputed states never create another Checkout Session.
- An expired unpaid session may create one replacement session through a versioned retry key after DB state is reconciled.

Stripe Checkout fields:

```text
mode=payment
line_items[0][price_data][currency]=vnd
line_items[0][price_data][unit_amount]=platformFeeAmount
line_items[0][price_data][product_data][name]=LocalMate booking confirmation fee
line_items[0][quantity]=1
client_reference_id=orderId
metadata[orderId]=orderId
metadata[paymentId]=paymentId
metadata[schemaVersion]=1
expires_at=now + 30 minutes
success_url=<trusted configured return base>/localmate/payment-return?result=success
cancel_url=<trusted configured return base>/localmate/payment-return?result=cancelled
```

No session token or guest identity appears in these URLs or metadata.

### Guest order read

```http
GET /guest/marketplace/orders/:orderId
```

Return payment summary. Frontend polls this existing endpoint every 2 seconds only while payment is `CREATING`, `OPEN`, or `REFUND_PENDING`; stop on terminal state or component unmount.

### Guest cancellation

Existing endpoint remains:

```http
PATCH /guest/marketplace/orders/:orderId/cancel
```

Behavior:

- Unpaid/open: cancel order and expire the Stripe Checkout Session when possible.
- Paid but guide not acknowledged: atomically mark refund pending, call Stripe refund idempotently, then converge through webhook/reconciliation.
- Guide acknowledged: return stable `409` requiring admin review; do not silently refund or cancel.

### Stripe webhook

```http
POST /webhooks/stripe
```

- Explicitly public only for authentication middleware; provider signature remains mandatory.
- Capture exact raw request body with Nest's supported raw-body option.
- Verify `Stripe-Signature` using HMAC-SHA256, timestamp tolerance 300 seconds, all `v1` candidates, and timing-safe comparison.
- Reject missing/malformed/stale signatures with `400`.
- Compare provider `amount_total`, `currency`, `client_reference_id`, and DB snapshot. Metadata never overrides DB money.
- Return `2xx` after the DB transaction; never wait for Telegram.

Handled events:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
charge.refunded
charge.dispute.created
```

Only `payment_status=paid` transitions to `PAID`.

### Admin pricing config

Existing endpoints remain:

```http
GET   /admin/marketplace/pricing-config
PATCH /admin/marketplace/pricing-config
```

Add `localMatePlatformFeeRate`, validated `0..100`. Existing `deliveryServiceFeeRate` remains independent.

## Stripe adapter rules

Use a concrete `StripeCheckoutService`, not a speculative provider framework.

- Native `fetch`, `URLSearchParams`, and Node `crypto`; no package or lockfile changes.
- Secret key stays server-side and is sent only as HTTPS Bearer authentication to `https://api.stripe.com`.
- Configuration:
  - `STRIPE_CHECKOUT_ENABLED`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_CHECKOUT_RETURN_BASE_URL`
- When disabled, non-zero LocalMate payment-session creation fails with a stable service-unavailable domain error; order/payment snapshots remain retryable.
- Production requires HTTPS return base and non-placeholder secrets.
- Parse an allowlisted subset of Stripe responses. Never leak provider payloads/errors to clients or logs.
- Use stable idempotency keys for Checkout Session creation and refunds.
- Pin a Stripe API version only after confirming the sandbox account's configured version; do not guess a version in code.

## Telegram handoff

After webhook/reconciliation sets payment `PAID`, the same transaction sets notification `PENDING`.

A scheduled worker:

1. Finds due `PENDING`/`FAILED` rows.
2. Claims one with conditional `updateMany`, setting `SENDING` and `notificationLeaseUntil`.
3. Rechecks payment, order status, assigned profile, and Telegram binding.
4. Calls the existing bridge.
5. Saves `SENT`, timestamp, and returned Telegram message ID if already supported by the current bridge.
6. On retryable error, stores only an allowlisted error code, increments attempts, and schedules bounded backoff.
7. On terminal ownership/config errors, stops retrying and exposes an operational failure state.

Telegram content:

```text
LocalMate order #<orderNumber>
Service: <snapshot>
Time: <requestedStartAt>
Guests: <partySize>
Tour total: <tourTotalAmount>
Paid to VietSage: <platformFeeAmount>
Guide collects: <guideRemainingAmount>

[Accept] [Reject]
```

The existing ownership guard remains: only the order's `assignedLocalMateProfileId` may act through its bound Telegram chat.

Strict exactly-once delivery is impossible across the Telegram send/DB-save crash window because Bot API has no idempotency key. The target is effectively-once with atomic claims, leases, bounded retries, order number in the message, and callback idempotency.

## Guide completion and financial isolation

For orders with `assignedLocalMateProfileId`:

- Creation uses `hotelServiceFeeAmount=0` and `customerTotalAmount=tourTotalAmount`.
- Completion does not call the generic full-order folio posting path.
- Completion does not create `MarketplaceSettlement` for the guide's 85%.
- Completion does not record the platform fee as hotel Marketplace revenue.
- `MarketplaceOrderPayment` is the source for LocalMate platform fee collected/refunded/net figures in this scope.
- Generic Marketplace orders retain current pricing, folio, revenue, and settlement behavior unchanged.

Guide rejection before service starts triggers one idempotent full refund. Order transition and refund intent must be persisted before the external Stripe call; reconciliation completes uncertain outcomes.

## UI contract

Update the existing LocalMate request dialog, not a new checkout application.

Before submit, show:

- total tour price;
- `VietSage confirmation fee (15%)` using the backend quote/snapshot, not client arithmetic as authority;
- remaining amount paid directly to the guide;
- explicit consent button: `Confirm and create payment QR`.

After order creation:

- Request/retrieve payment session.
- Render `QRCodeSVG` from the installed `qrcode.react` and an accessible `Pay now` link to the same Checkout URL.
- Explain that a phone displaying the QR can use the button instead of scanning itself.
- Show loading, provider unavailable, unpaid/open, paid, expired, refund pending, refunded, and disputed states.
- Permit session retry after provider/network failure without creating another order.
- Poll the existing order detail only while needed.
- Keep VI/EN/RU copy complete; retain the product voice `em`–`Quý khách` in Vietnamese.
- Do not display raw Stripe errors or status codes.
- Do not store Checkout URLs in localStorage/sessionStorage.
- The generic return page contains no guest/order secrets. The original GuestOS surface is the status authority.

## n8n/AI boundary

No payment changes are needed in either LocalMate n8n workflow.

The action remains:

```json
{
  "type": "LOCALMATE_BOOKING",
  "candidateKey": "verified-server-side-candidate"
}
```

Keep server-side candidate verification. The AI may invite the guest to book; it may not claim payment success, quote a fee amount independently, or submit a booking without the explicit UI confirmation.

## Continuous multi-agent DAG

### Host producer H0 — baseline, schema, and frozen contract

**Owner:** Hermes host/orchestrator

**Depends on:** none

**Writes:**

- `services/auth-service/prisma/schema.prisma`
- `services/auth-service/prisma/migrations/<timestamp>_add_localmate_payment_checkout/migration.sql`
- `shared/api-contract/docs/CONTRACT_CHANGES.md`
- `services/docs/CONTRACT_GUIDE.md`
- this plan's `Resume`/verification metadata

**Actions:**

1. Snapshot `HEAD`, index, dirty path digests, and line-ending-normalized hashes.
2. Create a synthetic local baseline from the accepted dirty tree using a temporary index; do not alter the primary index.
3. Add only the additive schema/migration candidate and exact HTTP/payment DTO contract.
4. Run `npx prisma format`, `npx prisma validate`, and `npx prisma generate` in an isolated worktree/dependency state.
5. Create one narrow Repomix pack per lane.
6. Launch all unblocked agents together.

**Completion:** Schema generates, migration candidate matches schema, contract has no TBD fields needed by writers, primary dirty tree/index unchanged.

### Agent A — Stripe core, webhook, refunds, reconciliation

**Depends on:** H0

**Allowed writes:**

- `services/auth-service/src/modules/localmate-payments/**`
- `services/auth-service/src/common/config/env.config.ts`
- focused new tests under `services/auth-service/src/modules/localmate-payments/tests/**`

**Forbidden:** Prisma schema/migrations, Marketplace order service/controller, Telegram files, frontend, package files.

**Deliverable:**

- concrete Stripe Checkout service using native platform APIs;
- signature verifier with timestamp/timing-safe checks;
- payment application service for session, webhook, refund, expiry/reconciliation;
- public webhook controller;
- cron reconciliation and payment-notification eligibility primitives;
- unit tests for authentication, idempotency, amount/currency mismatch, duplicate/reordered events, expiry, refunds, VND zero-decimal, redaction.

**Focused gate:**

```bash
cd services/auth-service
node node_modules/jest/bin/jest.js --runInBand modules/localmate-payments/tests
```

### Agent B — Marketplace order/payment integration and financial isolation

**Depends on:** H0 and integrated Agent A payment service (launch immediately when A settles; do not wait for C/D/E)

**Allowed writes:**

- `services/auth-service/src/modules/marketplace/application/marketplace-order.service.ts`
- `services/auth-service/src/modules/marketplace/api/guest-marketplace.controller.ts`
- `services/auth-service/src/modules/marketplace/domain/marketplace-order.schema.ts`
- `services/auth-service/src/modules/marketplace/marketplace.module.ts`
- `services/auth-service/src/modules/marketplace/tests/marketplace-order.service.spec.ts`
- one new focused Marketplace LocalMate payment integration spec

**Forbidden:** Prisma schema/migrations, payment module internals, Telegram files, frontend, package files.

**Deliverable:**

- LocalMate order and payment snapshot created atomically;
- generic Marketplace behavior unchanged;
- payment-session endpoint delegates to payment service;
- order reads expose frozen payment summary;
- cancellation/refund policy wired;
- Telegram creation notification suppressed until eligible;
- LocalMate completion skips generic folio/settlement/revenue paths;
- focused regressions proving generic orders still use existing pricing/accounting.

**Focused gate:**

```bash
cd services/auth-service
node node_modules/jest/bin/jest.js --runInBand modules/marketplace/tests/marketplace-order.service.spec.ts modules/marketplace/tests/localmate-payment-order.spec.ts
```

### Agent C — durable Telegram paid-order dispatch

**Depends on:** H0

**Allowed writes:**

- `services/auth-service/src/modules/notifications/application/telegram-marketplace-bridge.service.ts`
- `services/auth-service/src/modules/notifications/application/localmate-paid-order-notification.service.ts`
- `services/auth-service/src/modules/notifications/notifications.module.ts`
- `services/auth-service/src/modules/notifications/tests/telegram-marketplace-bridge.service.spec.ts`
- `services/auth-service/src/modules/notifications/tests/localmate-paid-order-notification.service.spec.ts`

**Forbidden:** Existing conversation retry service except an orchestrator-approved conflict fix; Prisma schema/migrations; Marketplace order service; frontend; package files.

**Baseline warning:** `telegram-marketplace-bridge.service.ts` is already dirty with verified ownership changes. The lane starts from the synthetic dirty baseline and must preserve them.

**Deliverable:**

- paid/not-required eligibility checks;
- atomic multi-instance claim/lease/retry;
- amount-aware guide message;
- ownership-safe callbacks retained;
- no send before authoritative payment;
- duplicate webhook/worker ticks cannot create parallel claims;
- bounded retry and terminal failure behavior.

**Focused gate:**

```bash
cd services/auth-service
node node_modules/jest/bin/jest.js --runInBand modules/notifications/tests/telegram-marketplace-bridge.service.spec.ts modules/notifications/tests/localmate-paid-order-notification.service.spec.ts
```

### Agent D — GuestOS Checkout QR and payment states

**Depends on:** H0

**Allowed writes:**

- `frontends/front-end-vietsage/src/features/marketplace/types/marketplace-contract.ts`
- `frontends/front-end-vietsage/src/features/marketplace/repositories/guest-marketplace-repository.ts`
- `frontends/front-end-vietsage/src/features/marketplace/resources/guest-marketplace-resource.ts`
- `frontends/front-end-vietsage/src/features/marketplace/queries/use-guest-marketplace.ts`
- `frontends/front-end-vietsage/src/features/marketplace/components/localmate-order-request-dialog.tsx`
- one focused test beside the LocalMate dialog/flow
- `frontends/front-end-vietsage/src/app/api/guest/marketplace/[...path]/route.ts`
- only the exact GuestOS service methods required by that BFF route
- a minimal secret-free payment-return route/page if required

**Forbidden:** Request-realtime files, n8n workflows, backend files, package files.

**Deliverable:**

- exact backend contract integration through repository/resource/hooks;
- total/fee/remaining breakdown;
- QR using installed `qrcode.react` plus accessible direct Checkout link;
- retry without duplicate order;
- bounded conditional polling;
- paid/expired/refund/dispute/error UI;
- complete VI/EN/RU copy and no raw provider errors;
- no secrets/tokens/Checkout URL persistence.

**Focused gates:**

```bash
cd frontends/front-end-vietsage
node --test src/features/marketplace/components/localmate-payment-flow.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

### Agent E — editable platform fee admin API/UI

**Depends on:** H0

**Allowed writes:**

- `services/auth-service/src/modules/marketplace/domain/marketplace-admin.schema.ts`
- `services/auth-service/src/modules/marketplace/application/marketplace-admin.service.ts`
- `services/auth-service/src/modules/marketplace/api/marketplace-admin.controller.ts`
- `services/auth-service/src/modules/marketplace/tests/marketplace-admin.service.spec.ts`
- `frontends/front-end-vietsage/src/features/marketplace-admin/types.ts`
- `frontends/front-end-vietsage/src/features/marketplace-admin/repository.ts`
- `frontends/front-end-vietsage/src/features/marketplace-admin/resource.ts`
- `frontends/front-end-vietsage/src/features/marketplace-admin/client.ts`
- `frontends/front-end-vietsage/src/features/marketplace-admin/marketplace-admin-client.tsx`
- one focused admin pricing contract test

**Forbidden:** Prisma schema/migrations, LocalMate payment/order/Telegram internals, package files.

**Deliverable:**

- `localMatePlatformFeeRate` included in existing admin pricing GET/PATCH;
- server validation `0..100`;
- existing RBAC unchanged;
- frontend field distinct from delivery fee, with user-facing validation and `SwalVietSage` conventions;
- edits affect new orders only, made explicit in UI copy.

**Focused gates:**

```bash
cd services/auth-service
node node_modules/jest/bin/jest.js --runInBand modules/marketplace/tests/marketplace-admin.service.spec.ts
cd ../../frontends/front-end-vietsage
node --test src/features/marketplace-admin/localmate-platform-fee.test.mjs
```

### Host integrator H1 — continuous merge and contract repair

**Depends on:** each producer independently; do not wait for all lanes before inspecting completed ones

**Owner:** Hermes host/orchestrator

**Actions:**

1. Inspect actual worktree status/diff; ignore agent summaries until verified.
2. Reject out-of-scope paths, package changes, secret material, raw error storage, or overwritten baseline work.
3. Run each focused host gate.
4. Apply allowlisted patches to an integration worktree based on the synthetic baseline.
5. Integrate in contract order: H0 schema/contract, A payment core, B order integration, C Telegram, E admin, D frontend.
6. Resolve module wiring/shared imports on the host; agents never overlap on these fixes.
7. Add orchestrator-owned cross-lane regressions for gaps found during semantic review.
8. Compare every target primary file against the synthetic baseline before final patch application; stop on unaccounted semantic divergence.

**Completion:** Combined tree compiles and every business/security invariant below is represented by a runnable test.

### Agent F — independent integrated review

**Depends on:** H1 combined tree

**Mode:** read-only reviewer/tester; no implementation unless the host creates a separately scoped fix lane

**Review targets:**

- payment signature/authentication and raw-body handling;
- monetary authority/snapshot/rounding;
- duplicate/reordered webhook behavior;
- crash window between payment and Telegram;
- guide ownership and callback authorization;
- refund idempotency and uncertain provider outcomes;
- no LocalMate folio/settlement/double fee;
- generic Marketplace regression;
- frontend trust boundary/i18n/accessibility;
- secret/error/log redaction;
- migration/schema drift.

**Return:** confirmed findings only, with path/line, reproduction/test, severity, and smallest fix boundary.

### Host finalizer H2 — final fixes, runtime proof, context refresh

**Depends on:** F review

- Verify every reviewer finding against source and a runnable regression before changing code.
- Apply minimal host fixes.
- Run the final affected suite/build once after artifact freeze.
- Rehearse migrations only on disposable PostgreSQL; do not apply to the current/local shared DB without approval.
- Use fake Stripe transport for deterministic automated tests.
- Run real Stripe sandbox and Telegram test only after explicit credential/provider-write approval.
- Refresh Graphify once, regenerate bounded LocalMate payment pack, verify freshness.
- Update this plan's Resume and frontmatter.
- Do not commit/push/deploy until explicitly authorized for this feature.

## Acceptance criteria

### Payment and money

- [ ] LocalMate order snapshots total, percentage, fee, and guide remainder atomically.
- [ ] Default is 15%; admin accepts 0–100%; old orders never change.
- [ ] VND is sent to Stripe as zero-decimal.
- [ ] LocalMate customer total is not inflated by the generic 10% fee.
- [ ] Generic Marketplace financial behavior remains unchanged.
- [ ] A stable idempotency key prevents duplicate Checkout Sessions and refunds.
- [ ] Client values/metadata cannot override DB money.

### Security

- [ ] Secret key and webhook secret remain backend-only.
- [ ] Webhook uses exact raw body, timestamp tolerance, HMAC, all v1 signatures, timing-safe compare.
- [ ] Missing/malformed/stale/incorrect signatures fail closed.
- [ ] Return URLs come only from exact trusted configuration.
- [ ] No raw provider payload/error, card data, secret, session token, or Checkout URL persists in unsafe storage/logs.
- [ ] Guest can read/create sessions only for its own stay/order.
- [ ] Guide callbacks remain bound to the assigned LocalMate profile.

### Lifecycle and recovery

- [ ] Telegram is never sent before `PAID`/`NOT_REQUIRED`.
- [ ] Webhook transaction creates durable notification work before returning success.
- [ ] Multi-instance worker claims are atomic and retryable.
- [ ] Duplicate/reordered webhooks and worker ticks are idempotent.
- [ ] Process restart recovers open payment, pending notification, and refund states.
- [ ] Expired Checkout can be retried without creating another order.
- [ ] Guide reject/timeout and pre-ack guest cancellation converge to one full refund.
- [ ] Disputes stop automatic completion and surface operational attention.

### Accounting

- [ ] Guide's 85% creates no VietSage payable/settlement.
- [ ] LocalMate completion creates no full-tour hotel folio charge.
- [ ] Platform fee is not reported as hotel Marketplace revenue.
- [ ] Paid, refunded, and net platform amounts are queryable from payment snapshots.

### UI

- [ ] Guest sees total, VietSage fee, guide remainder, expiration, and refund policy before confirmation.
- [ ] QR and direct payment link represent the same Checkout URL.
- [ ] UI handles provider unavailable, open, paid, expired, refund pending/refunded, and disputed states.
- [ ] Conditional polling stops on terminal state.
- [ ] VI/EN/RU and accessibility checks pass.

## Required automated checks

Run from `services/auth-service` unless noted:

```bash
npx prisma format
npx prisma validate
npx prisma generate
node node_modules/jest/bin/jest.js --runInBand \
  modules/localmate-payments/tests \
  modules/marketplace/tests/marketplace-order.service.spec.ts \
  modules/marketplace/tests/localmate-payment-order.spec.ts \
  modules/marketplace/tests/marketplace-admin.service.spec.ts \
  modules/notifications/tests/telegram-marketplace-bridge.service.spec.ts \
  modules/notifications/tests/localmate-paid-order-notification.service.spec.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js <changed-backend-ts-files>
npm run build
```

Run from `frontends/front-end-vietsage`:

```bash
node --test \
  src/features/marketplace/components/localmate-payment-flow.test.mjs \
  src/features/marketplace-admin/localmate-platform-fee.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js <changed-frontend-files>
node node_modules/next/dist/bin/next build
```

Repository checks:

```bash
git diff --check
git status --short --branch
```

Migration rehearsal on disposable PostgreSQL:

```bash
npx prisma migrate deploy
npx prisma migrate status
# Compare disposable migrated schema to prisma/schema.prisma using the repository drift gate.
```

Expected: all commands exit 0; no migration is applied to the existing shared/local database during this plan without approval.

## Deterministic test matrix

| Case | Expected proof |
|---|---|
| 15% of 1,200,000 VND | fee 180,000; guide 1,020,000 |
| 0% fee | `NOT_REQUIRED`; no Stripe call; notification eligible |
| 100% fee | full amount paid to VietSage; guide remaining 0 |
| Config changed after order | old snapshot unchanged |
| Stripe create timeout then retry | one provider session via stable idempotency key |
| Duplicate completed webhook | one paid transition; one notification work item |
| Expired event after paid event | paid state unchanged |
| Invalid signature/timestamp | HTTP 400; no DB transition |
| Amount/currency mismatch | event rejected; no notification |
| API dies after webhook DB commit | worker sends after restart |
| Telegram fails | payment remains paid; retry scheduled |
| Two worker instances | one claim/send attempt at a time |
| Wrong guide callback | rejected; no order transition |
| Guide rejects paid order | one full refund intent/call |
| Guest cancels open Checkout | order cancelled; Checkout expired |
| Guest cancels paid pre-ack | refund pending then refunded |
| Guest cancels post-ack | stable 409/admin review |
| LocalMate completes | no full folio, no guide settlement |
| Generic order completes | existing folio/revenue/settlement behavior retained |
| UI same-device payment | direct link works; terminal polling stops |
| UI second-device QR | original device observes paid state through polling |

## Real sandbox gate

Protected because it uses credentials and causes real external provider/test writes.

After explicit approval and a supported Stripe sandbox account is available:

1. Configure test secrets through ignored environment storage; never print them.
2. Create one synthetic LocalMate order.
3. Create Checkout Session in Stripe sandbox.
4. Render QR and open hosted Checkout.
5. Pay with Stripe test card `4242 4242 4242 4242`, future expiry, arbitrary CVC.
6. Confirm verified webhook updates DB.
7. Confirm exactly one guide notification in the approved Telegram test chat.
8. Exercise expiry, duplicate webhook, provider timeout, Telegram failure/retry, reject/refund, and restart recovery.
9. Redact/delete only approved synthetic test records after separate destructive-data approval; otherwise leave them clearly marked synthetic.

Do not install Stripe CLI without approval. Tailscale Funnel may expose the webhook for sandbox testing only after exact route/target review and external-write approval.

## Production activation gate

Production remains blocked until all are true:

- VietSage confirms a Stripe merchant account/legal entity in a Stripe-supported country.
- Settlement currency, bank account, tax/invoice treatment, refund owner, dispute owner, and Stripe fee treatment are approved.
- Restricted live key permissions are defined.
- Exact live webhook endpoint and secret are configured.
- Production migration, backup, deployment, provider write, and cutover receive separate approval.

If VietSage only has a Vietnamese legal entity, retain the domain/payment-state/API architecture and replace the concrete Stripe service with an approved domestic provider in a separately planned task. Do not build that second provider now.

## Files likely to change

Backend:

- `services/auth-service/prisma/schema.prisma`
- `services/auth-service/prisma/migrations/<timestamp>_add_localmate_payment_checkout/migration.sql`
- `services/auth-service/src/common/config/env.config.ts`
- `services/auth-service/src/main.ts` or the exact bootstrap seam needed for raw body
- `services/auth-service/src/modules/localmate-payments/**`
- `services/auth-service/src/modules/marketplace/{api,application,domain,tests}/**` scoped files listed above
- `services/auth-service/src/modules/marketplace/marketplace.module.ts`
- `services/auth-service/src/modules/notifications/{application,tests}/**` scoped files listed above
- `services/auth-service/src/modules/notifications/notifications.module.ts`
- `services/auth-service/src/app.module.ts` only if a separate payment module import is required

Frontend:

- `frontends/front-end-vietsage/src/features/marketplace/types/marketplace-contract.ts`
- `frontends/front-end-vietsage/src/features/marketplace/{repositories,resources,queries,components}/**` scoped files listed above
- `frontends/front-end-vietsage/src/app/api/guest/marketplace/[...path]/route.ts`
- exact GuestOS backend service wrapper used by that BFF
- `frontends/front-end-vietsage/src/features/marketplace-admin/**` scoped files listed above
- one minimal return route/page only if needed

Docs/context:

- `shared/api-contract/docs/CONTRACT_CHANGES.md`
- `services/docs/CONTRACT_GUIDE.md`
- `docs/EVENT_FLOW.md`
- `graphify-out/**` refreshed only after final verified implementation
- this plan

Not expected:

- n8n workflow changes
- request-realtime changes
- package/lockfile changes
- Stripe Connect
- Payment Links
- guide payout/settlement automation

## Risks and explicit ceilings

1. **Stripe merchant availability:** sandbox code can be completed; live activation cannot be claimed until the supported merchant account is confirmed.
2. **Telegram exactly-once ceiling:** effectively-once only; Bot API has no idempotency key across the send/save crash window.
3. **External asynchronous methods:** fulfillment remains webhook-driven; browser redirect never marks paid.
4. **Dirty baseline:** current LocalMate/Telegram/realtime work is authoritative and must survive every worktree/integration operation.
5. **Migration:** candidate creation is authorized only during implementation; applying it remains separately gated.
6. **Refund fees:** Stripe may not return original processing fees; VietSage bears them under the chosen policy.
7. **No guide payout:** this scope records the guide remainder but does not collect, transfer, or reconcile it.
8. **No provider abstraction:** one concrete Stripe service keeps scope small. A domestic-provider replacement is a future task only if the legal-entity gate fails.

## Resume

**Completed**

- Inspected current LocalMate AI action, order creation, pricing, completion accounting, Telegram bridge/retry, frontend booking dialog, admin pricing config, BFF/resource flow, Prisma models, package dependencies, and official Stripe authentication/Checkout/webhook/testing/currency/refund documentation.
- Chosen business policy: VietSage keeps the configurable upfront fee; guide collects the remainder.
- Defined a single continuous multi-agent DAG with disjoint write ownership and host-controlled integration.
- Saved this implementation plan only; no implementation, dispatch, dependency change, migration application, provider write, commit, push, or deployment performed.

**Decisions**

- Stripe Checkout Session per order; QR encodes its URL.
- Native fetch/crypto; no Stripe SDK dependency.
- Separate booking/payment/notification states.
- Payment snapshot is canonical; 15% defaults at config level.
- Poll existing order detail for payment status; no payment-specific socket work.
- Durable DB-backed Telegram dispatch after verified payment.
- Continuous DAG, no phase handoffs.
- Production Stripe enablement blocked until supported merchant-account evidence exists.

**Changed files**

- `.hermes/plans/2026-10-05_011037-localmate-stripe-deposit-telegram.md`

**Verification**

- Planning/source inspection only. Implementation verification pending.

**Blocker**

- No blocker for code implementation after explicit authorization.
- Real Stripe sandbox test needs test credentials/provider-write approval.
- Production activation needs supported merchant-account/legal-entity confirmation.

**Next action**

- On explicit `làm`/implementation approval: create the synthetic dirty baseline, freeze H0 schema/contract, generate lane packs, then launch Agents A–E concurrently as dependencies become ready. Do not pause between lanes; stop only at protected gates or a concrete blocker.
