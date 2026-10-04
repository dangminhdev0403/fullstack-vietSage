# Agent A — Stripe core

**Goal:** Implement the concrete LocalMate Stripe Checkout/payment service, verified webhook processing, idempotent refund, and reconciliation against the frozen Prisma schema.

**Workspace:** Your assigned Orca worktree only.

**Read first:** `PONYTAIL.md`, `.agents/AGENTS.md`, `docs/RULES.md`, `services/docs/ARCHITECTURE.md`, `services/docs/RULES.md`, `services/docs/CONTRACT_GUIDE.md`, then the master plan `.hermes/plans/2026-10-05_011037-localmate-stripe-deposit-telegram.md` sections “Stripe adapter rules”, “HTTP/API contract”, and “Agent A”.

**Allowed writes:**
- `services/auth-service/src/modules/localmate-payments/**`
- `services/auth-service/src/common/config/env.config.ts`
- `services/auth-service/src/main.ts` only if exact raw-body capture requires it
- focused tests under `services/auth-service/src/modules/localmate-payments/tests/**`

**Do not write:** Prisma schema/migrations, Marketplace order/admin files, notifications/Telegram files, frontend, package/lockfiles, secrets, generated clients, n8n, docs.

**Required behavior:**
- Native `fetch`, `URLSearchParams`, Node `crypto`; no dependency changes.
- Concrete `LocalMatePaymentsModule` exporting the application service needed by Marketplace integration.
- Config: `STRIPE_CHECKOUT_ENABLED`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CHECKOUT_RETURN_BASE_URL`; fail closed and never log secrets/provider bodies.
- Checkout session creation/retrieval with VND zero-decimal amount, exact DB snapshots, trusted configured return base, expiry 30 minutes, idempotency key `localmate:{paymentId}:checkout:v1`.
- JWT-public `POST /webhooks/stripe` with exact raw-body signature verification: timestamp tolerance 300s, every `v1`, HMAC-SHA256, timing-safe compare.
- Handle events and state transitions listed in the master plan. Duplicate/reordered events are idempotent. Metadata never overrides DB money.
- DB transaction records compact provider event outcome and makes Telegram delivery `PENDING` when paid; no Telegram call inside webhook.
- Idempotent full refund and reconciliation methods for uncertain/open/expired states.
- No real provider calls in tests; inject/mock fetch boundary minimally.

**Acceptance:** Focused tests prove valid/invalid/stale signature, duplicate and reordered events, amount/currency mismatch, Checkout idempotency, VND amount, refund idempotency, and secret/error redaction. TypeScript for changed code is clean when integrated with generated Prisma client.

**Focused check:**
```bash
cd services/auth-service && node node_modules/jest/bin/jest.js --runInBand src/modules/localmate-payments/tests
```

**Stop:** missing frozen contract, need to alter schema/package/secret/live provider, destructive action, or scope expansion. Ask coordinator through Orca; otherwise continue until `DONE` or concrete `BLOCKED`.
